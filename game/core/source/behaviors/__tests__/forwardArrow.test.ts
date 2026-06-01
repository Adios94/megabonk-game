/**
 * forwardArrow (bow) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { forwardArrow } from '../forwardArrow.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeEnemy, makeStats, makeCtx } from './_helpers.ts';

describe('forwardArrow', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('1 enemy in range → 1 projectile aimed at enemy', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 3, 4);   // dist 5
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 18, range: 30, speed: 25, projectileCount: 1, pierce: 0 }), 'bow', 'forwardArrow', ['bow']);
    forwardArrow(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.weaponType).toBe('bow');
    expect(p.damage).toBe(18);
    expect(p.lifetime).toBe(3.0);
    expect(p.radius).toBe(0.25);
    // 速度方向应指向 enemy: (3,4) 单位化 (0.6, 0.8) × speed 25
    expect(p.vx).toBeCloseTo(0.6 * 25, 4);
    expect(p.vz).toBeCloseTo(0.8 * 25, 4);
  });

  it('no enemy → 1 projectile 沿 player.rotation 方向', () => {
    const player = makePlayer({ rotation: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 18, range: 30, speed: 25, projectileCount: 1 }), 'bow', 'forwardArrow', ['bow']);
    forwardArrow(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.vx).toBeCloseTo(Math.sin(0) * 25, 4);  // 0
    expect(p.vz).toBeCloseTo(Math.cos(0) * 25, 4);  // 25
  });

  it('count=3 → 3 projectiles, i=0 瞄准, i=1/2 spread', () => {
    const player = makePlayer({ rotation: 0 });
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 18, range: 30, speed: 25, projectileCount: 3 }), 'bow', 'forwardArrow', ['bow']);
    forwardArrow(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(3);
    // i=0 朝向 enemy: 单位化 (0,1) × 25
    expect(ctx.effects.projectiles[0].vx).toBeCloseTo(0, 4);
    expect(ctx.effects.projectiles[0].vz).toBeCloseTo(25, 4);
    // i=1: angle = 0 + (1 - 1) × 0.15 = 0 → vx=0, vz=25
    expect(ctx.effects.projectiles[1].vx).toBeCloseTo(0, 4);
    expect(ctx.effects.projectiles[1].vz).toBeCloseTo(25, 4);
    // i=2: angle = 0 + (2 - 1) × 0.15 = 0.15 → vx=sin(0.15)*25
    expect(ctx.effects.projectiles[2].vx).toBeCloseTo(Math.sin(0.15) * 25, 4);
    expect(ctx.effects.projectiles[2].vz).toBeCloseTo(Math.cos(0.15) * 25, 4);
  });

  it('enemy 超出 range → fallback to player.rotation', () => {
    const player = makePlayer({ rotation: 0 });
    const farEnemy = makeEnemy(1, 0, 100);
    const ctx = makeCtx(player, [farEnemy], null, makeStats({ damage: 18, range: 30, speed: 25, projectileCount: 1 }), 'bow', 'forwardArrow', ['bow']);
    forwardArrow(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    expect(ctx.effects.projectiles[0].vz).toBeCloseTo(25, 4);  // forward
    expect(ctx.effects.projectiles[0].vx).toBeCloseTo(0, 4);
  });

  it('damage uses computeWeaponDamage (dM=1.5 → damage=27)', () => {
    const player = makePlayer({ damageMultiplier: 1.5 });
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 18, range: 30, speed: 25 }), 'bow', 'forwardArrow', ['bow']);
    forwardArrow(createWorld(), ctx);
    expect(ctx.effects.projectiles[0].damage).toBe(27);  // round(18 × 1.5) = 27
  });
});
