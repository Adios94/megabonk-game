/**
 * 飞碟 / 传送门 系统。
 *
 * 设计文档：docs/boss-loop-redesign.md
 *
 * 状态机：
 *   ready          玩家未进入；玩家走进交互半径即自动开始召唤（无需按键）
 *     ↓ 玩家进入交互半径
 *   summoning      读条 `ALTAR_SUMMON_DURATION` 秒；走出半径时进度按
 *                  `ALTAR_SUMMON_DECAY_RATE` 缓慢回落，归零后才回 ready
 *     ↓ 读条满
 *   boss_active    Boss 已生成；飞碟锁住、不可再交互
 *     ↓ Boss 死亡（boss.hp <= 0），由外部系统翻转
 *   portal_ready   飞碟变传送门；UI 显示 `[E] 进入下一关`
 *     ↓ 玩家按 interact + 在半径内
 *   portal_used    终态；tier 推进流程会消费它（清掉或替换为下一关飞碟）
 *
 * 触发方式：
 *   - 召唤 Boss：玩家走进 ready 半径即自动进入 summoning（不再需要按键）
 *   - 进入传送门：玩家按下 interact 键，且当前在 portal_ready 半径内 → portal_used
 *
 * 副作用：
 *   - summoning 完成时不直接 spawn boss，而是把 phase 翻到 boss_active；
 *     由 spawning.checkBossSpawn() 检测后真正生成 boss。
 *   - portal_used 由 GameInstance 在 tick 末尾检测并触发 tier 推进。
 */
import { distanceBetween } from '../physics.ts';
import { pickRandomSubset } from '../spawnPick.ts';
import {
  ALTAR_BOSS_RESPAWN_COOLDOWN,
  ALTAR_SUMMON_DURATION,
  ALTAR_SUMMON_DECAY_RATE,
  ALTAR_INTERACT_RADIUS,
  ALTAR_MIN_DISTANCE,
  ALTAR_MAX_DISTANCE_RATIO,
  TIER_CONFIGS,
} from '../config.ts';
import { getTerrainHeightAt } from './collision.ts';
import type { LevelGeometry } from './collision.ts';
import type { AltarState, GameConfig } from '../types.ts';
import type { Engine } from './types.ts';

/** 飞碟贴地：用竖直查询求 (x,z) 处地表高度（台顶）。无 geo（如单测）回退 0。 */
function groundY(geo: LevelGeometry | undefined, x: number, z: number): number {
  if (!geo) return 0;
  const y = getTerrainHeightAt(geo, x, z);
  return Number.isFinite(y) ? y : 0;
}

interface AvoidPoint {
  x: number;
  z: number;
}

/**
 * 一局开始 / tier 推进时调用，按 tier 配置生成飞碟。
 * 位置：远离出生点（≥ ALTAR_MIN_DISTANCE）但在地图内（halfMap * ratio 内）。
 */
export function generateAltars(config: GameConfig, avoidNearestTo?: AvoidPoint, geo?: LevelGeometry): AltarState[] {
  const tierCfg = TIER_CONFIGS[config.tier];
  const count = tierCfg.teleporterCount;
  const altars: AltarState[] = [];

  // 关卡手摆了 spawn_altar → 排除离玩家出生点最近的点，再随机选 count 个。
  const placed = config.level?.spawnPoints?.altars;
  if (config.level) {
    if (!placed || placed.length === 0) return altars;
    const candidates = avoidNearestTo && placed.length > count
      ? placed.filter((point) => point !== nearestPoint(placed, avoidNearestTo))
      : placed;
    for (const point of pickRandomSubset(candidates, count)) {
      altars.push({
        x: point.x,
        z: point.z,
        y: groundY(geo, point.x, point.z),
        phase: 'ready',
        summonTimer: 0,
        summonDuration: ALTAR_SUMMON_DURATION,
      });
    }
    return altars;
  }

  const halfMap = config.mapSize * 0.4;
  const maxRadius = halfMap * ALTAR_MAX_DISTANCE_RATIO;
  const minRadius = ALTAR_MIN_DISTANCE;

  for (let i = 0; i < count; i++) {
    // 平均分布角度避免重叠，再加一点抖动
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.8;
    const distance = minRadius + Math.random() * Math.max(1, maxRadius - minRadius);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    altars.push({
      x,
      z,
      y: groundY(geo, x, z),
      phase: 'ready',
      summonTimer: 0,
      summonDuration: ALTAR_SUMMON_DURATION,
    });
  }
  return altars;
}

function nearestPoint<T extends AvoidPoint>(points: readonly T[], origin: AvoidPoint): T | undefined {
  let best: T | undefined;
  let bestDistSq = Infinity;
  for (const point of points) {
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      best = point;
      bestDistSq = distSq;
    }
  }
  return best;
}

/**
 * 每帧推进飞碟状态机。读 engine.input.interact 作为按键触发信号。
 *
 * 注意：本函数不直接生成 Boss / 触发 tier 推进。它只翻转 phase，副作用由：
 *   - spawning.checkBossSpawn 读 boss_active phase 来 spawn boss
 *   - GameInstance 读 portal_used 来触发下一关
 */
export function tickAltars(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;
  // 本帧 interact 是否为按下（边缘触发由 client 自己保证：每帧只在 keydown 边缘传一次 true）
  const interact = engine.input.interact === true;

  for (const altar of engine.state.altars) {
    const dist = distanceBetween(player.x, player.z, altar.x, altar.z);
    const inRange = dist < ALTAR_INTERACT_RADIUS;

    switch (altar.phase) {
      case 'ready': {
        // 进入交互半径即自动开始召唤（不再需要按 interact）。
        if (inRange) {
          altar.phase = 'summoning';
          altar.summonTimer = 0;
        }
        break;
      }
      case 'summoning': {
        if (!inRange) {
          // 走出半径 → 进度缓慢回落（不立刻消失）；归零后才回到 ready。
          altar.summonTimer -= dt * ALTAR_SUMMON_DECAY_RATE;
          if (altar.summonTimer <= 0) {
            altar.summonTimer = 0;
            altar.phase = 'ready';
          }
          break;
        }
        altar.summonTimer += dt;
        if (altar.summonTimer >= altar.summonDuration) {
          altar.phase = 'boss_active';
          altar.summonTimer = altar.summonDuration;
        }
        break;
      }
      case 'boss_active': {
        // 等 Boss 死亡：由 helpers.ts 的 checkGameOver 或 boss death hook 翻到 portal_ready
        break;
      }
      case 'cooldown': {
        altar.cooldownTimer = Math.max(0, (altar.cooldownTimer ?? 0) - dt);
        if (altar.cooldownTimer <= 0) {
          altar.phase = 'ready';
          altar.summonTimer = 0;
          altar.cooldownTimer = 0;
        }
        break;
      }
      case 'portal_ready': {
        if (inRange && interact) {
          altar.phase = 'portal_used';
        }
        break;
      }
      case 'portal_used': {
        // 终态；GameInstance 会在本帧或下帧消费它
        break;
      }
    }
  }
}

/**
 * Boss 死亡后调用：第一关把 boss_active 飞碟翻成 portal_ready；
 * 第二关及以后进入 cooldown，冷却结束后才能再次召唤，不再提供进入下一关的传送门。
 * 通常一局只会有一个 boss_active 飞碟（设计上每 tier 1 个），但代码上不假设。
 */
export function onBossDefeated(engine: Engine): void {
  for (const altar of engine.state.altars) {
    if (altar.phase === 'boss_active') {
      altar.summonTimer = 0;
      if ((engine.state.stage ?? 1) === 1) {
        altar.phase = 'portal_ready';
        altar.cooldownTimer = 0;
      } else {
        altar.phase = 'cooldown';
        altar.cooldownTimer = ALTAR_BOSS_RESPAWN_COOLDOWN;
        altar.cooldownDuration = ALTAR_BOSS_RESPAWN_COOLDOWN;
      }
    }
  }
}

/** 判断当前是否有任何飞碟进入了 summoning 完成态（boss_active），用于 spawning.checkBossSpawn。 */
export function hasReadyBossTrigger(engine: Engine): boolean {
  return engine.state.altars.some(a => a.phase === 'boss_active');
}

/** 判断玩家本帧是否消费了一个传送门（portal_used）。 */
export function consumePortalUsed(engine: Engine): boolean {
  const used = engine.state.altars.some(a => a.phase === 'portal_used');
  if (!used) return false;
  // 标记消费：清空 altars 列表，由 tier 推进流程稍后重生
  engine.state.altars = [];
  return true;
}
