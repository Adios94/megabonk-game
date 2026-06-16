/**
 * 游侠机甲（gunner_mech）单测 —— 4 attack + phase 表。
 */
import { describe, it, expect } from 'vitest';
import { GUNNER_MECH, GUNNER_MECH_PHASES } from '../gunnerMech.ts';
import type { BossState } from '../../../types.ts';
import { makeAiContext, makeAiEffects, makePlayer, makeBoss } from '../../__tests__/_fixtures.ts';

function gunnerAt(phase: 1 | 2 | 3, x = 0, z = 0): BossState {
  const b = makeBoss(x, z);
  b.bossType = 'gunner_mech';
  b.phase = phase;
  if (phase === 1) b.hp = b.maxHp;
  if (phase === 2) b.hp = b.maxHp * 0.5;
  if (phase === 3) b.hp = b.maxHp * 0.2;
  return b;
}

describe('GUNNER_MECH_PHASES', () => {
  it('phase 1 = 速度 3 / phase 2 = 4 / phase 3 = 5 enraged', () => {
    expect(GUNNER_MECH_PHASES.find(p => p.phase === 1)!.speed).toBe(3.0);
    expect(GUNNER_MECH_PHASES.find(p => p.phase === 2)!.speed).toBe(4.0);
    const p3 = GUNNER_MECH_PHASES.find(p => p.phase === 3)!;
    expect(p3.speed).toBe(5.0);
    expect(p3.enraged).toBe(true);
  });

  it('suppress_fire 仅出现在 phase 3', () => {
    expect(GUNNER_MECH_PHASES.find(p => p.phase === 1)!.attacks).not.toContain('suppress_fire');
    expect(GUNNER_MECH_PHASES.find(p => p.phase === 3)!.attacks).toContain('suppress_fire');
  });
});

describe('attack: aimed_burst', () => {
  it('朝玩家发 3 发直线弹，每发 12 dmg', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 0 });
    const ctx = makeAiContext({ player, effects });
    GUNNER_MECH.attacks.aimed_burst!(gunnerAt(1), ctx);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(3);
    expect(effects.spawnProjectileSpy.mock.calls[0][0].damage).toBe(12);
  });
});

describe('attack: suppress_fire', () => {
  it('扇形 5 发直线弹，每发 10 dmg', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 0, z: 10 });
    const ctx = makeAiContext({ player, effects });
    GUNNER_MECH.attacks.suppress_fire!(gunnerAt(3), ctx);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(5);
    expect(effects.spawnProjectileSpy.mock.calls[0][0].damage).toBe(10);
  });
});

describe('attack: melee_swipe', () => {
  it('dist < 3.5 给 25 伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 1, z: 0 }), effects });
    GUNNER_MECH.attacks.melee_swipe!(gunnerAt(1), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(25);
  });

  it('dist >= 3.5 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, z: 0 }), effects });
    GUNNER_MECH.attacks.melee_swipe!(gunnerAt(1), ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });

  it('高度差超过 2.8 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 1, y: 4, z: 0 }), effects });
    const boss = gunnerAt(1);
    boss.y = 0;
    GUNNER_MECH.attacks.melee_swipe!(boss, ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: leap_strike', () => {
  it('dist < 4.0 给 20 伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 3, z: 0 }), effects });
    GUNNER_MECH.attacks.leap_strike!(gunnerAt(2), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(20);
  });

  it('dist >= 4.0 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 5, z: 0 }), effects });
    GUNNER_MECH.attacks.leap_strike!(gunnerAt(2), ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });

  it('高度差超过 2.8 不伤害', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ player: makePlayer({ x: 3, y: 4, z: 0 }), effects });
    const boss = gunnerAt(2);
    boss.y = 0;
    GUNNER_MECH.attacks.leap_strike!(boss, ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});
