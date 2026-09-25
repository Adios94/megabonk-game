/**
 * Engine —— Phase 6 facade 化的运行时容器。
 *
 * GameInstance 把所有内部状态打包成 Engine 实例，每个 system 函数 (`systems/*.ts`)
 * 接受 `engine: Engine` + `dt: number` 参数, mutate engine 内字段。
 *
 * 这样 GameInstance 缩成 thin facade：构造 → start → 每帧 dispatch → 公开 API。
 */
import type { BondId, EnemyState, GameConfig, GameState, InputState, WeaponType } from '../types.ts';
import type { GameWorld } from '../world.ts';
import type { AiEffects } from '../ai/types.ts';
import type { SpatialHash } from '../helpers/spatialHash.ts';
import type { LevelGeometry } from './levelGeometry.ts';

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
  /**
   * 与 spatialHash 同步重建的 id→enemy 索引。命中投射物 / AOE 等系统按 id O(1) 取敌人，
   * 取代 findEnemyById 的 O(n) 线性扫描。仅在 `ensureSpatialIndex` 内重填。
   */
  enemyById: Map<number, EnemyState>;
  /**
   * spatialHash + enemyById 最近一次重建对应的 `state.tick`。
   * `ensureSpatialIndex(engine)` 按这个去重，使同一 tick 内多次调用只 rebuild 一次。
   * 初值用 -1（永远不等于 state.tick=0），保证第一帧必 rebuild。
   */
  spatialIndexTick: number;
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
  /** 第二关及以后已召唤过的 boss 次数，用于递增血量 / 伤害 / 宝箱概率。 */
  stageTwoBossSummonCount: number;
  landingTimer: number;
  /** Edge detection: 上一帧 dash 输入（jumpPressed = 当前 ∧ ¬lastDashInput） */
  lastDashInput: boolean;
  /** Edge detection: 上一帧 jump 输入 */
  lastJumpInput: boolean;
  /** 玩家朝向 (停步时保留, 射击 / dash 沿用) */
  facingX: number;
  facingZ: number;
  /**
   * GM damage DPS 滚动窗口数据，不暴露给 client。
   *
   * 历史上每条命中都 push 一个 `{ time, damage }` 对象 —— 密集战斗时每秒数百次 alloc。
   * 改为并行 number 数组（times[] + damages[]）：push 仅写入两个 number，零对象 alloc。
   * 长度始终保持 times.length === damages.length。
   * head：滑动窗口已过期前缀的游标 —— 用游标推进代替每次 shift()（O(n) 重排 + backing 抖动），
   * 攒到一定量再用 copyWithin 一次性前移压实。
   */
  weaponDamageWindows: Partial<Record<WeaponType | `bond:${BondId}`, { times: number[]; damages: number[]; head: number }>>;
}
