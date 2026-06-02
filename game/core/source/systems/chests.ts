/**
 * 宝箱系统：开局生成 N 个，玩家走近自动开启 + 加 silver。
 * （从 systems/teleporters.ts 拆出来；旧文件已变成 deprecated 兼容 shim。）
 */
import { distanceBetween } from '../physics.ts';
import {
  CHEST_COUNT,
  CHEST_INTERACT_RADIUS,
  CHEST_SILVER_MIN,
  CHEST_SILVER_MAX,
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
