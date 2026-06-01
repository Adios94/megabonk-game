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
import type { PlayerState, EnemyState, BossState, WeaponState, WeaponType } from '../types.ts';
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
  ): void;
  /** 给 enemy 施加击退（同 GameInstance.applyKnockback 签名） */
  applyKnockback(enemy: EnemyState, fromX: number, fromZ: number): void;
  /** 累加 state.stats.damageDealt */
  addDamageDealt(amount: number): void;
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
