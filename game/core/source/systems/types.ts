/**
 * Engine —— Phase 6 facade 化的运行时容器。
 *
 * GameInstance 把所有内部状态打包成 Engine 实例，每个 system 函数 (`systems/*.ts`)
 * 接受 `engine: Engine` + `dt: number` 参数, mutate engine 内字段。
 *
 * 这样 GameInstance 缩成 thin facade：构造 → start → 每帧 dispatch → 公开 API。
 */
import type { GameConfig, GameState, InputState } from '../types.ts';
import type { GameWorld } from '../world.ts';
import type { AiEffects } from '../ai/types.ts';
import type { SpatialHash } from '../spatial-hash.ts';
import type { LevelGeometry } from './collision.ts';

export interface Engine {
  // ─── 核心状态 ───
  state: GameState;
  config: GameConfig;
  /** 当前帧 input 快照（applyAction 写入，systems 读取） */
  input: InputState;

  // ─── 子系统 ───
  world: GameWorld;
  effects: AiEffects;
  spatialHash: SpatialHash;
  /** 当前关卡几何（碰撞 / 高度查询） */
  geo: LevelGeometry;

  // ─── 计数器 / 自增 ID（systems 内 mutate）───
  nextEnemyId: number;
  nextProjectileId: number;
  nextPickupId: number;
  nextChestId: number;
  /** 区域特效自增 id（毒气云 / 涟漪 / 灼地痕迹 / 激光线）。 */
  nextAreaEffectId: number;

  // ─── 时序 / 帧间状态 ───
  spawnTimer: number;
  chestRespawnTimer: number;
  /** 最近完整开启的一组 3 个 chest spawn key；补刷时暂不回池。 */
  chestLockedSpawnKeys: string[];
  /** 正在累计的新开 chest spawn key；满 3 个后替换 locked 组。 */
  chestPendingSpawnKeys: string[];
  /** 错峰组 0..3, 每帧末 cycle. ranged/chase 行为用 (i % 4 === aiGroup) 错峰 */
  aiGroup: number;
  miniBossTimer: number;
  landingTimer: number;
  /** Edge detection: 上一帧 dash 输入（jumpPressed = 当前 ∧ ¬lastDashInput） */
  lastDashInput: boolean;
  /** Edge detection: 上一帧 jump 输入 */
  lastJumpInput: boolean;
  /** 玩家朝向 (停步时保留, 射击 / dash 沿用) */
  facingX: number;
  facingZ: number;
}
