/**
 * chests.{tickChests, generateChests} 单元测试.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tickChests, generateChests } from '../chests.ts';
import { makeEngine } from './_fixtures.ts';
import { CHEST_COUNT, CHEST_INTERACT_RADIUS } from '../../config.ts';
import { getChestGoldCost } from '../relics.ts';
import type { ChestState } from '../../types.ts';

describe('generateChests', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('生成 CHEST_COUNT 个未开启 chest', () => {
    const config = makeEngine().config;
    const chests = generateChests(config);
    expect(chests).toHaveLength(CHEST_COUNT);
    for (const c of chests) {
      expect(c.opened).toBe(false);
    }
  });

  it('关卡 col_ 平台按每 20x20 单元生成 chest', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [{ cx: 0, cz: 0, halfW: 20, halfD: 20, height: 2, baseY: 1 }],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(4);
    expect(chests.every((c) => c.y === 2)).toBe(true);
  });

  it('关卡 surface chest 总数不超过 24 个', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [{ cx: 0, cz: 0, halfW: 60, halfD: 60, height: 0, baseY: -1 }],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(24);
  });

  it('level.chestSpawns 优先于表面采样', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [{ cx: 0, cz: 0, halfW: 60, halfD: 60, height: 0, baseY: -1 }],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [
        { x: 5, z: 0 },
        { x: -5, z: 0 },
        { x: 0, z: 5 },
      ],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(3);
    expect(chests.map(c => ({ x: c.x, z: c.z }))).toEqual([
      { x: 5, z: 0 },
      { x: -5, z: 0 },
      { x: 0, z: 5 },
    ]);
    expect(chests.every(c => c.y === 0)).toBe(true);
  });

  it('关卡 ramp_ 斜面会生成带坡面高度的 chest', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [{
        cx: 0,
        cz: 0,
        halfSlope: 5,
        halfPerp: 2.5,
        slopeDirX: 1,
        slopeDirZ: 0,
        lowY: 0,
        highY: 10,
      }],
      spawnPoints: {},
      chestSpawns: [],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(1);
    expect(chests[0].y).toBeGreaterThanOrEqual(0);
    expect(chests[0].y).toBeLessThanOrEqual(10);
  });
});

describe('tickChests', () => {
  it('玩家进入 CHEST_INTERACT_RADIUS 并按 interact 且金币足够 → 消耗金币并进入 chest_reward，但不立刻记录 relic', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(true);
    expect(chest.relicId).toBeDefined();
    expect(engine.state.player.gold).toBe(0);
    expect(engine.state.player.relicStacks[chest.relicId!]).toBeUndefined();
    expect(engine.state.phase).toBe('chest_reward');
    expect(engine.state.pendingChestReward?.relicId).toBe(chest.relicId);
    expect(engine.state.chestOpenEvents).toHaveLength(1);
  });

  it('远离不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.x = 100;
    engine.state.player.z = 100;
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(false);
    expect(engine.state.stats.silverEarned).toBe(0);
  });

  it('靠近但未按 interact 不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    tickChests(engine);
    expect(chest.opened).toBe(false);
  });

  it('金币不足不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.gold = getChestGoldCost(engine.state.player.level) - 1;
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(false);
    expect(engine.state.chestOpenEvents).toHaveLength(0);
  });

  it('费用随本关已开启宝箱数增长', () => {
    const engine = makeEngine();
    const target: ChestState = { id: 4, x: 0, z: 0, opened: false };
    engine.state.chests = [
      { id: 1, x: 10, z: 0, opened: true },
      { id: 2, x: 12, z: 0, opened: true },
      { id: 3, x: 14, z: 0, opened: true },
      target,
    ];
    const baseCost = getChestGoldCost(engine.state.player.level);
    const cost = getChestGoldCost(engine.state.player.level, 3);
    expect(cost).toBeGreaterThan(baseCost);
    engine.state.player.gold = cost;
    engine.input.interact = true;
    tickChests(engine);
    expect(target.opened).toBe(true);
    expect(engine.state.player.gold).toBe(0);
    expect(engine.state.pendingChestReward?.cost).toBe(cost);
  });

  it('已 opened 不重复 roll', () => {
    const engine = makeEngine();
    engine.state.chests = [{ id: 1, x: 0, z: 0, opened: true }];
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(engine.state.stats.silverEarned).toBe(0);
    expect(engine.state.chestOpenEvents).toHaveLength(0);
  });

  it('player 死时跳过', () => {
    const engine = makeEngine();
    engine.state.player.alive = false;
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(false);
  });

  it('在 interact radius 边缘 just outside 不开', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.x = CHEST_INTERACT_RADIUS + 0.1;
    engine.state.player.z = 0;
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(false);
  });
});
