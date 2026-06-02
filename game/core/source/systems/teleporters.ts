/**
 * 传送器 + 宝箱 系统。
 *
 * Teleporter (tier ≥ 2 才有, count 由 tier 配置)：
 *   - 时间到 + 没 boss 时随机生成 N 个（远离 player, halfMap*0.4 内）
 *   - 'available' → 玩家踏入 → 'activating'（站着读条 → 'activated'）
 *   - 离开重置回 'available'
 *   - 全部 'activated' 时由 spawning.checkBossSpawn 触发 boss 出场
 *
 * Chest (1 局开局生成 N 个, 互动半径内自动开启 + 加 silver)：
 *   - 玩家走近 < CHEST_INTERACT_RADIUS → opened=true, silver += reward
 */
import { distanceBetween } from '../physics.ts';
import {
  CHEST_COUNT,
  CHEST_INTERACT_RADIUS,
  CHEST_SILVER_MIN,
  CHEST_SILVER_MAX,
  TIER_CONFIGS,
  TELEPORTER_RADIUS,
  TELEPORTER_ACTIVATION_DURATION,
  TELEPORTER_APPEAR_TIME,
} from '../config.ts';
import type { ChestState, GameConfig } from '../types.ts';
import type { Engine } from './types.ts';

export function generateChests(config: GameConfig): ChestState[] {
  const chests: ChestState[] = [];
  const halfMap = config.mapSize * 0.4;
  for (let i = 0; i < CHEST_COUNT; i++) {
    const angle = (i / CHEST_COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 15 + Math.random() * halfMap * 0.5;
    chests.push({
      id: i + 1,
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      opened: false,
      reward: CHEST_SILVER_MIN + Math.floor(Math.random() * (CHEST_SILVER_MAX - CHEST_SILVER_MIN)),
    });
  }
  return chests;
}

export function tickChests(engine: Engine): void {
  const player = engine.state.player;
  if (!player.alive) return;
  for (const chest of engine.state.chests) {
    if (chest.opened) continue;
    const dist = distanceBetween(player.x, player.z, chest.x, chest.z);
    if (dist < CHEST_INTERACT_RADIUS) {
      chest.opened = true;
      engine.state.stats.silverEarned += chest.reward;
    }
  }
}

export function tickTeleporters(engine: Engine, dt: number): void {
  const player = engine.state.player;
  const tierCfg = TIER_CONFIGS[engine.config.tier];
  if (tierCfg.teleporterCount === 0) return;

  // 生成
  if (
    engine.state.teleporters.length < tierCfg.teleporterCount
    && engine.state.gameTime >= TELEPORTER_APPEAR_TIME
    && !engine.state.boss
  ) {
    while (engine.state.teleporters.length < tierCfg.teleporterCount) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 25 + Math.random() * 15;
      const tx = Math.cos(angle) * distance;
      const tz = Math.sin(angle) * distance;
      const halfMap = engine.config.mapSize * 0.4;

      engine.state.teleporters.push({
        x: Math.max(-halfMap, Math.min(halfMap, tx)),
        z: Math.max(-halfMap, Math.min(halfMap, tz)),
        phase: 'available',
        activationTimer: 0,
        activationDuration: TELEPORTER_ACTIVATION_DURATION,
      });
    }
  }

  // 状态机
  for (const tp of engine.state.teleporters) {
    if (tp.phase === 'available') {
      const dist = distanceBetween(player.x, player.z, tp.x, tp.z);
      if (dist < TELEPORTER_RADIUS) {
        tp.phase = 'activating';
        tp.activationTimer = 0;
      }
    } else if (tp.phase === 'activating') {
      const dist = distanceBetween(player.x, player.z, tp.x, tp.z);
      if (dist >= TELEPORTER_RADIUS) {
        // 走开 → 重置
        tp.phase = 'available';
        tp.activationTimer = 0;
      } else {
        tp.activationTimer += dt;
        if (tp.activationTimer >= tp.activationDuration) {
          tp.phase = 'activated';
        }
      }
    }
  }
}
