/**
 * 区域特效渲染（gas_cloud / void_ripple / scorch_trail / ray_beam）。
 *
 * - 按 id 维护 mesh：state.areaEffects 每帧扫描，新增即创建、消失即移除。
 * - 对象池（按 kind 分池，上限 {@link AREA_EFFECT_POOL_CAP_PER_KIND}）：避免反复
 *   create + dispose；超出池容量才真正释放 geometry/material。
 * - 每帧更新位置 / 半径 / 透明度（透明度跟 lifetime/maxLifetime 线性衰减）；
 *   gas_cloud / scorch_trail / ray_beam 还有子层 mesh 单独驱动（呼吸 / 抖动）。
 *
 * 依赖：scene、BillboardPool（贴图 + 顶层 billboard 火光）、ParticlePool（gas 细粒子）。
 * 注意：贴图是 BillboardPool 共享缓存，dispose 时不释放贴图本身。
 */

import * as THREE from 'three';
import type { GameState } from '@minigame/core';
import { BillboardPool } from './BillboardPool.ts';
import { ParticlePool } from './ParticlePool.ts';
import { applyCelShade } from './celShading.ts';

type AreaEffect = GameState['areaEffects'][number];

/** 同 kind 对象池容量：超过即真正 dispose，避免长尾内存累积。 */
export const AREA_EFFECT_POOL_CAP_PER_KIND = 8;

export class AreaEffectVfx {
  private readonly objects = new Map<number, THREE.Object3D>();
  private readonly pool = new Map<string, THREE.Object3D[]>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly billboards: BillboardPool,
    private readonly particles: ParticlePool,
  ) {}

  /**
   * 每帧驱动区域特效：
   * - 扫 state.areaEffects 创建/复用 mesh，按 kind 走不同 update（位置 / scale / opacity / 子层）。
   * - 失活的特效进对象池（按 kind 分池），超 cap 才 dispose。
   */
  update(state: GameState, eventsFresh = true): void {
    const live = new Set<number>();

    for (const ae of state.areaEffects) {
      live.add(ae.id);
      let obj = this.objects.get(ae.id);
      const ratio = ae.maxLifetime > 0 ? Math.max(0, ae.lifetime / ae.maxLifetime) : 1;

      if (!obj) {
        const kindPool = this.pool.get(ae.kind);
        obj = kindPool ? kindPool.pop() : undefined;
        if (!obj) {
          obj = this.create(ae);
          obj.userData['aeKind'] = ae.kind;
          this.scene.add(obj);
        }
        obj.visible = true;
        this.objects.set(ae.id, obj);
      }

      switch (ae.kind) {
        case 'ray_beam': {
          const dx = ae.dirX ?? 0, dz = ae.dirZ ?? 1;
          const len = ae.length ?? 40;
          obj.position.set(ae.x + dx * len * 0.5, ae.y + 1.0, ae.z + dz * len * 0.5);
          obj.rotation.set(0, Math.atan2(dx, dz), 0);
          const w = (ae.width ?? 0.5) * 0.625;
          obj.scale.set(w, w, len);
          const flicker = 0.82 + Math.random() * 0.18;
          for (const child of (obj as THREE.Group).children) {
            const cm = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
            if (!cm) continue;
            const base = 1.0;
            cm.opacity = base * ratio * flicker;
          }
          break;
        }
        case 'gas_cloud': {
          obj.position.set(ae.x, ae.y + 0.08, ae.z);
          obj.scale.setScalar(ae.radius);
          const group = obj as THREE.Group;
          const fill = group.children[0] as THREE.Mesh;
          const ring = group.children[1] as THREE.Mesh;
          if (fill && ring) {
            const fillMat = fill.material as THREE.MeshBasicMaterial;
            const ringMat = ring.material as THREE.MeshBasicMaterial;
            const pulse = 0.85 + Math.sin(state.tick * 0.12) * 0.15;
            fillMat.opacity = ratio * pulse;
            ringMat.opacity = ratio;
          }
          if (eventsFresh && state.tick % 6 === 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * ae.radius;
            this.billboards.spawn({
              texture: 'smoke',
              x: ae.x + Math.cos(a) * r, y: ae.y + 0.4, z: ae.z + Math.sin(a) * r,
              scale: ae.radius * 0.55, endScale: ae.radius * 0.95,
              lifetime: 1.4, opacity: ratio, opacityCurve: 'fadeOut',
              color: 0x5fbf32, rotation: Math.random() * Math.PI * 2,
              rotationSpeed: (Math.random() - 0.5) * 0.6, blending: 'normal',
            });
          }
          if (eventsFresh && state.tick % 3 === 0) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * ae.radius;
            this.particles.spawn(
              ae.x + Math.cos(a) * r, ae.y + 0.3 + Math.random() * 0.8, ae.z + Math.sin(a) * r,
              0, 0.3 + Math.random() * 0.4, 0,
              0.5, 0.5, 0.25, 0.7, 0.12,
            );
          }
          break;
        }
        case 'void_ripple': {
          obj.position.set(ae.x, ae.y + 1.0, ae.z);
          obj.scale.setScalar(Math.max(0.01, ae.radius));
          const group = obj as THREE.Group;
          const ripple = group.getObjectByName('void_ripple_base') as THREE.Mesh | null;
          const burst = group.getObjectByName('void_ripple_burst') as THREE.Mesh | null;
          // 不用 ratio 衰减 opacity：cel-shaded `alphaTest=0.5` 会在 ratio<0.5 时整片 pop。
          // 改为把"消失"全部交给 ae.radius 反向缩回（core 的 retracting 阶段会驱动），
          // 视觉上波"塌回原点"，opacity 保持满。
          if (ripple) {
            const m = ripple.material as THREE.MeshBasicMaterial;
            m.opacity = 1.0;
          }
          if (burst) {
            const m = burst.material as THREE.MeshBasicMaterial;
            // 内层补色环仍保留缓慢自转 + 弱脉动，但脉动幅度收紧以贴 alphaTest 阈值之上。
            const pulse = 0.85 + Math.sin(state.tick * 0.18) * 0.15;
            m.opacity = pulse;
            burst.rotation.z += 0.012;
          }
          break;
        }
        case 'scorch_trail': {
          obj.position.set(ae.x, ae.y + 0.06, ae.z);
          obj.scale.setScalar(Math.max(0.01, ae.radius));
          const burn = obj.getObjectByName('scorch_burn') as THREE.Mesh | null;
          const glow = obj.getObjectByName('scorch_glow') as THREE.Mesh | null;
          if (burn) (burn.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
          if (glow) {
            (glow.material as THREE.MeshBasicMaterial).opacity = ratio * ratio * 0.9;
          }
          break;
        }
      }
    }

    for (const [id, obj] of this.objects) {
      if (!live.has(id)) {
        const kind = obj.userData['aeKind'] as string | undefined;
        const pool = kind ? (this.pool.get(kind) ?? []) : null;
        if (pool && kind && pool.length < AREA_EFFECT_POOL_CAP_PER_KIND) {
          obj.visible = false;
          pool.push(obj);
          this.pool.set(kind, pool);
        } else {
          this.scene.remove(obj);
          obj.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose?.();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
            else mat?.dispose?.();
          });
        }
        this.objects.delete(id);
      }
    }
  }

  /**
   * 按 kind 构造对应特效 mesh（首次出现，或对象池被掏空时调用）：
   * - ray_beam: Group = 双交叉辉光 plane（light 贴图）+ 灼热核心 box，单位长度沿 z=1。
   * - gas_cloud: Group = 地面毒液斑（smoke）+ 边界毒环（scorch），半径 1。
   * - void_ripple: Group = 青色同心波纹 + 紫红色四向魔法尖环（补色叠加，尖环缓慢自转）。
   * - scorch_trail: Group = 暗橙焦土圆盘 + 加色发光放射层。
   * - default: 暗橙圆盘兜底。
   *
   * ray_beam 还会顺手 spawn 一次起点光斑（flare billboard）作开火点亮。
   */
  private create(ae: AreaEffect): THREE.Object3D {
    switch (ae.kind) {
      case 'ray_beam': {
        const group = new THREE.Group();

        // 长度方向多分段（24 段）：让 curved-world vertex shader 有足够顶点拟合球面。
        // 否则 4 顶点的长 plane 弯曲后是「角点贴球面、中段直线插值」，直线永远在凸球面下方，
        // 视觉上整条射线会从中段开始钻进弯曲地面。
        const LENGTH_SEGMENTS = 24;
        const makeGlowGeo = (lengthAxis: 'x' | 'y'): THREE.PlaneGeometry => {
          const g = lengthAxis === 'y'
            ? new THREE.PlaneGeometry(1, 1, 1, LENGTH_SEGMENTS)
            : new THREE.PlaneGeometry(1, 1, LENGTH_SEGMENTS, 1);
          const uv = g.attributes.uv as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) {
            if (lengthAxis === 'y') uv.setY(i, 0.5);
            else uv.setX(i, 0.5);
          }
          uv.needsUpdate = true;
          return g;
        };
        const makeGlow = (lengthAxis: 'x' | 'y'): THREE.Mesh => {
          const mat = new THREE.MeshBasicMaterial({
            map: this.billboards.textures.light, color: 0xff264d,
            transparent: true, opacity: 1.0,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
          });
          applyCelShade(mat);
          const mesh = new THREE.Mesh(makeGlowGeo(lengthAxis), mat);
          mesh.name = 'beam_glow';
          return mesh;
        };
        const glowH = makeGlow('y'); glowH.rotation.x = Math.PI / 2;
        const glowV = makeGlow('x'); glowV.rotation.y = Math.PI / 2;
        group.add(glowH, glowV);

        const coreMat = new THREE.MeshBasicMaterial({
          color: 0xffc2d2, transparent: true, opacity: 1.0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        applyCelShade(coreMat);
        // 长度方向（最后一个参数）多分段，理由同 makeGlowGeo。
        const core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 1, 1, LENGTH_SEGMENTS), coreMat);
        core.scale.set(0.28, 0.28, 1);
        core.name = 'beam_core';
        group.add(core);

        const mdx = ae.dirX ?? 0, mdz = ae.dirZ ?? 1;
        this.billboards.spawn({
          texture: 'flare',
          x: ae.x + mdx * 0.4, y: ae.y + 1.0, z: ae.z + mdz * 0.4,
          scale: 1.6, endScale: 2.4, lifetime: 0.28, opacity: 1.0,
          opacityCurve: 'fadeOut', color: 0xff3366, blending: 'additive',
        });

        return group;
      }
      case 'gas_cloud': {
        const group = new THREE.Group();

        const fillGeo = new THREE.PlaneGeometry(2, 2);
        const fillMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.smoke,
          color: 0x4faa2e, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
        });
        applyCelShade(fillMat);
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.renderOrder = 3;
        fill.name = 'gas_fill';
        group.add(fill);

        const ringGeo = new THREE.PlaneGeometry(2, 2);
        const ringMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.scorch,
          color: 0x7bff3a, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        applyCelShade(ringMat);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 4;
        ring.name = 'gas_ring';
        group.add(ring);

        return group;
      }
      case 'void_ripple': {
        const group = new THREE.Group();

        // 基础层：青色同心涟漪。
        const rippleGeo = new THREE.PlaneGeometry(2, 2);
        const rippleMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.void_ripple,
          color: 0x00ffff, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        applyCelShade(rippleMat);
        const ripple = new THREE.Mesh(rippleGeo, rippleMat);
        ripple.rotation.x = -Math.PI / 2;
        ripple.name = 'void_ripple_base';
        ripple.renderOrder = 3;
        group.add(ripple);

        // 叠加层：紫红色魔法光环 + 四方向尖角，与青色基础环形成补色对比。
        const burstGeo = new THREE.PlaneGeometry(2.4, 2.4);
        const burstMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.void_ring_burst,
          color: 0xc24bff, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        });
        applyCelShade(burstMat);
        const burst = new THREE.Mesh(burstGeo, burstMat);
        burst.rotation.x = -Math.PI / 2;
        burst.rotation.z = Math.random() * Math.PI * 2;
        burst.position.y = 0.02;
        burst.name = 'void_ripple_burst';
        burst.renderOrder = 4;
        group.add(burst);

        return group;
      }
      case 'scorch_trail': {
        const group = new THREE.Group();

        const scorchGeo = new THREE.CircleGeometry(1, 24);
        const scorchMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.scorch ?? null,
          color: 0x5a1f06, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
        });
        applyCelShade(scorchMat);
        const scorch = new THREE.Mesh(scorchGeo, scorchMat);
        scorch.rotation.x = -Math.PI / 2;
        scorch.renderOrder = 3;
        scorch.name = 'scorch_burn';
        group.add(scorch);

        const glowGeo = new THREE.PlaneGeometry(2, 2);
        const glowMat = new THREE.MeshBasicMaterial({
          map: this.billboards.textures.scorch ?? null,
          color: 0xff7a1a, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        applyCelShade(glowMat);
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.rotation.z = Math.random() * Math.PI * 2;
        glow.renderOrder = 4;
        glow.name = 'scorch_glow';
        group.add(glow);

        return group;
      }
      default: {
        const geo = new THREE.CircleGeometry(1, 20);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff6a1a, transparent: true, opacity: 1.0,
          side: THREE.DoubleSide, depthWrite: false,
        });
        applyCelShade(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
      }
    }
  }
}
