/**
 * Boss AI 路径 parity 测试 —— Phase 4b 核心保险.
 *
 * 同一 seed 下旧路径 (updateBossAI) 和新路径 (tickBossAi via useEcsBossAi=true)
 * 必须产出完全等价的 boss + enemies + projectiles 状态.
 *
 * 与 enemy parity 不同的是, boss 攻击 windup 较长 (2.5-3.5 秒间隔), 60 tick 不够看一个完整
 * attack cycle. 用 120 tick (2 秒) 让 boss 至少触发 2-3 次 attack.
 *
 * Phase 4c 删除时, 本文件随 useEcsBossAi flag 一起删 —— 但 git history 永久保留作 bisect 锚点.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GameInstance } from '../GameInstance.ts';
import { DEFAULT_GAME_CONFIG } from '../config.ts';
import type { BossState } from '../types.ts';
import { mulberry32 } from './_prng.ts';
import { tickBossAi } from '../systems/bossAi.ts';

function makeFreshBoss(hpRatio: number): BossState {
  return {
    x: 5, y: 0, z: 0,
    hp: Math.round(2000 * hpRatio),
    maxHp: 2000,
    phase: 1,
    currentAttack: 'idle',
    attackTimer: 0,         // 立即触发第一次 attack
    attackCooldown: 0,
    hitFlashTimer: 0,
    speed: 3.0,
    enraged: false,
  };
}

function setupAndTickBoss(
  hpRatio: number,
  ticks: number,
  useEcsBossAi: boolean,
  seed: number,
): { boss: BossState; enemyCount: number; projectileCount: number } {
  vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));

  const g = new GameInstance(DEFAULT_GAME_CONFIG);
  g.start();
  g.useEcsAi = false;     // 关掉 enemy AI 隔离干扰
  g.useEcsBossAi = useEcsBossAi;

  const state = (g as any).state;
  state.boss = makeFreshBoss(hpRatio);
  state.phase = 'boss_fight';

  // 确保 player 在 boss 视线内（否则 dark_bolt 无方向）
  state.player.x = 0;
  state.player.z = 0;

  const dt = 1 / 60;
  for (let i = 0; i < ticks; i++) {
    if (useEcsBossAi) {
      tickBossAi(state.boss, (g as any).makeAiContext(dt));
    } else {
      (g as any).updateBossAI(dt);
    }
  }

  return {
    boss: state.boss,
    enemyCount: state.enemies.length,
    projectileCount: state.projectiles.length,
  };
}

function expectBossParity(
  legacy: ReturnType<typeof setupAndTickBoss>,
  ecs: ReturnType<typeof setupAndTickBoss>,
) {
  expect(ecs.boss.x).toBeCloseTo(legacy.boss.x, 5);
  expect(ecs.boss.z).toBeCloseTo(legacy.boss.z, 5);
  expect(ecs.boss.hp).toBe(legacy.boss.hp);
  expect(ecs.boss.phase).toBe(legacy.boss.phase);
  expect(ecs.boss.speed).toBe(legacy.boss.speed);
  expect(ecs.boss.enraged).toBe(legacy.boss.enraged);
  expect(ecs.boss.currentAttack).toBe(legacy.boss.currentAttack);
  expect(ecs.boss.attackTimer).toBeCloseTo(legacy.boss.attackTimer, 5);
  expect(ecs.boss.attackCooldown).toBeCloseTo(legacy.boss.attackCooldown, 5);
  expect(ecs.enemyCount).toBe(legacy.enemyCount);
  expect(ecs.projectileCount).toBe(legacy.projectileCount);
}

describe('Boss AI parity: legacy vs ECS (120 tick)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('phase 1 (full hp): melee/slam/dark_bolt 池', () => {
    const a = setupAndTickBoss(1.0, 120, false, 11);
    const b = setupAndTickBoss(1.0, 120, true, 11);
    expectBossParity(a, b);
  });

  it('phase 2 (50% hp): summon_wave / charge / dark_bolt 出现', () => {
    const a = setupAndTickBoss(0.5, 120, false, 22);
    const b = setupAndTickBoss(0.5, 120, true, 22);
    expectBossParity(a, b);
  });

  it('phase 3 (25% hp enraged): aoe_explosion / dark_rain', () => {
    const a = setupAndTickBoss(0.25, 120, false, 33);
    const b = setupAndTickBoss(0.25, 120, true, 33);
    expectBossParity(a, b);
  });

  it('seed 多样性: 5 个不同 seed 都 parity', () => {
    for (const seed of [1, 7, 42, 100, 999]) {
      const a = setupAndTickBoss(0.5, 120, false, seed);
      const b = setupAndTickBoss(0.5, 120, true, seed);
      expectBossParity(a, b);
    }
  });
});
