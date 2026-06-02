/**
 * data/tomes.ts 单元测试 —— 验证每个 tome 的 modifier 形态.
 *
 * 注：modifier 数值的"应用后等价"由 recomputePlayerStats.test.ts 覆盖（端到端等价）。
 * 本文件只检查 shape (kind/stat/value 是否匹配预期).
 */
import { describe, it, expect } from 'vitest';
import { TOMES, TOME_MAX_LEVELS_FROM_DATA } from '../tomes.ts';
import { TOME_MAX_LEVELS } from '../../config.ts';
import type { TomeType } from '../../types.ts';

describe('TOMES table', () => {
  it('包含所有 10 种 tome', () => {
    const types: TomeType[] = [
      'attack_speed_tome', 'luck_tome', 'thorns_tome', 'shield_tome',
      'xp_gain_tome', 'attraction_tome', 'curse_tome', 'precision_tome',
      'knockback_tome', 'speed_tome',
    ];
    for (const t of types) {
      expect(TOMES[t]).toBeDefined();
      expect(TOMES[t].type).toBe(t);
    }
  });

  it('TOME_MAX_LEVELS_FROM_DATA 与 config.TOME_MAX_LEVELS 一致 (单一 source of truth 校验)', () => {
    for (const key of Object.keys(TOME_MAX_LEVELS) as TomeType[]) {
      expect(TOME_MAX_LEVELS_FROM_DATA[key]).toBe(TOME_MAX_LEVELS[key]);
    }
  });

  it('contextual tomes (thorns/knockback/luck/xp_gain/curse) 的 modifiers 是空数组', () => {
    expect(TOMES.thorns_tome.modifiers(5)).toEqual([]);
    expect(TOMES.knockback_tome.modifiers(3)).toEqual([]);
    expect(TOMES.luck_tome.modifiers(3)).toEqual([]);
    expect(TOMES.xp_gain_tome.modifiers(5)).toEqual([]);
    expect(TOMES.curse_tome.modifiers(3)).toEqual([]);
    expect(TOMES.thorns_tome.contextOnly).toBe(true);
  });
});

describe('attack_speed_tome modifiers', () => {
  it.each([1, 2, 3, 4, 5])('lv %i 输出 increased attackSpeed = lv * 0.10', (lv) => {
    const mods = TOMES.attack_speed_tome.modifiers(lv);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toEqual({ kind: 'increased', stat: 'attackSpeed', value: lv * 0.10 });
  });
});

describe('speed_tome modifiers', () => {
  it.each([1, 3, 5])('lv %i 输出 increased moveSpeed = lv * 0.08', (lv) => {
    const mods = TOMES.speed_tome.modifiers(lv);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toEqual({ kind: 'increased', stat: 'moveSpeed', value: lv * 0.08 });
  });
});

describe('attraction_tome modifiers', () => {
  it('lv 3 输出 added pickupRadius ≈ 3.6 (FP 容差)', () => {
    const mods = TOMES.attraction_tome.modifiers(3);
    expect(mods).toHaveLength(1);
    expect(mods[0].kind).toBe('added');
    expect(mods[0].stat).toBe('pickupRadius');
    expect(mods[0].value).toBeCloseTo(3.6, 9);
  });
});

describe('shield_tome modifiers', () => {
  it('lv 5 输出 added armor = 10 (二次减免在 contextual 路径不在此 def)', () => {
    const mods = TOMES.shield_tome.modifiers(5);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toEqual({ kind: 'added', stat: 'armor', value: 10 });
  });
});

describe('precision_tome modifiers', () => {
  it('lv 5 输出 2 个 modifier (critChance + critDamage 都用 added)', () => {
    const mods = TOMES.precision_tome.modifiers(5);
    expect(mods).toHaveLength(2);
    expect(mods).toContainEqual({ kind: 'added', stat: 'critChance', value: 0.25 });
    expect(mods).toContainEqual({ kind: 'added', stat: 'critDamage', value: 0.5 });
  });
});
