/**
 * teleporters.{tickChests, tickTeleporters, generateChests} 单元测试.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tickChests,
  tickTeleporters,
  generateChests,
} from '../teleporters.ts';
import { makeEngine } from './_fixtures.ts';
import {
  CHEST_COUNT,
  CHEST_INTERACT_RADIUS,
  TELEPORTER_RADIUS,
  TELEPORTER_ACTIVATION_DURATION,
  TELEPORTER_APPEAR_TIME,
} from '../../config.ts';
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
    engine.state.player.z = 0;  // 在 chest 上
    tickChests(engine);
    expect(chest.opened).toBe(true);
    expect(engine.state.stats.silverEarned).toBe(50);
  });

  it('远离不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false, reward: 50 };
    engine.state.chests = [chest];
    engine.state.player.x = 100;  // 远离
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

describe('tickTeleporters', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('tier 1 (teleporterCount=0) 完全不动', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 1 };
    engine.state.gameTime = TELEPORTER_APPEAR_TIME + 10;
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters).toHaveLength(0);
  });

  it('tier 2 + 时间到 + 没 boss → 生成传送器', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 2 };
    engine.state.gameTime = TELEPORTER_APPEAR_TIME + 10;
    engine.state.boss = null;
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters.length).toBeGreaterThan(0);
  });

  it('available → 玩家踏入 → activating', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 2 };
    engine.state.teleporters = [{
      x: 0, z: 0, phase: 'available',
      activationTimer: 0, activationDuration: TELEPORTER_ACTIVATION_DURATION,
    }];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters[0].phase).toBe('activating');
  });

  it('activating 倒计时到 → activated', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 2 };
    engine.state.teleporters = [{
      x: 0, z: 0, phase: 'activating',
      activationTimer: TELEPORTER_ACTIVATION_DURATION - 0.01,
      activationDuration: TELEPORTER_ACTIVATION_DURATION,
    }];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters[0].phase).toBe('activated');
  });

  it('activating 时离开 → 重置 available', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 2 };
    engine.state.teleporters = [{
      x: 0, z: 0, phase: 'activating',
      activationTimer: 0.5, activationDuration: TELEPORTER_ACTIVATION_DURATION,
    }];
    engine.state.player.x = TELEPORTER_RADIUS + 5;  // 走开
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters[0].phase).toBe('available');
    expect(engine.state.teleporters[0].activationTimer).toBe(0);
  });

  it('boss 出现后不再生成新传送器', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 2 };
    engine.state.gameTime = TELEPORTER_APPEAR_TIME + 10;
    engine.state.boss = { x: 0, y: 0, z: 0, hp: 100, maxHp: 100, phase: 1, currentAttack: 'idle', attackTimer: 0, attackCooldown: 0, hitFlashTimer: 0, speed: 3, enraged: false };
    tickTeleporters(engine, 0.05);
    expect(engine.state.teleporters).toHaveLength(0);
  });
});
