/**
 * spreadShot (shotgun) 单元测试。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spreadShot } from '../spreadShot.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeStats, makeCtx } from './_helpers.ts';

describe('spreadShot', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('count=1 → 1 projectile 沿 player.rotation', () => {
    const player = makePlayer({ rotation: 0, y: 3 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 8, projectileCount: 1, range: 12, pierce: 0, speed: 16 }), 'shotgun', 'spreadShot', ['shotgun']);
    spreadShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.weaponType).toBe('shotgun');
    expect(p.y).toBe(4);
    expect(p.lifetime).toBe(1.5);
    expect(p.radius).toBe(0.2);
    expect(p.vx).toBeCloseTo(0, 4);
    expect(p.vz).toBeCloseTo(16, 4);
  });

  it('count=5 → 5 projectiles 扇形 (±0.175π) 等分', () => {
    const player = makePlayer({ rotation: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 8, projectileCount: 5, range: 12, pierce: 0, speed: 16 }), 'shotgun', 'spreadShot', ['shotgun']);
    spreadShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(5);
    const spread = Math.PI * 0.35;
    for (let i = 0; i < 5; i++) {
      const offset = ((i / 4) - 0.5) * spread;
      const expectedVx = Math.sin(offset) * 16;
      const expectedVz = Math.cos(offset) * 16;
      expect(ctx.effects.projectiles[i].vx).toBeCloseTo(expectedVx, 4);
      expect(ctx.effects.projectiles[i].vz).toBeCloseTo(expectedVz, 4);
    }
  });

  it('pierceLeft = stats.pierce', () => {
    const player = makePlayer();
    const ctx = makeCtx(player, [], null, makeStats({ damage: 8, projectileCount: 5, range: 12, pierce: 2, speed: 16 }), 'shotgun', 'spreadShot', ['shotgun']);
    spreadShot(createWorld(), ctx);
    ctx.effects.projectiles.forEach(p => {
      expect(p.pierceLeft).toBe(2);
    });
  });

  it('damage uses computeWeaponDamage (dM=1.5 → 12)', () => {
    const player = makePlayer({ damageMultiplier: 1.5 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 8, projectileCount: 5, range: 12, speed: 16 }), 'shotgun', 'spreadShot', ['shotgun']);
    spreadShot(createWorld(), ctx);
    ctx.effects.projectiles.forEach(p => {
      expect(p.damage).toBe(12);  // round(8 × 1.5) = 12
    });
  });
});
