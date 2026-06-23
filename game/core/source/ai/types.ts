/**
 * AI 系统的类型契约。
 *
 * 每帧 `aiSystem.tickEnemyAi(enemies, ctx)` 给每个 enemy 派发：
 *   1. brain (必须): chase / ranged / charge / dive
 *   2. modifier (可选): necromancer / ...
 *
 * 副作用通过 `ctx.effects` 函数表（spawnProjectile / spawnEnemyByType / damagePlayer / ...）。
 */
import type { PlayerState, EnemyState, BossState, EnemyType } from '../types.ts';
import type { BehaviorEffects } from '../behaviors/types.ts';
import type { LevelGeometry } from '../systems/levelGeometry.ts';

export interface AiEffects extends BehaviorEffects {
  /**
   * 创建一个 enemy 实体（妖术师召唤 / boss summon_wave 用），自动 push 到 state.enemies[]。
   * 达 MAX_ENEMIES 上限时返回 null。
   */
  spawnEnemyByType(
    type: EnemyType,
    x: number,
    z: number,
    opts?: { mode?: 'wave' | 'miniBoss' | 'necromancerSummon' | 'bossSummon' },
  ): EnemyState | null;
  /**
   * 给玩家施加伤害（boss attacks 用）。处理 armor / shield_tome 减免 / 无敌帧 /
   * damageEvent / damageTaken 累加 / 死亡判定。Caller 不需要重复这些逻辑。
   */
  damagePlayer(damage: number): void;
}

export interface AiContext {
  /** 玩家状态（行为只读） */
  player: PlayerState;
  /** 敌人数组（行为可直接 mutate 元素的 hp/x/z/state machine 字段） */
  enemies: EnemyState[];
  /** boss 状态（如有） */
  boss: BossState | null;
  /** 这一帧的 dt（秒） */
  dt: number;
  /** 当前游戏时间（秒），某些行为需要（如 ranged enemy 检查 firstAppear） */
  gameTime: number;
  /** 地图边界（半径），用于 clamp 移动 */
  mapSize: number;
  /** 当前帧错峰组（0..3），用于 ranged 等只在某些组内重算 target */
  aiGroup: number;
  /** Final Swarm 阶段（gameTime 480-540），所有敌人 +30% speed */
  finalSwarm: boolean;
  /** 地形高度查询（玩家平台几何） —— 非 gargoyle 敌人 y 跟随地形 */
  getTerrainHeight(x: number, z: number): number;
  /** 当前关卡几何（横向阻挡 / climb 等查询用，与 engine.geo 同一份） */
  geo: LevelGeometry;
  /** 副作用函数表 */
  effects: AiEffects;
}

/**
 * Brain 行为函数：每帧对一个 enemy 调一次。
 *
 * @param i 该 enemy 在 `ctx.enemies` 数组中的索引（用于 `(i % 4) === aiGroup` 错峰）
 */
export type EnemyBehaviorFn = (enemy: EnemyState, ctx: AiContext, i: number) => void;

/**
 * Modifier 函数：每帧 brain 之后调一次（如果 def.modifier 不为空）。
 * 用于叠加在 brain 之上的额外行为，例如 necromancer 在 ranged brain 之上加召唤逻辑。
 */
export type EnemyModifierFn = (enemy: EnemyState, ctx: AiContext) => void;
