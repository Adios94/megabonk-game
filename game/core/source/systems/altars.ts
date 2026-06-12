/**
 * 祭坛 / 传送门 系统。
 *
 * 设计文档：docs/boss-loop-redesign.md
 *
 * 状态机：
 *   ready          玩家未交互；进入半径时 UI 显示 `[E] 召唤 Boss`
 *     ↓ 玩家按 interact + 在交互半径内
 *   summoning      读条 `ALTAR_SUMMON_DURATION` 秒（防误触）；走出半径回 ready
 *     ↓ 读条满
 *   boss_active    Boss 已生成；祭坛锁住、不可再交互
 *     ↓ Boss 死亡（boss.hp <= 0），由外部系统翻转
 *   portal_ready   祭坛变传送门；UI 显示 `[E] 进入下一关`
 *     ↓ 玩家按 interact + 在半径内
 *   portal_used    终态；tier 推进流程会消费它（清掉或替换为下一关祭坛）
 *
 * 触发方式：
 *   - 召唤 Boss：玩家按下 interact 键，且当前在 ready 半径内 → 进入 summoning
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
  ALTAR_SUMMON_DURATION,
  ALTAR_INTERACT_RADIUS,
  ALTAR_MIN_DISTANCE,
  ALTAR_MAX_DISTANCE_RATIO,
  TIER_CONFIGS,
} from '../config.ts';
import type { AltarState, GameConfig } from '../types.ts';
import type { Engine } from './types.ts';

interface AvoidPoint {
  x: number;
  z: number;
}

/**
 * 一局开始 / tier 推进时调用，按 tier 配置生成祭坛。
 * 位置：远离出生点（≥ ALTAR_MIN_DISTANCE）但在地图内（halfMap * ratio 内）。
 */
export function generateAltars(config: GameConfig, avoidNearestTo?: AvoidPoint): AltarState[] {
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
    altars.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
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
 * 每帧推进祭坛状态机。读 engine.input.interact 作为按键触发信号。
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
        if (inRange && interact) {
          altar.phase = 'summoning';
          altar.summonTimer = 0;
        }
        break;
      }
      case 'summoning': {
        if (!inRange) {
          // 走出半径 → 取消
          altar.phase = 'ready';
          altar.summonTimer = 0;
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
 * Boss 死亡后调用：把所有 boss_active 的祭坛翻成 portal_ready。
 * 通常一局只会有一个 boss_active 祭坛（设计上每 tier 1 个），但代码上不假设。
 */
export function onBossDefeated(engine: Engine): void {
  for (const altar of engine.state.altars) {
    if (altar.phase === 'boss_active') {
      altar.phase = 'portal_ready';
      altar.summonTimer = 0;
    }
  }
}

/** 判断当前是否有任何祭坛进入了 summoning 完成态（boss_active），用于 spawning.checkBossSpawn。 */
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
