/**
 * AI 路径 parity 测试 —— Phase 4a 核心保险.
 *
 * 同一 seed 下旧路径 (updateEnemiesAI) 和新路径 (tickEnemyAi via useEcsAi=true)
 * 必须产出完全等价的 enemy 状态. 任何漂移意味着 random 消费顺序 / 状态机
 * 计算 / 边界 clamp 等出现 parity 缺口.
 *
 * 策略：
 *  - 用 mulberry32 喂同一 seed 给两条路径
 *  - GameInstance 启动后塞 fixture enemies (不调 spawnEnemies, 隔离 spawn 噪音)
 *  - 60 tick (1 秒) 跑完, 只比较 enemy 关键字段
 *
 * 三种场景：
 *  1. 4 个 chase enemies 围 player
 *  2. 1 个 charge enemy 完整 windup→strike→cooldown 循环
 *  3. 1 个 dive enemy 完整 flying→diving→landing→rising
 *
 * Phase 4c 删除时, 本文件随 useEcsAi flag 一起删 —— 但 git history 永久保留作 bisect 锚点.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GameInstance } from '../GameInstance.ts';
import { DEFAULT_GAME_CONFIG } from '../config.ts';
import type { EnemyState, EnemyType, EnemyBehavior } from '../types.ts';
import { mulberry32 } from './_prng.ts';
import { tickEnemyAi } from '../systems/aiSystem.ts';

function fixtureEnemy(
  id: number,
  type: EnemyType,
  x: number,
  z: number,
  overrides: Partial<EnemyState> = {},
): EnemyState {
  const behaviorByType: Record<EnemyType, EnemyBehavior> = {
    skeleton_soldier: 'chase',
    zombie: 'chase',
    skeleton_archer: 'ranged',
    skeleton_knight: 'charge',
    necromancer: 'ranged',
    gargoyle: 'dive',
  };
  return {
    id, type,
    x, y: type === 'gargoyle' ? 3 : 0, z,
    hp: 100, maxHp: 100,
    speed: 3, damage: 5,
    behavior: behaviorByType[type],
    isElite: false, isMiniBoss: false,
    hitFlashTimer: 0,
    attackCooldown: 0, attackCooldownMax: 1.5,
    targetX: 0, targetZ: 0,
    chargeState: 'idle', chargeTimer: 0, chargeTargetX: 0, chargeTargetZ: 0,
    summonCooldown: 0,
    orbitAngle: 0, orbitTimer: 0,
    diveState: 'flying', diveTimer: 0,
    ...overrides,
  };
}

/**
 * 启动一个 GameInstance, 把它的 enemies 替换为 fixture, 然后只跑 AI tick (绕过
 * spawn / weapons / collision 以隔离噪音).
 */
function setupAndTickAI(
  enemies: () => EnemyState[],
  ticks: number,
  useEcsAi: boolean,
  seed: number,
): EnemyState[] {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));

  const g = new GameInstance(DEFAULT_GAME_CONFIG);
  g.start();
  g.useEcsAi = useEcsAi;

  // 替换 enemies
  const state = (g as any).state;
  state.enemies = enemies();

  const dt = 1 / 60;
  for (let i = 0; i < ticks; i++) {
    // 直接跑 AI 路径, 不走 tick() 整套（隔离 spawn / weapons / collision）
    if (useEcsAi) {
      tickEnemyAi(state.enemies, (g as any).makeAiContext(dt));
    } else {
      (g as any).updateEnemiesAI(dt);
    }
    // 仍需要 attackCooldown / hitFlashTimer 倒计时 (legacy 在 updateTimers)
    for (const e of state.enemies) {
      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
    }
    // 错峰循环（与 tick() 一致）
    (g as any).aiGroup = ((g as any).aiGroup + 1) % 4;
  }

  return state.enemies;
}

function snapshot(e: EnemyState) {
  return {
    id: e.id, type: e.type,
    x: e.x, y: e.y, z: e.z,
    hp: e.hp,
    targetX: e.targetX, targetZ: e.targetZ,
    chargeState: e.chargeState, chargeTimer: e.chargeTimer,
    diveState: e.diveState, diveTimer: e.diveTimer,
    attackCooldown: e.attackCooldown,
    summonCooldown: e.summonCooldown,
  };
}

function expectParity(legacy: EnemyState[], ecs: EnemyState[]) {
  expect(ecs.length).toBe(legacy.length);
  for (let i = 0; i < legacy.length; i++) {
    const a = snapshot(legacy[i]);
    const b = snapshot(ecs[i]);
    // 浮点容差 1e-9
    expect(b.id).toBe(a.id);
    expect(b.type).toBe(a.type);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
    expect(b.hp).toBe(a.hp);
    expect(b.targetX).toBeCloseTo(a.targetX, 6);
    expect(b.targetZ).toBeCloseTo(a.targetZ, 6);
    expect(b.chargeState).toBe(a.chargeState);
    expect(b.chargeTimer).toBeCloseTo(a.chargeTimer, 6);
    expect(b.diveState).toBe(a.diveState);
    expect(b.diveTimer).toBeCloseTo(a.diveTimer, 6);
    expect(b.attackCooldown).toBeCloseTo(a.attackCooldown, 6);
    expect(b.summonCooldown).toBeCloseTo(a.summonCooldown, 6);
  }
}

describe('AI parity: legacy vs ECS (60 tick)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('4 个 chase 敌人围绕 player', () => {
    const fx = () => [
      fixtureEnemy(1, 'skeleton_soldier', 5, 0),
      fixtureEnemy(2, 'skeleton_soldier', -5, 0),
      fixtureEnemy(3, 'zombie', 0, 5),
      fixtureEnemy(4, 'zombie', 0, -5),
    ];
    const legacy = setupAndTickAI(fx, 60, false, 42);
    const ecs = setupAndTickAI(fx, 60, true, 42);
    expectParity(legacy, ecs);
  });

  it('1 个 skeleton_knight 完整 charge 循环 (60 tick = 1 sec)', () => {
    const fx = () => [
      fixtureEnemy(1, 'skeleton_knight', 8, 0, {
        speed: 3.5, damage: 20, hp: 120, attackCooldownMax: 2.0,
      }),
    ];
    const legacy = setupAndTickAI(fx, 60, false, 7);
    const ecs = setupAndTickAI(fx, 60, true, 7);
    expectParity(legacy, ecs);
  });

  it('1 个 gargoyle 完整 dive 状态机', () => {
    const fx = () => [
      fixtureEnemy(1, 'gargoyle', 3, 0, {
        speed: 4, damage: 25, hp: 200, attackCooldownMax: 3.0,
        attackCooldown: 0,  // 立即触发 dive
      }),
    ];
    const legacy = setupAndTickAI(fx, 60, false, 13);
    const ecs = setupAndTickAI(fx, 60, true, 13);
    expectParity(legacy, ecs);
  });

  it('mixed: chase + ranged + charge', () => {
    const fx = () => [
      fixtureEnemy(1, 'skeleton_soldier', 4, 4),
      fixtureEnemy(2, 'skeleton_archer', 9, 0, { attackCooldownMax: 3 }),
      fixtureEnemy(3, 'skeleton_knight', 7, -3, { attackCooldownMax: 2 }),
    ];
    const legacy = setupAndTickAI(fx, 60, false, 100);
    const ecs = setupAndTickAI(fx, 60, true, 100);
    expectParity(legacy, ecs);
  });
});
