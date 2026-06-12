import { describe, expect, it } from 'vitest';
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

    expect(enemy.hp).toBe(18);
    expect(enemy.damage).toBe(6);
    expect(enemy.speed).toBeCloseTo(3.18, 4);
  });
});
