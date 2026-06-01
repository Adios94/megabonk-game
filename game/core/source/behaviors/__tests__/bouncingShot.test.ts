/**
 * bouncingShot (bone_bouncer) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bouncingShot } from '../bouncingShot.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeEnemy, makeStats, makeCtx } from './_helpers.ts';

describe('bouncingShot', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('1 enemy → 1 projectile aimed at enemy with bouncesLeft', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 8, projectileCount: 1, bounces: 2, speed: 12 }), 'bone_bouncer', 'bouncingShot', ['bone_bouncer']);
    bouncingShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.weaponType).toBe('bone_bouncer');
    expect(p.damage).toBe(8);
    expect(p.bouncesLeft).toBe(2);
    expect(p.lifetime).toBe(4.0);
    expect(p.radius).toBe(0.4);
    expect(p.vx).toBeCloseTo(0, 4);
    expect(p.vz).toBeCloseTo(12, 4);
  });

  it('no enemy → projectile 沿 player.rotation', () => {
    const player = makePlayer({ rotation: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 8, projectileCount: 1, bounces: 2, speed: 12 }), 'bone_bouncer', 'bouncingShot', ['bone_bouncer']);
    bouncingShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    expect(ctx.effects.projectiles[0].vx).toBeCloseTo(Math.sin(0) * 12, 4);
    expect(ctx.effects.projectiles[0].vz).toBeCloseTo(Math.cos(0) * 12, 4);
  });

  it('count=3 → 3 projectiles 旋转 spread (0.25 rad)', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 8, projectileCount: 3, bounces: 2, speed: 12 }), 'bone_bouncer', 'bouncingShot', ['bone_bouncer']);
    bouncingShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(3);
    // i=0: angle = -0.25, i=1: 0, i=2: +0.25
    // Base vx=0, vz=12; rotated by angle
    const rotate = (a: number) => ({
      vx: 0 * Math.cos(a) - 12 * Math.sin(a),
      vz: 0 * Math.sin(a) + 12 * Math.cos(a),
    });
    const e0 = rotate(-0.25), e2 = rotate(0.25);
    expect(ctx.effects.projectiles[0].vx).toBeCloseTo(e0.vx, 4);
    expect(ctx.effects.projectiles[0].vz).toBeCloseTo(e0.vz, 4);
    expect(ctx.effects.projectiles[2].vx).toBeCloseTo(e2.vx, 4);
    expect(ctx.effects.projectiles[2].vz).toBeCloseTo(e2.vz, 4);
  });

  it('damage uses computeWeaponDamage (dM=2.0 → damage=16)', () => {
    const player = makePlayer({ damageMultiplier: 2.0 });
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null, makeStats({ damage: 8, projectileCount: 1, bounces: 2, speed: 12 }), 'bone_bouncer', 'bouncingShot', ['bone_bouncer']);
    bouncingShot(createWorld(), ctx);
    expect(ctx.effects.projectiles[0].damage).toBe(16);
  });
});
