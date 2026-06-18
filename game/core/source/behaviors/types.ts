/**
 * 行为函数的 context 接口。
 *
 * **设计决策**（Phase 2 锁定）：
 * 行为只能读 `player / enemies / boss / weapon / def / stats`，
 * 副作用通过 `effects` 函数表（addDamageEvent / applyKnockback / addDamageDealt）。
 *
 * **不传整个 GameState** —— GameInstance 字段重命名只动 ctx 装配处，行为代码不变。
 * **不引入事件总线** —— YAGNI，直接 mutate enemies/boss 的 hp 是 Phase 2-3 期间的合理近路。
 *   Phase 4 enemies 迁移到 ECS 时再用 component mutation 替代。
 */
import type { PlayerState, EnemyState, BossState, WeaponState, WeaponType, ProjectileState, AreaEffectState } from '../types.ts';
import type { WeaponLevelStats } from '../config.ts';
import type { WeaponDef } from '../data/weapons.ts';
import type { GameWorld } from '../world.ts';

export interface BehaviorEffects {
  /** 推一条 damageEvent（同 GameInstance.addDamageEvent 签名） */
  addDamageEvent(
    x: number, y: number, z: number,
    damage: number,
    isCrit: boolean,
    isPlayerDamage: boolean,
    weaponType?: WeaponType,
    isShield?: boolean,
    hitFlashColor?: number,
  ): void;
  /** 给 enemy 施加击退（同 GameInstance.applyKnockback 签名）。
   *  `strengthMult` 可选，给特定来源额外击退倍率（默认 1）。 */
  applyKnockback(enemy: EnemyState, fromX: number, fromZ: number, strengthMult?: number): void;
  /** 累加伤害统计；玩家武器伤害可附带来源和目标，供 GM tool 归因。 */
  addDamageDealt(amount: number, weaponType?: WeaponType, target?: EnemyState | BossState): void;
  /**
   * 推一个投射物到 state.projectiles[]。返回分配的 id；
   * 达 MAX_PROJECTILES 上限时返回 null（行为应优雅 break / continue）。
   *
   * Defaults 由实现填充: id 自增, hitEnemyIds: [].
   * caller 提供其它字段, **包括 `fromPlayer`**（玩家武器: true, 敌人远程: false）。
   */
  spawnProjectile(p: Omit<ProjectileState, 'id' | 'hitEnemyIds'>): number | null;
  /**
   * 推一个区域特效到 state.areaEffects[]（毒气云 / 涟漪 / 灼地痕迹 / 激光线）。
   * 返回分配的 id；达 MAX_AREA_EFFECTS 上限时返回 null（不 spawn）。
   */
  spawnAreaEffect(a: Omit<AreaEffectState, 'id'>): number | null;
  /**
   * 查询当前场上属于某武器的「玩家环绕投射物」（fromPlayer && orbiting && weaponType 匹配），
   * 返回 **live 引用**，调用方可原地刷新其字段（damage / orbitRadius / lifetime…）。
   *
   * 用于「常驻刀环」类行为（orbitingAxe）做幂等校准：每次触发只补齐缺口 / 刷新现存，
   * 而不是每次都新 spawn 一波（避免投射物无限堆叠）。
   * 旧 mock / 测试不提供此方法时，行为退化为「每次 spawn 一整组」（单次调用语义不变）。
   */
  getPlayerOrbitProjectiles?(weaponType: WeaponType): ProjectileState[];
  /**
   * 羁绊命中钩子（可选）：羁绊内武器命中敌人、伤害已结算后调用，
   * 触发 T2/T3 机制（奥秘计数 / 导体连锁 / 易伤 / 烙印 / 神经毒素 / 击退冲击 / 余烬引爆）。
   * 旧测试 / mock 不提供此方法 → 行为零成本。
   */
  bondHit?(weaponType: WeaponType, target: EnemyState | BossState, damage: number, isCrit: boolean): void;
}

export interface BehaviorContext {
  /** 玩家状态，行为只读 */
  player: PlayerState;
  /** 敌人数组，行为可直接 mutate 元素的 hp / hitFlashTimer（Phase 4 迁移到 ECS 后会改） */
  enemies: EnemyState[];
  /** boss 状态（如有） */
  boss: BossState | null;
  /** 触发本次行为的武器实例 */
  weapon: WeaponState;
  /** 武器数据定义（tags / behavior id） */
  def: WeaponDef;
  /** 武器当前等级数值 */
  stats: WeaponLevelStats;
  /** 副作用函数表（闭包到 GameInstance 内部） */
  effects: BehaviorEffects;
}

export type BehaviorFn = (world: GameWorld, ctx: BehaviorContext) => void;
