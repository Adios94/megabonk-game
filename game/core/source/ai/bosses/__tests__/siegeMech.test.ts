/**
 * 攻城机甲（siege_mech）单测 —— 6 attack + phase 表。
 */
import { describe, it, expect, vi } from 'vitest';
import { SIEGE_MECH, SIEGE_MECH_PHASES } from '../siegeMech.ts';
import type { BossState } from '../../../types.ts';
import { makeAiContext, makeAiEffects, makePlayer, makeEnemy, makeBoss } from '../../__tests__/_fixtures.ts';

function siegeAt(phase: 1 | 2 | 3, x = 0, z = 0): BossState {
  const b = makeBoss(x, z);
  b.bossType = 'siege_mech';
  b.phase = phase;
  if (phase === 1) b.hp = b.maxHp;
  if (phase === 2) b.hp = b.maxHp * 0.5;
  if (phase === 3) b.hp = b.maxHp * 0.2;
  return b;
}

describe('SIEGE_MECH_PHASES', () => {
  it('phase 3 enraged + speed 5.0，含 charge / leap_slam', () => {
    const p3 = SIEGE_MECH_PHASES.find(p => p.phase === 3)!;
    expect(p3.enraged).toBe(true);
    expect(p3.speed).toBe(5.0);
    expect(p3.attacks).toContain('charge');
    expect(p3.attacks).toContain('leap_slam');
  });
});

describe('attack: barrage', () => {
  it('在玩家附近落 6 颗投射物 (18 dmg, vy=-12)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 20 });
    const ctx = makeAiContext({ player, effects });
    SIEGE_MECH.attacks.barrage!(siegeAt(1), ctx);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(6);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    expect(arg.damage).toBe(18);
    expect(arg.vy).toBe(-12);
    expect(arg.y).toBe(10);
    vi.restoreAllMocks();
  });
});

describe('attack: heavy_slam', () => {
  it('dist < 5.0 给 42 伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 4, z: 0 }), effects });
    SIEGE_MECH.attacks.heavy_slam!(siegeAt(1), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(42);
  });

  it('高度差超过 2.8 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 4, y: 4, z: 0 }), effects });
    const boss = siegeAt(1);
    boss.y = 0;
    SIEGE_MECH.attacks.heavy_slam!(boss, ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: cleave', () => {
  it('dist < 7.0 给 48 伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, z: 0 }), effects });
    SIEGE_MECH.attacks.cleave!(siegeAt(1), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(48);
  });

  it('高度差超过 2.8 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, y: 4, z: 0 }), effects });
    const boss = siegeAt(1);
    boss.y = 0;
    SIEGE_MECH.attacks.cleave!(boss, ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: leap_slam', () => {
  it('dist < 6.0 给 42 伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, z: 0 }), effects });
    SIEGE_MECH.attacks.leap_slam!(siegeAt(3), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(42);
  });

  it('高度差超过 2.8 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, y: 4, z: 0 }), effects });
    const boss = siegeAt(3);
    boss.y = 0;
    SIEGE_MECH.attacks.leap_slam!(boss, ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: charge', () => {
  it('boss.speed 设为 12.0', () => {
    const boss = siegeAt(2);
    boss.speed = 4.0;
    SIEGE_MECH.attacks.charge!(boss, makeAiContext());
    expect(boss.speed).toBe(12.0);
  });
});

describe('attack: deploy_drones', () => {
  it('phase 2 召 4 只 gargoyle (mode=bossSummon)', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SIEGE_MECH.attacks.deploy_drones!(siegeAt(2), ctx);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(4);
    expect(effects.spawnEnemyByTypeSpy.mock.calls[0][0]).toBe('gargoyle');
    expect(effects.spawnEnemyByTypeSpy.mock.calls[0][3].mode).toBe('bossSummon');
  });

  it('phase 3 召 8 只', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SIEGE_MECH.attacks.deploy_drones!(siegeAt(3), ctx);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(8);
  });

  it('达 MAX_ENEMIES 时停', () => {
    const effects = makeAiEffects();
    const enemies = Array.from({ length: 100 }, (_, i) => makeEnemy(i + 1, 'gargoyle', 0, 0));
    const ctx = makeAiContext({ effects, enemies });
    SIEGE_MECH.attacks.deploy_drones!(siegeAt(2), ctx);
    expect(effects.spawnEnemyByTypeSpy).not.toHaveBeenCalled();
  });
});
