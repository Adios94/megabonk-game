/**
 * chests.{tickChests, generateChests} 单元测试.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tickChests, generateChests, spawnBossChest, spawnBossChests } from '../chests.ts';
import { makeEngine, makeBoss } from './_fixtures.ts';
import { CHEST_COUNT, CHEST_INTERACT_RADIUS, CHEST_INTERACT_MAX_Y_DELTA, CHEST_MAX_ACTIVE } from '../../config.ts';
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

  it('关卡无 chest 标记时不生成宝箱', () => {
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
    expect(chests).toHaveLength(0);
  });

  it('关卡 chestSpawns 随机抽取固定数量', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [
        { x: 5, z: 0 },
        { x: -5, z: 0 },
        { x: 0, z: 5 },
        { x: 0, z: -5 },
        { x: 10, z: 10 },
        { x: -10, z: -10 },
        { x: 12, z: 0 },
        { x: -12, z: 0 },
        { x: 14, z: 0 },
        { x: -14, z: 0 },
        { x: 16, z: 0 },
        { x: -16, z: 0 },
        { x: 18, z: 0 },
        { x: -18, z: 0 },
        { x: 20, z: 0 },
        { x: -20, z: 0 },
        { x: 22, z: 0 },
        { x: -22, z: 0 },
      ],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(CHEST_COUNT);
    expect(chests.every(c => c.y === 0)).toBe(true);
    const coords = chests.map(c => `${c.x},${c.z}`);
    expect(new Set(coords).size).toBe(CHEST_COUNT);
  });

  it('关卡 chestSpawns 会尽量分散并覆盖多个高度层', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [
        ...Array.from({ length: 12 }, (_, i) => ({ x: i * 10, y: 0, z: 0 })),
        ...Array.from({ length: 12 }, (_, i) => ({ x: i * 10, y: 8, z: 40 })),
      ],
    };
    const chests = generateChests(config);
    expect(chests).toHaveLength(CHEST_COUNT);
    expect(new Set(chests.map(c => c.y))).toEqual(new Set([0, 8]));
    for (let i = 0; i < chests.length; i++) {
      for (let j = i + 1; j < chests.length; j++) {
        const dx = chests[i].x - chests[j].x;
        const dz = chests[i].z - chests[j].z;
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('关卡 chestSpawns 会排除 5 个固定神殿保留点', () => {
    const reserved = [
      { x: -100, y: 0, z: -100 },
      { x: -100, y: 0, z: 100 },
      { x: 100, y: 0, z: -100 },
      { x: 100, y: 0, z: 100 },
      { x: 0, y: 0, z: 0 },
    ];
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [
        ...reserved,
        ...Array.from({ length: CHEST_COUNT }, (_, i) => ({ x: -45 + i * 10, y: 2, z: 20 })),
      ],
    };
    const chests = generateChests(config);
    const reservedKeys = new Set(reserved.map(p => `${p.x}:${p.y}:${p.z}`));
    expect(chests).toHaveLength(CHEST_COUNT);
    expect(chests.every(c => !reservedKeys.has(`${c.x}:${c.y ?? 0}:${c.z}`))).toBe(true);
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

  it('Boss 掉落宝箱不增加普通宝箱费用增长计数', () => {
    const engine = makeEngine();
    const bossChest: ChestState = { id: 9, x: 0, z: 0, opened: true, bossDrop: true };
    const target: ChestState = { id: 10, x: 0, z: 0, opened: false };
    engine.state.chests = [bossChest, target];
    const baseCost = getChestGoldCost(engine.state.player.level);
    engine.state.player.gold = baseCost;
    engine.input.interact = true;
    tickChests(engine);
    expect(target.opened).toBe(true);
    expect(engine.state.player.gold).toBe(0);
    expect(engine.state.pendingChestReward?.cost).toBe(baseCost);
  });

  it('Boss 掉落宝箱无需金币即可开启', () => {
    const engine = makeEngine();
    const bossChest: ChestState = { id: 9, x: 0, z: 0, opened: false, bossDrop: true };
    engine.state.chests = [bossChest];
    engine.state.player.gold = 0;
    engine.input.interact = true;
    tickChests(engine);
    expect(bossChest.opened).toBe(true);
    expect(engine.state.player.gold).toBe(0);
    expect(engine.state.pendingChestReward?.cost).toBe(0);
    expect(engine.state.pendingChestReward?.bossDrop).toBe(true);
  });

  it('Boss 掉落宝箱不占普通宝箱刷新上限', () => {
    const engine = makeEngine();
    engine.state.chests = [];
    for (let i = 0; i < CHEST_MAX_ACTIVE; i++) {
      engine.state.chests.push({ id: i + 1, x: 20 + i * 10, z: 0, opened: false });
    }
    spawnBossChest(engine, makeBoss(0, 0, 100));
    expect(engine.state.chests.filter(c => !c.opened && !c.bossDrop)).toHaveLength(CHEST_MAX_ACTIVE);
    expect(engine.state.chests.some(c => c.bossDrop)).toBe(true);
  });

  it('Boss 宝箱概率超过 100% 时整数部分保底，余数部分 roll 额外宝箱', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.39);
    const engine = makeEngine();
    engine.state.chests = [];
    const boss = makeBoss(0, 0, 100);
    boss.chestDropChance = 3.4;

    const chests = spawnBossChests(engine, boss);

    expect(chests).toHaveLength(4);
    expect(chests.every(c => c.bossDrop)).toBe(true);
    expect(new Set(chests.map(c => c.id)).size).toBe(4);
    vi.restoreAllMocks();
  });

  it('Boss 宝箱最多掉落 5 个', () => {
    const engine = makeEngine();
    engine.state.chests = [];
    const boss = makeBoss(0, 0, 100);
    boss.chestDropChance = 9.4;

    const chests = spawnBossChests(engine, boss);

    expect(chests).toHaveLength(5);
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

  it('玩家在高处平台（y 差超过容差）时不能开启下方宝箱', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, y: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.y = CHEST_INTERACT_MAX_Y_DELTA + 1;
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(false);
    expect(engine.state.chestOpenEvents).toHaveLength(0);
  });

  it('玩家与宝箱在容差内的高度差仍可开启', () => {
    const engine = makeEngine();
    const chest: ChestState = { id: 1, x: 0, y: 0, z: 0, opened: false };
    engine.state.chests = [chest];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.y = CHEST_INTERACT_MAX_Y_DELTA - 0.1;
    engine.state.player.gold = getChestGoldCost(engine.state.player.level);
    engine.input.interact = true;
    tickChests(engine);
    expect(chest.opened).toBe(true);
  });

  it('关卡模式保持 10 个未开启宝箱，并按每 3 个开启点轮换回池', () => {
    const engine = makeEngine();
    engine.config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: Array.from({ length: 50 }, (_, i) => ({ x: i * 4, z: 0 })),
    };
    engine.state.chests = engine.config.level.chestSpawns.slice(0, CHEST_COUNT).map((p, i) => ({
      id: i + 1,
      x: p.x,
      y: 0,
      z: p.z,
      opened: false,
    }));
    engine.nextChestId = 11;

    const openAt = (index: number) => {
      const chest = engine.state.chests.find(c => !c.opened && c.x === index * 4)!;
      engine.state.player.x = chest.x;
      engine.state.player.z = chest.z;
      engine.state.player.gold = 99999;
      engine.input.interact = true;
      tickChests(engine, 0);
      engine.state.phase = 'playing';
      engine.state.pendingChestReward = null;
      engine.input.interact = false;
      tickChests(engine, 0);
    };

    openAt(0);
    openAt(1);
    openAt(2);

    expect(engine.state.chests.filter(c => !c.opened)).toHaveLength(CHEST_COUNT);
    expect(engine.chestLockedSpawnKeys).toEqual(['0:0:0', '4:0:0', '8:0:0']);
    const activeKeysAfterFirstBatch = engine.state.chests
      .filter(c => !c.opened)
      .map(c => `${c.x}:${c.z}`);
    expect(activeKeysAfterFirstBatch).not.toContain('0:0');
    expect(activeKeysAfterFirstBatch).not.toContain('4:0');
    expect(activeKeysAfterFirstBatch).not.toContain('8:0');

    openAt(3);
    openAt(4);
    openAt(5);

    expect(engine.chestLockedSpawnKeys).toEqual(['12:0:0', '16:0:0', '20:0:0']);
    expect(engine.chestPendingSpawnKeys).toHaveLength(0);
  });
});
