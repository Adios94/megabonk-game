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

export class WeaponTransientVfx {
  readonly lightningFlashLight: THREE.PointLight;

  private readonly slashSectors: SlashSector[] = [];
  private readonly lightningBolts: LightningBolt[] = [];
  private flameRingDisk: THREE.Group | null = null;
  private flameRingLayers: THREE.Mesh[] = [];
  private flameRingTime = 0;

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
   * 使用 BillboardPool 的 `slash_fill` 贴图作为放射纹理（RingGeometry UV = 径向映射）。
   * 0.18s 生命，由 {@link updateTransient} 渐隐回收。
   */
  spawnSlashSector(x: number, y: number, z: number, angle: number, range: number): void {
    const thetaLength = Math.PI * 0.944;
    const thetaSegs = 48;
    const phiSegs = 8;
    const geo = new THREE.RingGeometry(0.2, range, thetaSegs, phiSegs, -thetaLength / 2, thetaLength);

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

    const SLASH_SECTOR_TEXTURE: VfxTextureKey = 'slash_fill';
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
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = angle - Math.PI / 2;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.slashSectors.push({ mesh, life: 0.18, maxLife: 0.18, baseOpacity: 1.0 });
  }

  /**
   * 闪电杆：双层贴图面片（白热芯 + 蓝边外晕）+ 地面冲击环 + 14 颗火花。
   *
   * 闪光定位 + 强度调到常驻共享 `lightningFlashLight`，由 {@link updateTransient} 每帧驱动衰减
   * （flicker 通过镜像翻转贴图模拟跳变；面片仅绕 Y 朝相机）。
   */
  spawnLightningBolt(x: number, y: number, z: number): void {
    const height = 8;
    const maxLife = 0.25;

    const tex = this.billboards.textures.lightning ?? null;
    const makeBolt = (width: number, color: number, opacity: number, name: string): THREE.Mesh => {
      const geo = new THREE.PlaneGeometry(width, height);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y + height / 2, z);
      mesh.name = name;
      if (Math.random() < 0.5) mesh.scale.x = -1;
      return mesh;
    };

    const glow = makeBolt(3.4, 0x66bbff, 1.0, 'LightningGlow');
    const core = makeBolt(1.7, 0xffffff, 1.0, 'LightningCore');

    this.lightningFlashLight.position.set(x, y + 0.5, z);
    this.lightningFlashLight.intensity = 6;

    const ringGeo = new THREE.RingGeometry(0.3, 0.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.02, z);
    ring.name = 'LightningRing';

    this.scene.add(glow);
    this.scene.add(core);
    this.scene.add(ring);

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

  /** Lazy-create 火环 Group（含一层柔光晕 plane），首次返回时已加入 scene。 */
  ensureFlameRingDisk(): THREE.Group {
    if (this.flameRingDisk) return this.flameRingDisk;
    const group = new THREE.Group();
    group.name = 'FlameRingDisk';
    group.rotation.x = -Math.PI / 2;

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: this.billboards.textures.flame_aura ?? null,
      color: 0xff6a22,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(planeGeo, mat);
    group.add(mesh);

    this.flameRingLayers = [mesh];
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
      disk.position.set(playerX, playerY + 0.05, playerZ);
      this.flameRingTime += dt;
      const breathe = 1 + Math.sin(this.flameRingTime * 4) * 0.04;
      const size = (flameRingRadius * 2 / FLAME_AURA_TIP_NORM) * breathe;
      const star = this.flameRingLayers[0];
      if (star) {
        star.scale.set(size, size, 1);
        star.rotation.z = this.flameRingTime * 0.6;
        (star.material as THREE.MeshBasicMaterial).opacity = 1;
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
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
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
        e.core.geometry.dispose();
        (e.core.material as THREE.Material).dispose();
        e.glow.geometry.dispose();
        (e.glow.material as THREE.Material).dispose();
        e.ring.geometry.dispose();
        (e.ring.material as THREE.Material).dispose();
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
