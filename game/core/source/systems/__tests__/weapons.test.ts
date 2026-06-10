/**
 * weapons.{tickWeapons, getWeaponStats, applyWeaponUpgrade} 单元测试.
 * （武器进化已被羁绊系统取代，相关测试移到 bonds 体系。）
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tickWeapons,
  getWeaponStats,
  applyWeaponUpgrade,
  emptyWeaponGrowth,
} from '../weapons.ts';
import { makeEngine, makePlayer } from './_fixtures.ts';
import { WEAPON_STATS, WEAPON_MAX_LEVEL } from '../../config.ts';
import type { WeaponState } from '../../types.ts';

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

  it('未知 weapon → fallback bone_bouncer 第一档', () => {
    const stats = getWeaponStats({ type: 'unknown_weapon' as never, level: 1, cooldownTimer: 0, evolved: false });
    expect(stats).toEqual(WEAPON_STATS.bone_bouncer[0]);
  });
});

describe('applyWeaponUpgrade (新规则: base + 稀有度缩放步进)', () => {
  function freshSword(): WeaponState {
    return { type: 'sword', level: 1, cooldownTimer: 0, evolved: false, growth: emptyWeaponGrowth() };
  }

  it('common 连续升级 → 数值与原配置表逐档一致', () => {
    const w = freshSword();
    for (let i = 0; i < 7; i++) applyWeaponUpgrade(w, 'common');
    expect(w.level).toBe(8);
    const stats = getWeaponStats(w);
    // common ×1.0 累加 7 段步进 = 表第 8 档（含整数字段）
    expect(stats.damage).toBe(WEAPON_STATS.sword[7].damage);
    expect(stats.projectileCount).toBe(WEAPON_STATS.sword[7].projectileCount);
    expect(stats.range).toBeCloseTo(WEAPON_STATS.sword[7].range, 5);
  });

  it('稀有度越高 → 同一步进数值增益越大', () => {
    const common = freshSword();
    const legendary = freshSword();
    applyWeaponUpgrade(common, 'common');
    applyWeaponUpgrade(legendary, 'legendary');
    expect(getWeaponStats(legendary).damage).toBeGreaterThan(getWeaponStats(common).damage);
  });

  it('legendary 单次伤害增益 = common 的 2 倍步进', () => {
    const base = WEAPON_STATS.sword[0].damage;
    const common = freshSword();
    const legendary = freshSword();
    applyWeaponUpgrade(common, 'common');
    applyWeaponUpgrade(legendary, 'legendary');
    const commonGain = getWeaponStats(common).damage - base;
    const legendaryGain = getWeaponStats(legendary).damage - base;
    expect(legendaryGain).toBe(commonGain * 2);
  });

  it('超过表长后仍可成长（9/10 级），level 封顶 WEAPON_MAX_LEVEL', () => {
    const w = freshSword();
    for (let i = 0; i < 20; i++) applyWeaponUpgrade(w, 'common');
    expect(w.level).toBe(WEAPON_MAX_LEVEL);
    // 10 级伤害应高于 8 级（表末档）
    expect(getWeaponStats(w).damage).toBeGreaterThan(WEAPON_STATS.sword[7].damage);
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
