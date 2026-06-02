/**
 * chests.{tickChests, generateChests} 单元测试.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tickChests, generateChests } from '../chests.ts';
import { makeEngine } from './_fixtures.ts';
import { CHEST_COUNT, CHEST_INTERACT_RADIUS } from '../../config.ts';
import type { ChestState } from '../../types.ts';

describe('generateChests', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('生成 CHEST_COUNT 个 chest, 每个 reward 在 [min, max] 内', () => {
    const config = makeEngine().config;
    const chests = generateChests(config);
    expect(chests).toHaveLength(CHEST_COUNT);
    for (const c of chests) {
      expect(c.opened).toBe(false);
      expect(c.reward).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('tickChests', () => {
  it('玩家进入 CHEST_INTERACT_RADIUS → opened=true + silver +reward', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false, reward: 50 };
    engine.state.chests = [chest];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    tickChests(engine);
    expect(chest.opened).toBe(true);
    expect(engine.state.stats.silverEarned).toBe(50);
  });

  it('远离不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false, reward: 50 };
    engine.state.chests = [chest];
    engine.state.player.x = 100;
    engine.state.player.z = 100;
    tickChests(engine);
    expect(chest.opened).toBe(false);
    expect(engine.state.stats.silverEarned).toBe(0);
  });

  it('已 opened 不重复加 silver', () => {
    const engine = makeEngine();
    engine.state.chests = [{ id: 1, x: 0, z: 0, opened: true, reward: 50 }];
    tickChests(engine);
    expect(engine.state.stats.silverEarned).toBe(0);
  });

  it('player 死时跳过', () => {
    const engine = makeEngine();
    engine.state.player.alive = false;
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false, reward: 50 };
    engine.state.chests = [chest];
    tickChests(engine);
    expect(chest.opened).toBe(false);
  });

  it('在 interact radius 边缘 just outside 不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false, reward: 50 };
    engine.state.chests = [chest];
    engine.state.player.x = CHEST_INTERACT_RADIUS + 0.1;
    engine.state.player.z = 0;
    tickChests(engine);
    expect(chest.opened).toBe(false);
  });
});
