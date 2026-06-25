/**
 * Hit flash system — 玩家 / Boss / 敌人受击时给材质做短暂高亮 tint。
 *
 * 工作流程：
 *  - 新对象上场：`prepareMaterials(obj)` 把材质 clone（标记 OWNED_CLONE_KEY），
 *    并记下基色 / 自发光基色到 `userData.HIT_FLASH_BASE_*` —— 这样 tint 时
 *    可以 `mix(base, tintColor)`，恢复时直接 `copy(base)`。
 *  - 受击驱动：业务层把 `damageEvent.weaponType` / `hitFlashColor` 喂进
 *    `setEnemyTint` / `setBossTint` / `triggerPlayer`，本类只负责：
 *      1) 把 tint 应用到对象的所有材质；
 *      2) 记账（每个对象当前 tint key），同 key 重复请求不写材质。
 *  - 玩家：还多一个倒计时 `playerTimer`，由 caller 在 animate() 里递减并在归零时
 *    `setPlayerTint(mesh, undefined)` 复原。
 *
 * 本类不持有 `playerMesh` / `enemyObjects` 引用，所有需要操作的 Object3D 通过参数传入。
 */

import * as THREE from 'three';
import type { DamageEvent } from '@minigame/core';
import { OWNED_CLONE_KEY } from '../materials/disposeOwned.ts';
import { applyStylizedToonShading } from '../materials/toon.ts';

export type HitFlashMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
};

const HIT_FLASH_BASE_COLOR_KEY = '__hitFlashBaseColor';
const HIT_FLASH_BASE_EMISSIVE_KEY = '__hitFlashBaseEmissive';
/** mesh.userData：被换成染色材质前的原始（共享基础）材质数组，用于闪烁结束后还原。 */
const TINT_BASES_KEY = '__hitTintBases';
export const HIT_FLASH_TINT_INTENSITY = 0.88;
export const HIT_FLASH_EMISSIVE_STRENGTH = 0.2;
export const PLAYER_SHIELD_HIT_FLASH_COLOR = 0x9edcff;
export const PLAYER_HP_HIT_FLASH_COLOR = 0xff3333;
export const PLAYER_HIT_FLASH_DURATION = 0.18;

/** 兼容的"武器 → tint RGB"查表类型（线性空间 0..1）。 */
export type WeaponVfxColorTable = Record<string, [number, number, number]>;

export class HitFlashSystem {
  /** Per-enemy 当前 tint key（null = 无 tint）。 */
  readonly enemyTints = new Map<number, string | null>();
  /** Boss 当前 tint key（null = 无 tint）。 */
  bossTint: string | null = null;
  /** 玩家受击残余时长（秒），由调用方每帧递减。 */
  playerTimer = 0;
  /** 玩家当前 tint key（null = 无 tint）。 */
  playerTint: number | null = null;

  private readonly scratch = new THREE.Color();

  /**
   * 敌人染色材质缓存：tintCache[基础材质][颜色key] = 一份共享的染色材质。
   *
   * 关键设计——按「(基础材质, 颜色)」共享，而不是「每只闪的怪一份」：
   *   同一种怪被同一武器（同色）打时，几十只可以共用同一份染色材质（颜色完全一致、视觉无差），
   *   各自只在 mesh 上把 material 引用 swap 过去。于是染色材质总数 ≈ 怪种数 × 出现过的武器色数
   *   （十几份），全部"一次创建、永久复用"——闪结束只是把 mesh.material 换回基础材质，不销毁、
   *   不归还、零再分配。
   *
   * 旧版"每只私有 + 池上限"在后期怪海里几乎每只可见怪都持续在闪 → 同时在闪数远超池容量 →
   * 超 cap 的染色材质被 dispose、下一帧又冷 clone → 稳态每帧十几次 clone()+needsUpdate →
   * getParameters/getProgramCacheKey churn（探针实测每帧约 12 个 MeshToonMaterial 被标脏）。
   * 共享后稳态 needsUpdate 归零。
   */
  private readonly tintCache = new Map<THREE.Material, Map<string, HitFlashMaterial>>();

  constructor(private readonly weaponVfxColors: WeaponVfxColorTable) {}

  /**
   * 给一个材质做"私有 clone + 缓存基色"。原材质共享（多怪同一份），clone 出来后
   * 改色不影响其它对象。同时把 stylized toon shader 重新挂一遍（clone 不会带 onBeforeCompile）。
   */
  cloneMaterial(mat: THREE.Material): THREE.Material {
    const cloned = mat.clone();
    cloned.userData[OWNED_CLONE_KEY] = true;

    if (cloned instanceof THREE.MeshToonMaterial) {
      delete cloned.userData['__stylized'];
      applyStylizedToonShading(cloned, cloned.name.startsWith('Weapon') ? 0.35 : 0, true);
      cloned.needsUpdate = true;
    }

    const tintable = cloned as HitFlashMaterial;
    if (tintable.color) {
      cloned.userData[HIT_FLASH_BASE_COLOR_KEY] = tintable.color.clone();
    }
    if (tintable.emissive) {
      cloned.userData[HIT_FLASH_BASE_EMISSIVE_KEY] = tintable.emissive.clone();
    }
    return cloned;
  }

  /** 遍历对象，把所有 mesh 材质换成 clone + 缓存基色（用于"私有 tint"）。 */
  prepareMaterials(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => this.cloneMaterial(mat));
      } else {
        mesh.material = this.cloneMaterial(mesh.material);
      }
    });
  }

  /** 把对象上现有材质的基色 / 基自发光缓存进 userData（不 clone，复用玩家共享材质）。 */
  cacheBases(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const tintable = mat as HitFlashMaterial;
        if (tintable.color && !mat.userData[HIT_FLASH_BASE_COLOR_KEY]) {
          mat.userData[HIT_FLASH_BASE_COLOR_KEY] = tintable.color.clone();
        }
        if (tintable.emissive && !mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY]) {
          mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY] = tintable.emissive.clone();
        }
      }
    });
  }

  /**
   * 把 tint 应用到对象的所有 mesh 材质（mix 基色 → tint）。
   * - 给了 hitFlashColor → 用它（hex int）；
   * - 给了 weaponType → 从 `weaponVfxColors` 查表；
   * - 两者都没给 → 还原为基色（取消 tint）。
   */
  applyTint(root: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const vfxColor = hitFlashColor !== undefined
      ? this.scratch.setHex(hitFlashColor)
      : weaponType
        ? this.weaponVfxColors[weaponType]
        : undefined;
    if (Array.isArray(vfxColor)) this.scratch.setRGB(vfxColor[0], vfxColor[1], vfxColor[2]);

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        const tintable = mat as HitFlashMaterial;
        const baseColor = mat.userData[HIT_FLASH_BASE_COLOR_KEY] as THREE.Color | undefined;
        if (tintable.color && baseColor) {
          if (vfxColor) {
            tintable.color.copy(baseColor).lerp(this.scratch, HIT_FLASH_TINT_INTENSITY);
          } else {
            tintable.color.copy(baseColor);
          }
        }

        const baseEmissive = mat.userData[HIT_FLASH_BASE_EMISSIVE_KEY] as THREE.Color | undefined;
        if (tintable.emissive && baseEmissive) {
          if (vfxColor) {
            tintable.emissive.copy(this.scratch).multiplyScalar(HIT_FLASH_EMISSIVE_STRENGTH);
          } else {
            tintable.emissive.copy(baseEmissive);
          }
        }
      }
    });
  }

  /** tint 去重 / 缓存用的颜色 key（与 setEnemyTint 的记账 key 一致）。null = 无 tint。 */
  private tintKeyFor(weaponType?: string, hitFlashColor?: number): string | null {
    return hitFlashColor !== undefined ? `color:${hitFlashColor}` : (weaponType ?? null);
  }

  /**
   * 取「(基础材质, 颜色key)」对应的共享染色材质：缓存命中直接返回（零分配），
   * 未命中才 clone 一次基础材质、挂回 stylized、按基色 mix 目标色后永久缓存。
   * 由于同 key 的颜色恒定，染色材质的 color/emissive 只在创建时写一次，之后帧帧复用。
   */
  private getSharedTint(base: THREE.Material, key: string, color: THREE.Color): HitFlashMaterial {
    let byColor = this.tintCache.get(base);
    if (!byColor) { byColor = new Map(); this.tintCache.set(base, byColor); }
    let tint = byColor.get(key);
    if (!tint) {
      tint = this.createTintMaterial(base);
      const baseColor = (base as HitFlashMaterial).color;
      if (tint.color && baseColor) tint.color.copy(baseColor).lerp(color, HIT_FLASH_TINT_INTENSITY);
      if (tint.emissive) tint.emissive.copy(color).multiplyScalar(HIT_FLASH_EMISSIVE_STRENGTH);
      byColor.set(key, tint);
    }
    return tint;
  }

  /**
   * 克隆基础材质做染色材质。clone() 不带 onBeforeCompile，故对 toon 材质重新挂一遍 stylized
   * （与 cloneMaterial 同款），customProgramCacheKey 相同 → 复用已编译 program。仅在某「(base,色)」
   * 组合首次出现时调用一次（之后永久缓存复用），故 needsUpdate 只触发一次、不再 churn。
   */
  private createTintMaterial(base: THREE.Material): HitFlashMaterial {
    const tint = base.clone() as HitFlashMaterial;
    tint.userData = {};
    if (tint instanceof THREE.MeshToonMaterial) {
      applyStylizedToonShading(tint, tint.name.startsWith('Weapon') ? 0.35 : 0, true);
    }
    tint.userData[OWNED_CLONE_KEY] = true;
    return tint;
  }

  /**
   * 敌人染色（共享基础材质 + 共享染色材质 swap 版）。
   * - 需要 tint：把该怪每个 mesh 的材质换成「(基础材质, 颜色key)」对应的共享染色材质
   *   （首次记下原基础材质到 userData）。
   * - 取消 tint：把材质换回基础材质（共享染色材质留在缓存里，不销毁）。
   * 平时所有同种怪共享同一基础材质；闪烁时同种怪 + 同色也共享同一份染色材质。
   */
  applyEnemyTint(root: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const key = this.tintKeyFor(weaponType, hitFlashColor);
    let hasColor = false;
    if (hitFlashColor !== undefined) {
      this.scratch.setHex(hitFlashColor);
      hasColor = true;
    } else if (weaponType) {
      const c = this.weaponVfxColors[weaponType];
      if (c) { this.scratch.setRGB(c[0], c[1], c[2]); hasColor = true; }
    }
    const tintOn = key !== null && hasColor;

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      let bases = mesh.userData[TINT_BASES_KEY] as THREE.Material[] | undefined;

      if (tintOn) {
        if (!bases) {
          // 首次进入闪烁：快照当前（共享）基础材质，供闪完还原。
          bases = Array.isArray(mesh.material) ? mesh.material.slice() : [mesh.material];
          mesh.userData[TINT_BASES_KEY] = bases;
        }
        if (bases.length === 1) {
          mesh.material = this.getSharedTint(bases[0], key, this.scratch);
        } else {
          const arr: THREE.Material[] = [];
          for (let i = 0; i < bases.length; i++) arr.push(this.getSharedTint(bases[i], key, this.scratch));
          mesh.material = arr;
        }
      } else if (bases) {
        // 取消 tint：换回基础材质（共享染色材质留缓存复用，不销毁）。
        mesh.material = bases.length === 1 ? bases[0] : bases;
        delete mesh.userData[TINT_BASES_KEY];
      }
    });
  }

  /** 设置敌人 tint（同 key 跳过；避免每帧重复写材质）。 */
  setEnemyTint(enemyId: number, obj: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const next = this.tintKeyFor(weaponType, hitFlashColor);
    if ((this.enemyTints.get(enemyId) ?? null) === next) return;
    this.enemyTints.set(enemyId, next);
    this.applyEnemyTint(obj, weaponType, hitFlashColor);
  }

  /** 设置 Boss tint（同 key 跳过）。 */
  setBossTint(obj: THREE.Object3D, weaponType?: string, hitFlashColor?: number): void {
    const next = hitFlashColor !== undefined ? `color:${hitFlashColor}` : (weaponType ?? null);
    if (this.bossTint === next) return;
    this.bossTint = next;
    this.applyTint(obj, weaponType, hitFlashColor);
  }

  /** 玩家受击瞬时高亮（重置倒计时 + 应用 tint）。color 是 hex int。 */
  triggerPlayer(playerMesh: THREE.Object3D, color: number): void {
    this.playerTimer = PLAYER_HIT_FLASH_DURATION;
    this.setPlayerTint(playerMesh, color);
  }

  /** 设置玩家 tint（同 key 跳过）。color=undefined 表示清除 tint（还原基色）。 */
  setPlayerTint(playerMesh: THREE.Object3D, color?: number): void {
    const next = color ?? null;
    if (this.playerTint === next) return;
    this.playerTint = next;
    this.applyTint(playerMesh, undefined, color);
  }

  /**
   * 在 `damageEvents` 里反向找一条与对象坐标最近的"非玩家受伤"事件，
   * 返回它的 `weaponType / hitFlashColor` —— 用于死亡瞬间保留正确的击杀者颜色。
   * 容忍 1.5m 的击退/渲染漂移。
   */
  findDeathTint(obj: THREE.Object3D, damageEvents: readonly DamageEvent[]): { weaponType?: string; hitFlashColor?: number } {
    let bestTint: { weaponType?: string; hitFlashColor?: number } = {};
    let bestDistSq = 2.25;

    for (let i = damageEvents.length - 1; i >= 0; i--) {
      const evt = damageEvents[i];
      if (evt.isPlayerDamage || (!evt.weaponType && evt.hitFlashColor === undefined)) continue;
      const dx = evt.x - obj.position.x;
      const dz = evt.z - obj.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        bestTint = { weaponType: evt.weaponType, hitFlashColor: evt.hitFlashColor };
      }
    }

    return bestTint;
  }
}
