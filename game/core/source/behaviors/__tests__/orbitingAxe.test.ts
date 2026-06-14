/**
 * orbitingAxe (axe「常驻刀环」) 单元测试。
 *
 * 行为语义（方案 A）：维持 projectileCount 把常驻绕圈刀刃，幂等校准 —— 不堆叠。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { orbitingAxe } from '../orbitingAxe.ts';
import { createWorld } from '../../world.ts';
import { makePlayer, makeStats, makeCtx } from './_helpers.ts';

describe('orbitingAxe', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { mathRandomSpy.mockRestore(); });

  it('count=1 → 1 projectile, startAngle=0, orbiting/常驻 flags set', () => {
    const player = makePlayer({ x: 0, y: 5, z: 0 });
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, cooldown: 1.5, projectileCount: 1, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
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
    // 常驻 + 周期重击
    expect(p.lifetime).toBeGreaterThan(1e6);
    expect(p.rehitInterval).toBe(1.5);
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

  it('幂等：重复触发不堆叠（常驻刀环数量恒等于 projectileCount）', () => {
    const player = makePlayer();
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 2, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    orbitingAxe(createWorld(), ctx);
    orbitingAxe(createWorld(), ctx);
    const live = ctx.effects.projectiles.filter((p) => (p.lifetime ?? 0) > 0);
    expect(live).toHaveLength(2);
  });

  it('升级 projectileCount → 补齐缺口并重新等距分布', () => {
    const player = makePlayer();
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 1, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    expect(ctx.effects.projectiles.filter((p) => (p.lifetime ?? 0) > 0)).toHaveLength(1);

    ctx.stats = makeStats({ damage: 10, projectileCount: 3, range: 3, aoeRadius: 1, pierce: 999, speed: 4 });
    orbitingAxe(createWorld(), ctx);
    const live = ctx.effects.projectiles.filter((p) => (p.lifetime ?? 0) > 0);
    expect(live).toHaveLength(3);
    const angles = live.map((p) => p.orbitAngle).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(angles[0]).toBeCloseTo(0, 4);
    expect(angles[1]).toBeCloseTo((2 * Math.PI) / 3, 4);
    expect(angles[2]).toBeCloseTo((4 * Math.PI) / 3, 4);
  });

  it('projectileCount 下降 → 多余刀刃标记移除 (lifetime=0)', () => {
    const player = makePlayer();
    const ctx = makeCtx(player, [], null, makeStats({ damage: 10, projectileCount: 3, range: 3, aoeRadius: 1, pierce: 999, speed: 4 }), 'axe', 'orbitingAxe', ['axe']);
    orbitingAxe(createWorld(), ctx);
    ctx.stats = makeStats({ damage: 10, projectileCount: 1, range: 3, aoeRadius: 1, pierce: 999, speed: 4 });
    orbitingAxe(createWorld(), ctx);
    const live = ctx.effects.projectiles.filter((p) => (p.lifetime ?? 0) > 0);
    expect(live).toHaveLength(1);
  });
});
