/**
 * weapons.{tickWeapons, getWeaponStats, checkWeaponEvolutions} 单元测试.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tickWeapons,
  getWeaponStats,
  checkWeaponEvolutions,
} from '../weapons.ts';
import { makeEngine, makePlayer } from './_fixtures.ts';
import { WEAPON_STATS } from '../../config.ts';

describe('getWeaponStats', () => {
  it('lv 1 sword → 第一档 stats', () => {
    const stats = getWeaponStats({ type: 'sword', level: 1, cooldownTimer: 0, evolved: false });
    expect(stats).toEqual(WEAPON_STATS.sword[0]);
  });

  it('lv 8 sword → 第 8 档 (idx 7)', () => {
    const stats = getWeaponStats({ type: 'sword', level: 8, cooldownTimer: 0, evolved: false });
    expect(stats).toEqual(WEAPON_STATS.sword[7]);
  });

  it('lv > 表长度 → clamp 到最后一档', () => {
    const stats = getWeaponStats({ type: 'sword', level: 99, cooldownTimer: 0, evolved: false });
    expect(stats).toEqual(WEAPON_STATS.sword[7]);
  });

  it('evolved=true → max stats × 进化乘子 + projectileCount +1', () => {
    const stats = getWeaponStats({ type: 'sword', level: 9, cooldownTimer: 0, evolved: true });
    const baseMax = WEAPON_STATS.sword[7];
    expect(stats.damage).toBeGreaterThan(baseMax.damage);
    expect(stats.projectileCount).toBe(baseMax.projectileCount + 1);
  });

  it('未知 weapon → fallback bone_bouncer 第一档', () => {
    const stats = getWeaponStats({ type: 'unknown_weapon' as never, level: 1, cooldownTimer: 0, evolved: false });
    expect(stats).toEqual(WEAPON_STATS.bone_bouncer[0]);
  });
});

describe('tickWeapons', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cooldownTimer > 0 时只衰减 不 fire', () => {
    const player = makePlayer({
      weapons: [{ type: 'sword', level: 1, cooldownTimer: 0.5, evolved: false }],
      attackSpeedMultiplier: 1.0,
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    tickWeapons(engine, 0.1);
    expect(player.weapons[0].cooldownTimer).toBeCloseTo(0.4, 5);
  });

  it('cooldownTimer ≤ 0 时重置 + 调 tryFireWeaponEcs (走真实路径)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);  // 不暴击
    const player = makePlayer({
      weapons: [{ type: 'sword', level: 1, cooldownTimer: -0.1, evolved: false }],
      attackSpeedMultiplier: 1.0,
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    tickWeapons(engine, 0.05);
    // sword level 1 cooldown = 0.8
    expect(player.weapons[0].cooldownTimer).toBeCloseTo(0.8, 5);
  });

  it('attackSpeedMultiplier 加快冷却衰减', () => {
    const player = makePlayer({
      weapons: [{ type: 'sword', level: 1, cooldownTimer: 1.0, evolved: false }],
      attackSpeedMultiplier: 2.0,
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    tickWeapons(engine, 0.1);
    // dt × 2 = 0.2 减速
    expect(player.weapons[0].cooldownTimer).toBeCloseTo(0.8, 5);
  });

  it('player 死时不 fire', () => {
    const player = makePlayer({
      alive: false,
      weapons: [{ type: 'sword', level: 1, cooldownTimer: 0, evolved: false }],
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    tickWeapons(engine, 0.1);
    expect(player.weapons[0].cooldownTimer).toBe(0);  // 没动
  });
});

describe('checkWeaponEvolutions', () => {
  it('level < 8 不进化', () => {
    const player = makePlayer({
      weapons: [{ type: 'bow', level: 7, cooldownTimer: 0, evolved: false }],
      tomes: [{ type: 'precision_tome', level: 3 }],
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    checkWeaponEvolutions(engine);
    expect(player.weapons[0].evolved).toBe(false);
  });

  it('level 8 + 对应 tome 满足 → evolved + level=9', () => {
    // bow 进化需要 precision_tome lv 3
    const player = makePlayer({
      weapons: [{ type: 'bow', level: 8, cooldownTimer: 0, evolved: false }],
      tomes: [{ type: 'precision_tome', level: 3 }],
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    checkWeaponEvolutions(engine);
    expect(player.weapons[0].evolved).toBe(true);
    expect(player.weapons[0].level).toBe(9);
  });

  it('level 8 但 tome 不够 → 不进化', () => {
    const player = makePlayer({
      weapons: [{ type: 'bow', level: 8, cooldownTimer: 0, evolved: false }],
      tomes: [{ type: 'precision_tome', level: 2 }],  // 需要 3
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    checkWeaponEvolutions(engine);
    expect(player.weapons[0].evolved).toBe(false);
  });

  it('已 evolved 不重复', () => {
    const player = makePlayer({
      weapons: [{ type: 'bow', level: 9, cooldownTimer: 0, evolved: true }],
      tomes: [{ type: 'precision_tome', level: 3 }],
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    checkWeaponEvolutions(engine);
    expect(player.weapons[0].level).toBe(9);  // 不变
  });
});
