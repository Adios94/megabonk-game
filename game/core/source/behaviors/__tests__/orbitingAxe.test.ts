/**
 * orbitingAxe (axe) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orbitingAxe } from '../orbitingAxe.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeStats, makeCtx } from './_helpers.ts';

describe('orbitingAxe', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('count=1 → 1 projectile, startAngle=0, orbiting flags set', () => {
    const player = makePlayer({ x: 0, y: 5, z: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 1, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.weaponType).toBe('axe');
    expect(p.damage).toBe(10);
    expect(p.orbiting).toBe(true);
    expect(p.orbitAngle).toBe(0);
    expect(p.orbitRadius).toBe(3);
    expect(p.orbitSpeed).toBe(4);
    expect(p.x).toBeCloseTo(3, 4);   // cos(0) × 3
    expect(p.y).toBe(6);
    expect(p.z).toBeCloseTo(0, 4);   // sin(0) × 3
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.vz).toBe(0);
  });

  it('count=4 → 4 projectiles 等距 (0, π/2, π, 3π/2)', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 4, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(4);
    const angles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    angles.forEach((a, i) => {
      expect(ctx.effects.projectiles[i].orbitAngle).toBeCloseTo(a, 4);
      expect(ctx.effects.projectiles[i].x).toBeCloseTo(Math.cos(a) * 3, 4);
      expect(ctx.effects.projectiles[i].z).toBeCloseTo(Math.sin(a) * 3, 4);
    });
  });

  it('aoeRadius → projectile.radius', () => {
    const player = makePlayer();
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 1, range: 3, aoeRadius: 1.5, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    expect(ctx.effects.projectiles[0].radius).toBe(1.5);
  });

  it('damage uses computeWeaponDamage (dM=1.2 → damage=12)', () => {
    const player = makePlayer({ damageMultiplier: 1.2 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 1, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    expect(ctx.effects.projectiles[0].damage).toBe(12);  // round(10 × 1.2) = 12
  });
});
