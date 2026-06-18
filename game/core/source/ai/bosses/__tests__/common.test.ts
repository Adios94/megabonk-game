/**
 * Boss 通用工具单测 —— resolvePhase / chooseAttack / getBossMeleeDamage / fireBolt。
 */
import { describe, it, expect, vi } from 'vitest';
import { resolvePhase, chooseAttack, getBossMeleeDamage, fireBolt, aimAngle } from '../common.ts';
import { GUNNER_MECH_PHASES } from '../gunnerMech.ts';
import { makeAiContext, makeAiEffects, makePlayer, makeBoss } from '../../__tests__/_fixtures.ts';

describe('resolvePhase', () => {
  it('hp/maxHp > 0.6 → phase 1', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.8;
    expect(resolvePhase(b, GUNNER_MECH_PHASES).phase).toBe(1);
  });

  it('0.3 < hp/maxHp <= 0.6 → phase 2', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.5;
    expect(resolvePhase(b, GUNNER_MECH_PHASES).phase).toBe(2);
  });

  it('hp/maxHp <= 0.3 → phase 3 enraged + speed 5.0', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.25;
    const cfg = resolvePhase(b, GUNNER_MECH_PHASES);
    expect(cfg.phase).toBe(3);
    expect(cfg.enraged).toBe(true);
    expect(cfg.speed).toBe(5.0);
  });
});

describe('chooseAttack', () => {
  it('从 phase pool 里按 floor(random * len) 选', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const cfg = GUNNER_MECH_PHASES.find(p => p.phase === 1)!;
    expect(chooseAttack(cfg)).toBe(cfg.attacks[0]);
    vi.restoreAllMocks();
  });
});

describe('getBossMeleeDamage', () => {
  it('phase 1 = 24, phase 2 = 36, phase 3 = 48', () => {
    const b = makeBoss();
    b.phase = 1; expect(getBossMeleeDamage(b)).toBe(24);
    b.phase = 2; expect(getBossMeleeDamage(b)).toBe(36);
    b.phase = 3; expect(getBossMeleeDamage(b)).toBe(48);
  });

  it('额外 boss 伤害倍率会叠加到通用倍率后取整', () => {
    const b = makeBoss();
    b.phase = 1;
    b.damageMultiplier = 1.2;
    expect(getBossMeleeDamage(b)).toBe(29);
  });
});

describe('fireBolt / aimAngle', () => {
  it('朝玩家发射指定速度/伤害的直线弹', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 0 });
    const ctx = makeAiContext({ player, effects });
    const boss = makeBoss(0, 0);
    fireBolt(boss, ctx, aimAngle(boss, ctx), 12, 12);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(1);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    expect(arg.damage).toBe(14);
    expect(arg.fromPlayer).toBe(false);
    const speed = Math.sqrt(arg.vx ** 2 + arg.vz ** 2);
    expect(speed).toBeCloseTo(12, 5);
  });

  it('boss 弹幕同样吃额外伤害倍率', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 0 });
    const ctx = makeAiContext({ player, effects });
    const boss = makeBoss(0, 0);
    boss.damageMultiplier = 1.2;
    fireBolt(boss, ctx, aimAngle(boss, ctx), 12, 12);
    expect(effects.spawnProjectileSpy.mock.calls[0][0].damage).toBe(17);
  });
});
