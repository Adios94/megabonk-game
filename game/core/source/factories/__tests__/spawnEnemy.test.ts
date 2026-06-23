import { describe, expect, it } from 'vitest';
import { REGULAR_GAME_DURATION } from '../../config.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { makePlayer } from '../../ai/__tests__/_fixtures.ts';
import { spawnEnemy, type SpawnEnemyContext } from '../spawnEnemy.ts';

function makeCtx(level: number): SpawnEnemyContext {
  let nextId = 1;
  return {
    gameTime: 0,
    tier: 1,
    player: makePlayer({ level }),
    nextId: () => nextId++,
  };
}

describe('spawnEnemy level scaling', () => {
  it('does not scale enemies before level 10', () => {
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, makeCtx(9), { applyEliteRoll: false });
    const def = ENEMIES.skeleton_soldier;

    expect(enemy.hp).toBe(def.hp);
    expect(enemy.damage).toBe(def.damage);
    expect(enemy.speed).toBe(def.speed);
  });

  it('scales wave enemies from level 10 onward', () => {
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, makeCtx(20), { applyEliteRoll: false });

    expect(enemy.hp).toBe(21);
    expect(enemy.damage).toBe(6);
    expect(enemy.speed).toBeCloseTo(3.09, 4);
  });

  it('keeps the level curve below the player power curve in the midgame', () => {
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, makeCtx(40), { applyEliteRoll: false });

    expect(enemy.hp).toBe(39);
    expect(enemy.damage).toBe(8);
    expect(enemy.speed).toBeCloseTo(3.27, 4);
  });

  it('does not apply player level scaling to special summons', () => {
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, makeCtx(40), { mode: 'necromancerSummon' });
    const def = ENEMIES.skeleton_soldier;

    expect(enemy.hp).toBe(def.hp);
    expect(enemy.damage).toBe(def.damage);
    expect(enemy.speed).toBe(def.speed);
  });

  it('applies overtime scaling continuously before a full step elapses', () => {
    const ctx = { ...makeCtx(1), overtimeSeconds: 15 };
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, ctx, { applyEliteRoll: false });

    expect(enemy.hp).toBe(20);
    expect(enemy.damage).toBe(6);
    expect(enemy.speed).toBeCloseTo(3.225, 4);
  });

  it('raises overtime damage as time keeps passing', () => {
    const ctx = { ...makeCtx(1), overtimeSeconds: 60 };
    const enemy = spawnEnemy('skeleton_soldier', 0, 0, ctx, { applyEliteRoll: false });

    expect(enemy.damage).toBe(8);
  });

  it('slows overtime growth after the boss spawn anchor', () => {
    const normal = spawnEnemy(
      'skeleton_soldier',
      0, 0,
      { ...makeCtx(1), gameTime: REGULAR_GAME_DURATION + 100, overtimeSeconds: 100 },
      { applyEliteRoll: false },
    );
    const slowed = spawnEnemy(
      'skeleton_soldier',
      0, 0,
      {
        ...makeCtx(1),
        gameTime: REGULAR_GAME_DURATION + 100,
        overtimeSeconds: 100,
        overtimeGrowthAnchorSeconds: 50,
        overtimeGrowthMultiplier: 0.1,
      },
      { applyEliteRoll: false },
    );

    expect(slowed.hp).toBeLessThan(normal.hp);
    expect(slowed.damage).toBeLessThan(normal.damage);
    expect(slowed.speed).toBeLessThan(normal.speed);
  });

  it('ramps wave enemy hp and damage during final swarm', () => {
    const ctx = { ...makeCtx(1), gameTime: 510 };
    const enemy = spawnEnemy('necromancer', 0, 0, ctx, { applyEliteRoll: false });

    expect(enemy.hp).toBe(287);
    expect(enemy.damage).toBe(17);
  });

  it('inherits half of final swarm growth and keeps growing after overtime begins', () => {
    const afterOvertime = spawnEnemy(
      'necromancer',
      0, 0,
      { ...makeCtx(1), gameTime: REGULAR_GAME_DURATION },
      { applyEliteRoll: false },
    );
    const laterOvertime = spawnEnemy(
      'necromancer',
      0, 0,
      { ...makeCtx(1), gameTime: REGULAR_GAME_DURATION + 60 },
      { applyEliteRoll: false },
    );

    expect(afterOvertime.hp).toBe(304);
    expect(afterOvertime.damage).toBe(17);
    expect(laterOvertime.hp).toBe(408);
    expect(laterOvertime.damage).toBe(19);
  });
});
