/**
 * skeletonKing 单元测试 —— 7 attack + phase resolver + getBossMeleeDamage.
 *
 * 每个 attack 至少 1 个用例（共 7+），加 resolvePhase / getBossMeleeDamage / chooseAttack 边界用例.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SKELETON_KING_ATTACKS,
  SKELETON_KING_PHASES,
  resolvePhase,
  chooseAttack,
  getBossMeleeDamage,
} from '../skeletonKing.ts';
import type { BossState } from '../../../types.ts';
import {
  makeAiContext,
  makeAiEffects,
  makePlayer,
  makeEnemy,
  makeBoss,
} from '../../__tests__/_fixtures.ts';

function bossAt(phase: 1 | 2 | 3, x = 0, z = 0): BossState {
  const b = makeBoss(x, z);
  b.phase = phase;
  // 设 hp 让 resolvePhase 命中对应阶段
  if (phase === 1) b.hp = b.maxHp;       // ratio = 1.0
  if (phase === 2) b.hp = b.maxHp * 0.5;  // ratio = 0.5 → phase 2
  if (phase === 3) b.hp = b.maxHp * 0.2;  // ratio = 0.2 → phase 3
  return b;
}

describe('SKELETON_KING_PHASES table', () => {
  it('phase 1 hp ratio = 1.0, phase 2 = 0.6, phase 3 = 0.3', () => {
    expect(SKELETON_KING_PHASES.find(p => p.phase === 1)!.hpRatio).toBe(1.0);
    expect(SKELETON_KING_PHASES.find(p => p.phase === 2)!.hpRatio).toBe(0.6);
    expect(SKELETON_KING_PHASES.find(p => p.phase === 3)!.hpRatio).toBe(0.3);
  });

  it('phase 3 enraged + speed 5.0', () => {
    const p3 = SKELETON_KING_PHASES.find(p => p.phase === 3)!;
    expect(p3.enraged).toBe(true);
    expect(p3.speed).toBe(5.0);
  });
});

describe('resolvePhase', () => {
  it('hp/maxHp > 0.6 → phase 1', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.8;
    expect(resolvePhase(b).phase).toBe(1);
  });

  it('0.3 < hp/maxHp <= 0.6 → phase 2', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.5;
    expect(resolvePhase(b).phase).toBe(2);
  });

  it('hp/maxHp <= 0.3 → phase 3 enraged', () => {
    const b = makeBoss();
    b.hp = b.maxHp * 0.25;
    const cfg = resolvePhase(b);
    expect(cfg.phase).toBe(3);
    expect(cfg.enraged).toBe(true);
  });
});

describe('chooseAttack', () => {
  it('从 phase pool 里按 floor(random * len) 选', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);  // → idx 0
    const cfg = SKELETON_KING_PHASES.find(p => p.phase === 1)!;
    expect(chooseAttack(cfg)).toBe(cfg.attacks[0]);
    vi.restoreAllMocks();
  });
});

describe('getBossMeleeDamage', () => {
  it('phase 1 = 20, phase 2 = 30, phase 3 = 40', () => {
    expect(getBossMeleeDamage(bossAt(1))).toBe(20);
    expect(getBossMeleeDamage(bossAt(2))).toBe(30);
    expect(getBossMeleeDamage(bossAt(3))).toBe(40);
  });
});

describe('attack: melee_sweep', () => {
  it('dist < 3.5 时给玩家 25 伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 1, z: 0 });
    const ctx = makeAiContext({ player, effects });
    const boss = bossAt(1, 0, 0);
    SKELETON_KING_ATTACKS.melee_sweep(boss, ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(25);
  });

  it('dist >= 3.5 时不伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 5, z: 0 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.melee_sweep(bossAt(1), ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: ground_slam', () => {
  it('dist < 5.0 时给玩家 35 伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 4, z: 0 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.ground_slam(bossAt(1), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(35);
  });

  it('dist >= 5.0 不伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 6, z: 0 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.ground_slam(bossAt(1), ctx);
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
  });
});

describe('attack: aoe_explosion', () => {
  it('dist < 7.0 时给玩家 40 伤害', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 5, z: 0 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.aoe_explosion(bossAt(3), ctx);
    expect(effects.damagePlayerSpy).toHaveBeenCalledWith(40);
  });
});

describe('attack: dark_bolt', () => {
  it('朝玩家发射 1 个 20 dmg 投射物 (speed 10)', () => {
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 0 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.dark_bolt(bossAt(1), ctx);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(1);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    expect(arg.damage).toBe(20);
    expect(arg.fromPlayer).toBe(false);
    const speed = Math.sqrt(arg.vx ** 2 + arg.vz ** 2);
    expect(speed).toBeCloseTo(10, 5);
  });
});

describe('attack: summon_wave', () => {
  it('phase 1 召 4 个 skeleton_soldier (mode=bossSummon)', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SKELETON_KING_ATTACKS.summon_wave(bossAt(1), ctx);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(4);
    expect(effects.spawnEnemyByTypeSpy.mock.calls[0][0]).toBe('skeleton_soldier');
    expect(effects.spawnEnemyByTypeSpy.mock.calls[0][3].mode).toBe('bossSummon');
  });

  it('phase 2 召 4 个 zombie', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SKELETON_KING_ATTACKS.summon_wave(bossAt(2), ctx);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(4);
    expect(effects.spawnEnemyByTypeSpy.mock.calls[0][0]).toBe('zombie');
  });

  it('phase 3 召 8 个 zombie', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SKELETON_KING_ATTACKS.summon_wave(bossAt(3), ctx);
    expect(effects.spawnEnemyByTypeSpy).toHaveBeenCalledTimes(8);
  });

  it('达 MAX_ENEMIES 时停', () => {
    const effects = makeAiEffects();
    const enemies = Array.from({ length: 100 }, (_, i) =>
      makeEnemy(i + 1, 'skeleton_soldier', 0, 0));
    const ctx = makeAiContext({ effects, enemies });
    SKELETON_KING_ATTACKS.summon_wave(bossAt(1), ctx);
    expect(effects.spawnEnemyByTypeSpy).not.toHaveBeenCalled();
  });
});

describe('attack: charge', () => {
  it('boss.speed 设为 12.0', () => {
    const boss = bossAt(2);
    boss.speed = 4.0;
    SKELETON_KING_ATTACKS.charge(boss, makeAiContext());
    expect(boss.speed).toBe(12.0);
  });
});

describe('attack: dark_rain', () => {
  it('在玩家附近落 6 颗投射物 (15 dmg, vy=-12)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);  // ox/oz 都是 0
    const effects = makeAiEffects();
    const player = makePlayer({ x: 10, z: 20 });
    const ctx = makeAiContext({ player, effects });
    SKELETON_KING_ATTACKS.dark_rain(bossAt(3), ctx);
    expect(effects.spawnProjectileSpy).toHaveBeenCalledTimes(6);
    const arg = effects.spawnProjectileSpy.mock.calls[0][0];
    expect(arg.damage).toBe(15);
    expect(arg.vy).toBe(-12);
    expect(arg.y).toBe(10);
    expect(arg.x).toBeCloseTo(10, 5);
    expect(arg.z).toBeCloseTo(20, 5);
    vi.restoreAllMocks();
  });
});

describe('attack: idle (no-op)', () => {
  it('不消费 random / 不调副作用', () => {
    const effects = makeAiEffects();
    const ctx = makeAiContext({ effects });
    SKELETON_KING_ATTACKS.idle(bossAt(1), ctx);
    expect(effects.spawnProjectileSpy).not.toHaveBeenCalled();
    expect(effects.damagePlayerSpy).not.toHaveBeenCalled();
    expect(effects.spawnEnemyByTypeSpy).not.toHaveBeenCalled();
  });
});
