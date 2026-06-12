/**
 * 五把新武器行为单元测试：rayBeam / poisonGas / paralysisShot / voidRipple / scorchTrail。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorld } from '../../world.ts';
import { rayBeam } from '../rayBeam.ts';
import { poisonGas } from '../poisonGas.ts';
import { paralysisShot } from '../paralysisShot.ts';
import { voidRipple } from '../voidRipple.ts';
import { scorchTrail } from '../scorchTrail.ts';
import { PARALYSIS_SLOW_FACTOR } from '../../config.ts';
import { makePlayer, makeEnemy, makeStats, makeCtx } from './_helpers.ts';

describe('rayBeam (ray_gun)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { spy.mockRestore(); });

  it('沿直线无限穿透：同一直线上的多个敌人全部受伤', () => {
    const player = makePlayer({ x: 0, z: 0, rotation: 0 });
    const near = makeEnemy(1, 0, 5);   // 正前方
    const far = makeEnemy(2, 0, 12);   // 同线更远
    const ctx = makeCtx(player, [near, far], null,
      makeStats({ damage: 20, range: 20, aoeRadius: 0.5 }), 'ray_gun', 'rayBeam', ['ray_gun', 'beam']);
    rayBeam(createWorld(), ctx);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBeLessThan(100);
  });

  it('光束半宽外的敌人不受伤', () => {
    const player = makePlayer({ x: 0, z: 0, rotation: 0 });
    const target = makeEnemy(1, 0, 5);
    const offside = makeEnemy(2, 6, 5);  // 垂直距离 6，远超半宽
    const ctx = makeCtx(player, [target, offside], null,
      makeStats({ damage: 20, range: 20, aoeRadius: 0.5 }), 'ray_gun', 'rayBeam', ['ray_gun']);
    rayBeam(createWorld(), ctx);
    expect(target.hp).toBeLessThan(100);
    expect(offside.hp).toBe(100);
  });

  it('水平同线但垂直分层时不受伤', () => {
    const player = makePlayer({ x: 0, y: 4, z: 0, rotation: 0 });
    const below = makeEnemy(1, 0, 5);
    below.y = 0;
    const ctx = makeCtx(player, [below], null,
      makeStats({ damage: 20, range: 20, aoeRadius: 0.5 }), 'ray_gun', 'rayBeam', ['ray_gun']);
    rayBeam(createWorld(), ctx);
    expect(below.hp).toBe(100);
  });

  it('推一个 ray_beam 区域特效供渲染', () => {
    const player = makePlayer({ x: 0, y: 4.5, z: 0 });
    const ctx = makeCtx(player, [makeEnemy(1, 0, 5)], null,
      makeStats({ damage: 20, range: 20, aoeRadius: 0.6 }), 'ray_gun', 'rayBeam', ['ray_gun']);
    rayBeam(createWorld(), ctx);
    expect(ctx.effects.areaEffects).toHaveLength(1);
    expect(ctx.effects.areaEffects[0].kind).toBe('ray_beam');
    expect(ctx.effects.areaEffects[0].y).toBe(4.5);
    expect(ctx.effects.areaEffects[0].width).toBe(0.6);
  });
});

describe('poisonGas (poison_bomb)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { spy.mockRestore(); });

  it('在目标处生成毒气云，poisonDps = computeWeaponDamage(damage)', () => {
    const player = makePlayer({ x: 0, z: 0, damageMultiplier: 1.0 });
    const enemy = makeEnemy(1, 3, 0);
    const ctx = makeCtx(player, [enemy], null,
      makeStats({ damage: 12, range: 10, aoeRadius: 3.0 }), 'poison_bomb', 'poisonGas', ['poison_bomb', 'dot']);
    poisonGas(createWorld(), ctx);
    expect(ctx.effects.areaEffects).toHaveLength(1);
    const ae = ctx.effects.areaEffects[0];
    expect(ae.kind).toBe('gas_cloud');
    expect(ae.poisonDps).toBe(12);
    expect(ae.x).toBeCloseTo(3, 4);
    expect(ae.radius).toBe(3.0);
  });
});

describe('paralysisShot (paralysis_gun)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { spy.mockRestore(); });

  it('发射的投射物携带强减速 onHitStatus', () => {
    const player = makePlayer({ x: 0, z: 0 });
    const enemy = makeEnemy(1, 0, 5);
    const ctx = makeCtx(player, [enemy], null,
      makeStats({ damage: 10, projectileCount: 1, range: 24, pierce: 2, speed: 26 }), 'paralysis_gun', 'paralysisShot', ['paralysis_gun']);
    paralysisShot(createWorld(), ctx);
    expect(ctx.effects.projectiles).toHaveLength(1);
    const p = ctx.effects.projectiles[0];
    expect(p.weaponType).toBe('paralysis_gun');
    expect(p.pierceLeft).toBe(2);
    expect(p.onHitStatus?.slowFactor).toBe(PARALYSIS_SLOW_FACTOR);
    expect(p.onHitStatus?.slowDuration).toBeGreaterThan(0);
  });
});

describe('voidRipple (void_ripple)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { spy.mockRestore(); });

  it('以玩家为圆心生成扩散环，radius 从 0 开始', () => {
    const player = makePlayer({ x: 2, z: 3 });
    const ctx = makeCtx(player, [], null,
      makeStats({ damage: 16, aoeRadius: 6, speed: 8 }), 'void_ripple', 'voidRipple', ['void_ripple']);
    voidRipple(createWorld(), ctx);
    expect(ctx.effects.areaEffects).toHaveLength(1);
    const ae = ctx.effects.areaEffects[0];
    expect(ae.kind).toBe('void_ripple');
    expect(ae.x).toBe(2);
    expect(ae.y).toBe(0);
    expect(ae.z).toBe(3);
    expect(ae.radius).toBe(0);
    expect(ae.maxRadius).toBe(6);
    expect(ae.expandSpeed).toBe(8);
    expect(ae.followPlayer).toBe(true);
  });
});

describe('scorchTrail (scorch_boots)', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { spy = vi.spyOn(Math, 'random').mockReturnValue(0.99); });
  afterEach(() => { spy.mockRestore(); });

  it('在玩家脚下生成灼地痕迹', () => {
    const player = makePlayer({ x: 1, y: 4, z: 1 });
    const ctx = makeCtx(player, [], null,
      makeStats({ damage: 5, aoeRadius: 0.9 }), 'scorch_boots', 'scorchTrail', ['scorch_boots']);
    scorchTrail(createWorld(), ctx);
    expect(ctx.effects.areaEffects).toHaveLength(1);
    const ae = ctx.effects.areaEffects[0];
    expect(ae.kind).toBe('scorch_trail');
    expect(ae.y).toBe(4);
    expect(ae.radius).toBe(0.9);
    expect(ae.damage).toBe(5);
  });
});
