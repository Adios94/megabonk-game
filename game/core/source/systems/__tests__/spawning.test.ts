/**
 * spawning.{tickSpawning, checkBossSpawn} 单元测试.
 *
 * 重点：
 *  - boss_fight 阶段不刷怪
 *  - finalSwarm 标志 (gameTime 480-540)
 *  - mini-boss 每 120 秒一只 (gameTime ≥ 180)
 *  - Boss 起场 = 必须有祭坛进入 boss_active（按 E 召唤完成），与时间无关
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tickSpawning, checkBossSpawn } from '../spawning.ts';
import { makeEngine, makePlayer } from './_fixtures.ts';
import { ALTAR_SUMMON_DURATION, REGULAR_GAME_DURATION } from '../../config.ts';

describe('tickSpawning', () => {
  afterEach(() => vi.restoreAllMocks());

  it('boss_fight 阶段不刷怪', () => {
    const engine = makeEngine();
    engine.state.phase = 'boss_fight';
    engine.state.gameTime = 30;
    tickSpawning(engine, 0.05);
    expect(engine.state.enemies).toHaveLength(0);
  });

  it('boss_intro 阶段也不刷怪', () => {
    const engine = makeEngine();
    engine.state.phase = 'boss_intro';
    tickSpawning(engine, 0.05);
    expect(engine.state.enemies).toHaveLength(0);
  });

  it('spawnTimer > 0 时 only 倒计时', () => {
    const engine = makeEngine();
    engine.state.gameTime = 5;  // wave 0
    engine.spawnTimer = 1.0;
    tickSpawning(engine, 0.1);
    expect(engine.spawnTimer).toBeCloseTo(0.9, 5);
    expect(engine.state.enemies).toHaveLength(0);
  });

  it('spawnTimer ≤ 0 时刷一组怪', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);  // 固定 random
    const engine = makeEngine();
    engine.state.gameTime = 5;
    engine.spawnTimer = -0.1;
    tickSpawning(engine, 0.05);
    // wave 0 group [1,3], random=0.5 → groupSize ≈ 2
    expect(engine.state.enemies.length).toBeGreaterThan(0);
    expect(engine.state.enemies.length).toBeLessThanOrEqual(3);
    expect(engine.spawnTimer).toBeGreaterThan(0);
  });

  it('关卡模式只从 spawn_enemy_* Empty 点刷怪', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const engine = makeEngine();
    engine.config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {
        enemyZones: {
          spawn_enemy: [{ x: 12, z: -8 }],
        },
      },
      chestSpawns: [],
    };
    engine.state.gameTime = 5;
    engine.spawnTimer = -0.1;
    tickSpawning(engine, 0.05);
    expect(engine.state.enemies.length).toBeGreaterThan(0);
    expect(engine.state.enemies.every(e => e.x === 12 && e.z === -8)).toBe(true);
  });

  it('关卡模式没有 spawn_enemy_* Empty 时不回退随机刷怪', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const engine = makeEngine();
    engine.config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [],
    };
    engine.state.gameTime = 5;
    engine.spawnTimer = -0.1;
    tickSpawning(engine, 0.05);
    expect(engine.state.enemies).toHaveLength(0);
  });

  it('finalSwarm 时间窗 (480-540) 设 finalSwarm=true', () => {
    const engine = makeEngine();
    engine.state.gameTime = 500;
    engine.spawnTimer = 0;  // 触发刷怪
    tickSpawning(engine, 0.05);
    expect(engine.state.finalSwarm).toBe(true);
  });

  it('finalSwarm 外 finalSwarm=false', () => {
    const engine = makeEngine();
    engine.state.gameTime = 200;
    tickSpawning(engine, 0.05);
    expect(engine.state.finalSwarm).toBe(false);
  });

  it('gameTime ≥ 180 推 miniBossTimer (满 120 触发)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);  // 选第一个 enemy type
    const engine = makeEngine();
    engine.state.gameTime = 200;
    engine.miniBossTimer = 119;  // 立刻触发
    tickSpawning(engine, 1.5);  // > 1, miniBossTimer >= 120
    // mini-boss 应该被 spawn（isMiniBoss=true）
    const miniBoss = engine.state.enemies.find(e => e.isMiniBoss);
    expect(miniBoss).toBeDefined();
    expect(engine.miniBossTimer).toBe(0);
  });

  it('curse_tome 加快 spawn (interval ×0.9 per level)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const player = makePlayer({ tomes: [{ type: 'curse_tome', level: 2 }] });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    engine.state.gameTime = 5;  // wave 0 spawnInterval = 2.0
    engine.spawnTimer = 0;
    tickSpawning(engine, 0.05);
    // 2.0 * (1 - 2*0.1) = 1.6
    expect(engine.spawnTimer).toBeCloseTo(1.6, 4);
  });

  it('达 maxAlive 时不再 spawn', () => {
    const engine = makeEngine();
    engine.state.gameTime = 5;
    // wave 0 maxAlive=30, 填满
    engine.state.enemies = Array.from({ length: 30 }, (_, i) => ({
      id: i, type: 'skeleton_soldier' as const, x: 0, y: 0, z: 0,
      hp: 10, maxHp: 10, speed: 3, damage: 5,
      behavior: 'chase' as const, isElite: false, isMiniBoss: false,
      hitFlashTimer: 0, attackCooldown: 0, attackCooldownMax: 1.5,
      targetX: 0, targetZ: 0,
      aiPhase: 0, // AI错峰相位
      chargeState: 'idle' as const, chargeTimer: 0, chargeTargetX: 0, chargeTargetZ: 0,
      summonCooldown: 0, orbitAngle: 0, orbitTimer: 0,
      diveState: 'flying' as const, diveTimer: 0,
    }));
    engine.spawnTimer = 0;
    tickSpawning(engine, 0.05);
    expect(engine.state.enemies).toHaveLength(30);
  });
});

describe('checkBossSpawn', () => {
  it('boss 已存在时不重复 spawn', () => {
    const engine = makeEngine();
    engine.state.boss = { x: 0, y: 0, z: 0, hp: 100, maxHp: 100, phase: 1, currentAttack: 'idle', attackTimer: 0, attackCooldown: 0, hitFlashTimer: 0, speed: 3, enraged: false };
    engine.state.altars = [{
      x: 0, z: 0, phase: 'boss_active', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    checkBossSpawn(engine);
    expect(engine.state.boss.hp).toBe(100);  // 没改
  });

  it('victory / defeat 阶段不 spawn', () => {
    const engine = makeEngine();
    engine.state.phase = 'victory';
    engine.state.altars = [{
      x: 0, z: 0, phase: 'boss_active', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    checkBossSpawn(engine);
    expect(engine.state.boss).toBeNull();
  });

  it('没有 boss_active 祭坛 → 不 spawn（即使时间已过去）', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 1 };
    engine.state.gameTime = REGULAR_GAME_DURATION + 60;  // 久过去
    engine.state.altars = [{
      x: 0, z: 0, phase: 'ready', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    checkBossSpawn(engine);
    expect(engine.state.boss).toBeNull();
  });

  it('有 boss_active 祭坛 → boss spawn + phase=boss_intro + 清场', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, tier: 1 };
    engine.state.altars = [{
      x: 5, z: 7, phase: 'boss_active', summonTimer: ALTAR_SUMMON_DURATION, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    checkBossSpawn(engine);
    expect(engine.state.boss).not.toBeNull();
    expect(engine.state.phase).toBe('boss_intro');
    expect(engine.state.enemies).toHaveLength(0);
    // Boss 出场点应该贴近触发祭坛
    expect(engine.state.boss!.x).toBeCloseTo(5);
    expect(engine.state.boss!.z).toBeCloseTo(7);
  });

  it('Boss 绑定触发祭坛，忽略旧 spawn_boss 标记', () => {
    const engine = makeEngine();
    engine.config = {
      ...engine.config,
      tier: 1,
      level: {
        collisionRects: [],
        walls: [],
        climbVolumes: [],
        ramps: [],
        spawnPoints: {
          bosses: [{ x: 20, z: 30 }],
        },
        chestSpawns: [],
      },
    };
    engine.state.altars = [{
      x: 5, z: 7, phase: 'boss_active', summonTimer: ALTAR_SUMMON_DURATION, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    checkBossSpawn(engine);
    expect(engine.state.boss!.x).toBeCloseTo(5);
    expect(engine.state.boss!.z).toBeCloseTo(7);
  });
});
