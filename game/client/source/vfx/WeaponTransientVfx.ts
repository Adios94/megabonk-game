/**
 * 武器瞬态 VFX：剑气扇形、闪电杆、火环常驻光晕。
 *
 * - 剑气扇形 `spawnSlashSector`：与 `sweepArc` 命中区精确对齐的实心扇形底光（170°）。
 *   - 圆心=玩家 / 外缘=range / 顶点 alpha 双向羽化（角度 + 径向）。
 *   - 由 `updateTransient()` 渐隐回收。
 *
 * - 闪电杆 `spawnLightningBolt`：双层贴图面片（白热芯 + 蓝边外晕）+ 地面冲击环。
 *   - 闪光由常驻共享 PointLight 复用（光源数恒定，避免 shader 重编译）。
 *   - 由 `updateTransient()` 每帧更新 yaw 朝相机 / flicker 镜像 / 衰减。
 *
 * - 火环常驻光晕 `ensureFlameRingDisk()` + `updateFlameRing()`：lazy-create 一次，
 *   外缘对齐到 `aoeRadius`（plane 边长 = 2*radius / FLAME_AURA_TIP_NORM），
 *   缓慢自转 + 呼吸缩放。
 */

import * as THREE from 'three';
import { BillboardPool, type VfxTextureKey } from './BillboardPool.ts';
import { ParticlePool } from './ParticlePool.ts';
import { applyCelShade } from './celShading.ts';

/** 火环柔光贴图淡出到不可见的归一化半径（相对贴图半宽）。 */
export const FLAME_AURA_TIP_NORM = 0.85;

interface SlashSector {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  baseOpacity: number;
}

interface LightningBolt {
  core: THREE.Mesh;
  glow: THREE.Mesh;
  ring: THREE.Mesh;
  endX: number;
  endY: number;
  endZ: number;
  height: number;
  life: number;
  maxLife: number;
  flickerTimer: number;
}

/** slash 扇形 mesh 池容量上限；同屏并发剑气很少，32 足矣。 */
const SLASH_POOL_CAP = 32;
/** 闪电 rig（core+glow+ring 一组）池容量上限。 */
const LIGHTNING_POOL_CAP = 24;

interface LightningRig {
  core: THREE.Mesh;
  glow: THREE.Mesh;
  ring: THREE.Mesh;
}

export class WeaponTransientVfx {
  readonly lightningFlashLight: THREE.PointLight;

  private readonly slashSectors: SlashSector[] = [];
  private readonly lightningBolts: LightningBolt[] = [];
  private flameRingDisk: THREE.Group | null = null;
  private flameRingLayers: THREE.Mesh[] = [];
  private flameRingTime = 0;

  // ── VFX 对象池（避免每次挥砍/闪电 new Geometry + new Material 的 GC churn）──
  // slash 几何体按 range 量化缓存（range 是武器属性，离散且少，命中率极高）；
  // mesh+material 走对象池复用。原实现每挥一刀都建 RingGeometry+颜色缓冲+材质再 dispose，
  // 是后期 GC 毛刺的主要来源之一（堆采样实测 ~7% + RingGeometry 占比最高）。
  private readonly slashGeoCache = new Map<number, THREE.BufferGeometry>();
  private readonly slashMeshPool: THREE.Mesh[] = [];

  // 闪电几何体全部是固定尺寸（glow 3.4×8 / core 1.7×8 / ring 0.3-0.5），三块共享几何体只建一次；
  // core+glow+ring 作为一个 rig 整体走对象池复用其网格与材质。
  private lightningGlowGeo: THREE.BufferGeometry | null = null;
  private lightningCoreGeo: THREE.BufferGeometry | null = null;
  private lightningRingGeo: THREE.BufferGeometry | null = null;
  private readonly lightningRigPool: LightningRig[] = [];

  private readonly _lightningCamPos = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly billboards: BillboardPool,
    private readonly particles: ParticlePool,
  ) {
    // 常驻共享 PointLight：闪电频闪时只调强度 + 位置，避免动态增减光源触发 shader 重编译。
    this.lightningFlashLight = new THREE.PointLight(0x88ccff, 0, 10, 2);
    this.lightningFlashLight.name = 'LightningFlashLight';
    this.lightningFlashLight.visible = true;
    this.scene.add(this.lightningFlashLight);
  }

  /**
   * 剑气实心扇形（170°，与 `sweepArc` 命中区对齐）。
   *
   * 顶点 alpha 双向羽化：角度方向两侧 18%、径向外缘 30% 处淡出，消除硬边界。
   * 使用 BillboardPool 的 `portal_swirl` 贴图作为放射纹理（RingGeometry UV = 径向映射）。
   * 0.18s 生命，由 {@link updateTransient} 渐隐回收。
   */
  spawnSlashSector(x: number, y: number, z: number, angle: number, range: number): void {
    const geo = this.getSlashGeometry(range);
    const mesh = this.acquireSlashMesh();
    mesh.geometry = geo;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, angle - Math.PI / 2, 0);
    mesh.renderOrder = 2;
    mesh.visible = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
    if (!mesh.parent) this.scene.add(mesh);
    this.slashSectors.push({ mesh, life: 0.32, maxLife: 0.32, baseOpacity: 1.0 });
  }

  /**
   * 取（或惰性构建）某个 range 的剑气扇形几何体。
   * range 量化到 0.25m 一档作为缓存键 —— 武器 range 离散且变动稀少，命中率极高，
   * 几乎杜绝每次挥砍 new RingGeometry + 颜色缓冲 的分配。多个并发剑气可共享同一几何体。
   */
  private getSlashGeometry(range: number): THREE.BufferGeometry {
    const key = Math.max(0.25, Math.round(range * 4) / 4);
    const cached = this.slashGeoCache.get(key);
    if (cached) return cached;

    const thetaLength = Math.PI * 0.944;
    const thetaSegs = 48;
    const phiSegs = 8;
    const geo = new THREE.RingGeometry(0.2, key, thetaSegs, phiSegs, -thetaLength / 2, thetaLength);

    const ANG_FEATHER = 0.18;
    const OUT_FEATHER = 0.30;
    const colors = new Float32Array(geo.attributes.position.count * 4);
    let vi = 0;
    for (let j = 0; j <= phiSegs; j++) {
      const v = j / phiSegs;
      const fr = Math.min(1, (1 - v) / OUT_FEATHER);
      for (let i = 0; i <= thetaSegs; i++) {
        const u = i / thetaSegs;
        const fa = Math.min(1, Math.min(u, 1 - u) / ANG_FEATHER);
        const a = Math.max(0, fr) * Math.max(0, fa);
        colors[vi * 4 + 0] = 1;
        colors[vi * 4 + 1] = 1;
        colors[vi * 4 + 2] = 1;
        colors[vi * 4 + 3] = a;
        vi++;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.rotateX(-Math.PI / 2);
    this.slashGeoCache.set(key, geo);
    return geo;
  }

  /** 取一个剑气 mesh（池复用其 material；几何体由 spawn 时按 range 赋值）。 */
  private acquireSlashMesh(): THREE.Mesh {
    const pooled = this.slashMeshPool.pop();
    if (pooled) return pooled;

    const SLASH_SECTOR_TEXTURE: VfxTextureKey = 'portal_swirl';
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3aa0ff,
      map: this.billboards.textures[SLASH_SECTOR_TEXTURE] ?? null,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    applyCelShade(mat);
    // 占位几何体，spawn 时会按 range 覆盖为缓存几何体。
    return new THREE.Mesh(undefined, mat);
  }

  /** 取一个闪电 rig（core+glow+ring）；池为空时用共享几何体新建一组。 */
  private acquireLightningRig(): LightningRig {
    const pooled = this.lightningRigPool.pop();
    if (pooled) return pooled;

    const height = 8;
    if (!this.lightningGlowGeo) this.lightningGlowGeo = new THREE.PlaneGeometry(3.4, height);
    if (!this.lightningCoreGeo) this.lightningCoreGeo = new THREE.PlaneGeometry(1.7, height);
    if (!this.lightningRingGeo) this.lightningRingGeo = new THREE.RingGeometry(0.3, 0.5, 32);

    const tex = this.billboards.textures.spark ?? null;
    const makeBolt = (geo: THREE.BufferGeometry, color: number, name: string): THREE.Mesh => {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      applyCelShade(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      return mesh;
    };

    const glow = makeBolt(this.lightningGlowGeo, 0x66bbff, 'LightningGlow');
    const core = makeBolt(this.lightningCoreGeo, 0xffffff, 'LightningCore');

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    applyCelShade(ringMat);
    const ring = new THREE.Mesh(this.lightningRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'LightningRing';

    return { core, glow, ring };
  }

  /**
   * 闪电杆：双层贴图面片（白热芯 + 蓝边外晕）+ 地面冲击环 + 14 颗火花。
   *
   * 闪光定位 + 强度调到常驻共享 `lightningFlashLight`，由 {@link updateTransient} 每帧驱动衰减
   * （flicker 通过镜像翻转贴图模拟跳变；面片仅绕 Y 朝相机）。
   */
  spawnLightningBolt(x: number, y: number, z: number): void {
    const height = 8;
    const maxLife = 0.42;

    const { core, glow, ring } = this.acquireLightningRig();
    glow.position.set(x, y + height / 2, z);
    glow.scale.set(Math.random() < 0.5 ? -1 : 1, 1, 1);
    (glow.material as THREE.MeshBasicMaterial).opacity = 1.0;
    glow.visible = true;
    core.position.set(x, y + height / 2, z);
    core.scale.set(Math.random() < 0.5 ? -1 : 1, 1, 1);
    (core.material as THREE.MeshBasicMaterial).opacity = 1.0;
    core.visible = true;
    ring.position.set(x, y + 0.02, z);
    ring.scale.set(0.3, 0.3, 1);
    (ring.material as THREE.MeshBasicMaterial).opacity = 1.0;
    ring.visible = true;

    this.lightningFlashLight.position.set(x, y + 0.5, z);
    this.lightningFlashLight.intensity = 6;

    if (!glow.parent) this.scene.add(glow);
    if (!core.parent) this.scene.add(core);
    if (!ring.parent) this.scene.add(ring);

    this.lightningBolts.push({
      core, glow, ring,
      endX: x, endY: y, endZ: z, height,
      life: maxLife, maxLife,
      flickerTimer: 0.05,
    });

    const sparkCount = 14;
    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 4;
      const sg = 0.85 + Math.random() * 0.15;
      const sb = 1.0;
      const sr = 0.6 + Math.random() * 0.4;
      this.particles.spawn(
        x, y + 0.4, z,
        Math.cos(a) * speed, 4 + Math.random() * 3, Math.sin(a) * speed,
        1.4 + Math.random() * 0.6,
        0.3 + Math.random() * 0.2,
        sr, sg, sb,
      );
    }
  }

  /**
   * Lazy-create 火环 Group：外层柔光晕（橙红 light 染色）+ 内焰旋焰（黄色 flame_ring_inner）。
   * 内焰反向自转、略小尺寸，叠出"双层火环"的层次感。首次返回时已加入 scene。
   */
  ensureFlameRingDisk(): THREE.Group {
    if (this.flameRingDisk) return this.flameRingDisk;
    const group = new THREE.Group();
    group.name = 'FlameRingDisk';
    group.rotation.x = -Math.PI / 2;

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.billboards.textures.light ?? null,
      color: 0xff6a22,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    applyCelShade(mat);
    const mesh = new THREE.Mesh(planeGeo, mat);
    group.add(mesh);

    const innerMat = new THREE.MeshBasicMaterial({
      map: this.billboards.textures.flame_ring_inner ?? null,
      color: 0xffd230,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    applyCelShade(innerMat);
    const innerMesh = new THREE.Mesh(planeGeo, innerMat);
    innerMesh.position.z = 0.01;
    group.add(innerMesh);

    const outerMat = new THREE.MeshBasicMaterial({
      map: this.billboards.textures.flame_ring_outer ?? null,
      color: 0xff2a0a,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    applyCelShade(outerMat);
    const outerMesh = new THREE.Mesh(planeGeo, outerMat);
    outerMesh.position.z = 0.02;
    group.add(outerMesh);

    this.flameRingLayers = [mesh, innerMesh, outerMesh];
    this.scene.add(group);
    this.flameRingDisk = group;
    return group;
  }

  /**
   * 每帧驱动火环（若仍装备）：lazy-create disk → 同步位置/呼吸缩放/自转；
   * 未装备时隐藏。`flameRingRadius` 由调用方按 WEAPON_STATS 查表传入。
   */
  updateFlameRing(
    hasFlameRing: boolean,
    flameRingRadius: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    dt: number,
  ): void {
    if (hasFlameRing) {
      const disk = this.ensureFlameRingDisk();
      disk.visible = true;
      disk.position.set(playerX, playerY + 1.0, playerZ);
      this.flameRingTime += dt;
      const breathe = 1 + Math.sin(this.flameRingTime * 4) * 0.04;
      const size = (flameRingRadius * 2 / FLAME_AURA_TIP_NORM) * breathe;
      const star = this.flameRingLayers[0];
      if (star) {
        star.scale.set(size, size, 1);
        star.rotation.z = this.flameRingTime * 0.6;
        (star.material as THREE.MeshBasicMaterial).opacity = 1;
      }
      const inner = this.flameRingLayers[1];
      if (inner) {
        inner.scale.set(size, size, 1);
        inner.rotation.z = this.flameRingTime * 0.25;
        (inner.material as THREE.MeshBasicMaterial).opacity = 0.85 + Math.sin(this.flameRingTime * 6) * 0.1;
      }
      const outer = this.flameRingLayers[2];
      if (outer) {
        outer.scale.set(size, size, 1);
        outer.rotation.z = this.flameRingTime * 1.8;
        (outer.material as THREE.MeshBasicMaterial).opacity = 0.85 + Math.sin(this.flameRingTime * 8) * 0.12;
      }
    } else if (this.flameRingDisk) {
      this.flameRingDisk.visible = false;
    }
  }

  /**
   * 每帧驱动剑气 / 闪电衰减回收：
   * - slashSectors 渐隐到 life ≤ 0 即 dispose + 从 scene 移除。
   * - lightningBolts 同样寿命衰减，外加面片 yaw 朝相机 / flicker 镜像 / 地面环外扩；
   *   并把本帧最亮一道闪电的 (强度, 位置) 写到共享 `lightningFlashLight`。
   */
  updateTransient(dt: number, camera: THREE.Camera): void {
    for (let i = this.slashSectors.length - 1; i >= 0; i--) {
      const e = this.slashSectors[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.visible = false;
        // 几何体（按 range 缓存共享）与材质（随 mesh 复用）都不 dispose，回收 mesh 进池。
        if (this.slashMeshPool.length < SLASH_POOL_CAP) {
          this.slashMeshPool.push(e.mesh);
        } else {
          (e.mesh.material as THREE.Material).dispose();
        }
        this.slashSectors.splice(i, 1);
        continue;
      }
      const t = e.life / e.maxLife;
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = e.baseOpacity * t;
    }

    let flashIntensity = 0;
    let flashX = 0, flashY = 0, flashZ = 0;
    camera.getWorldPosition(this._lightningCamPos);
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const e = this.lightningBolts[i];
      e.life -= dt;
      e.flickerTimer -= dt;

      if (e.life <= 0) {
        this.scene.remove(e.core);
        this.scene.remove(e.glow);
        this.scene.remove(e.ring);
        e.core.visible = false;
        e.glow.visible = false;
        e.ring.visible = false;
        // 几何体共享、材质随 rig 复用，都不 dispose；rig 整组回收进池。
        if (this.lightningRigPool.length < LIGHTNING_POOL_CAP) {
          this.lightningRigPool.push({ core: e.core, glow: e.glow, ring: e.ring });
        } else {
          (e.core.material as THREE.Material).dispose();
          (e.glow.material as THREE.Material).dispose();
          (e.ring.material as THREE.Material).dispose();
        }
        this.lightningBolts.splice(i, 1);
        continue;
      }

      const t = e.life / e.maxLife;
      const inv = 1 - t;
      const fade = t * t;

      const yaw = Math.atan2(this._lightningCamPos.x - e.endX, this._lightningCamPos.z - e.endZ);
      e.core.rotation.y = yaw;
      e.glow.rotation.y = yaw;

      if (e.flickerTimer <= 0) {
        e.flickerTimer = 0.04 + Math.random() * 0.03;
        const flip = Math.random() < 0.5 ? -1 : 1;
        e.core.scale.x = Math.abs(e.core.scale.x) * flip;
        e.glow.scale.x = Math.abs(e.glow.scale.x) * flip;
      }

      const flick = 0.6 + Math.random() * 0.4;
      (e.core.material as THREE.MeshBasicMaterial).opacity = fade * flick;
      (e.glow.material as THREE.MeshBasicMaterial).opacity = fade * flick;

      const lit = 6 * fade;
      if (lit > flashIntensity) {
        flashIntensity = lit;
        flashX = e.endX;
        flashY = e.endY + 0.5;
        flashZ = e.endZ;
      }

      const ringScale = 0.3 + inv * 5;
      e.ring.scale.set(ringScale, ringScale, 1);
      (e.ring.material as THREE.MeshBasicMaterial).opacity = fade;
    }
    this.lightningFlashLight.intensity = flashIntensity;
    if (flashIntensity > 0) this.lightningFlashLight.position.set(flashX, flashY, flashZ);
  }
}
