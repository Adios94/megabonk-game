/**
 * stats/ 单元测试 + computeWeaponDamage 集成测试。
 *
 * 17 用例覆盖：
 *   A. finalize() 纯函数 (5)
 *   B. StatBlock 行为 (8)
 *   C. computeWeaponDamage 集成 (4)
 *
 * 任何用例失败 = stat 管线漂移，禁止 commit。
 */
import { describe, it, expect } from 'vitest';
import {
  finalize,
  StatBlock,
  computeWeaponDamage,
} from '../index.ts';
import type { PlayerState } from '../../types.ts';

// ============================================================================
// A. finalize() 纯函数
// ============================================================================
describe('finalize()', () => {
  it('base only → base', () => {
    expect(finalize({ base: 10, added: 0, increased: 0, more: [] })).toBe(10);
  });

  it('base + added → base + added', () => {
    expect(finalize({ base: 10, added: 5, increased: 0, more: [] })).toBe(15);
  });

  it('increased 累加: 10 × (1 + 0.3) = 13', () => {
    expect(finalize({ base: 10, added: 0, increased: 0.3, more: [] })).toBe(13);
  });

  it('more 独立相乘: 10 × 1.2 × 1.15 ≈ 13.8', () => {
    expect(finalize({ base: 10, added: 0, increased: 0, more: [1.2, 1.15] })).toBeCloseTo(13.8);
  });

  it('完整 PoE 公式: (10 + 5) × 1.5 × 1.2 × 1.1 = 29.7', () => {
    expect(finalize({ base: 10, added: 5, increased: 0.5, more: [1.2, 1.1] })).toBeCloseTo(29.7);
  });
});

// ============================================================================
// B. StatBlock 行为
// ============================================================================
describe('StatBlock', () => {
  it('setBase + getStat 返回基础值，其余字段默认', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    expect(b.getStat('damage')).toEqual({ base: 10, added: 0, increased: 0, more: [] });
  });

  it('未 setBase 的 stat: base = 0', () => {
    const b = new StatBlock();
    expect(b.getStat('whatever').base).toBe(0);
  });

  it('applyModifier added 多次 → added 求和', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 3 });
    b.applyModifier({ kind: 'added', stat: 'damage', value: 7 });
    expect(b.getStat('damage').added).toBe(10);
  });

  it('applyModifier increased 多次 → 同桶相加', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'increased', stat: 'damage', value: 0.10 });
    b.applyModifier({ kind: 'increased', stat: 'damage', value: 0.20 });
    expect(b.getStat('damage').increased).toBeCloseTo(0.30);
  });

  it('applyModifier more 多次 → more 数组追加', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'more', stat: 'damage', value: 1.2 });
    b.applyModifier({ kind: 'more', stat: 'damage', value: 1.5 });
    expect(b.getStat('damage').more).toEqual([1.2, 1.5]);
  });

  it('无 tag modifier 在 query 无 tag / 有 tag 时都生效', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5 });
    expect(b.getStat('damage').added).toBe(5);
    expect(b.getStat('damage', []).added).toBe(5);
    expect(b.getStat('damage', ['fire']).added).toBe(5);
  });

  it('单 tag modifier: query 含该 tag 才生效', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5, tags: ['fire'] });
    expect(b.getStat('damage', ['fire']).added).toBe(5);
    expect(b.getStat('damage', ['fire', 'spell']).added).toBe(5);
    expect(b.getStat('damage', []).added).toBe(0);
    expect(b.getStat('damage', ['cold']).added).toBe(0);
    expect(b.getStat('damage').added).toBe(0);
  });

  it('多 tag modifier (superset AND): query 必须包含全部', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5, tags: ['fire', 'spell'] });
    expect(b.getStat('damage', ['fire', 'spell', 'aoe']).added).toBe(5); // superset OK
    expect(b.getStat('damage', ['fire', 'spell']).added).toBe(5);        // 完全等同 OK
    expect(b.getStat('damage', ['fire']).added).toBe(0);                 // 缺 'spell'
    expect(b.getStat('damage', ['spell']).added).toBe(0);                // 缺 'fire'
    expect(b.getStat('damage', []).added).toBe(0);
  });

  it('getFinal === finalize(getStat(...)) 一致性', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5 });
    b.applyModifier({ kind: 'increased', stat: 'damage', value: 0.5 });
    b.applyModifier({ kind: 'more', stat: 'damage', value: 1.2 });
    expect(b.getFinal('damage')).toBeCloseTo(finalize(b.getStat('damage')));
    expect(b.getFinal('damage')).toBeCloseTo(27); // (10+5) × 1.5 × 1.2 = 27
  });

  it('多种 kind 修饰符混合: (10+5) × (1+0.5) × 1.2 = 27', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5 });
    b.applyModifier({ kind: 'increased', stat: 'damage', value: 0.5 });
    b.applyModifier({ kind: 'more', stat: 'damage', value: 1.2 });
    expect(b.getFinal('damage')).toBeCloseTo(27);
  });

  it('不同 stat 的 modifier 互不影响', () => {
    const b = new StatBlock();
    b.setBase('damage', 10);
    b.setBase('attackSpeed', 1.0);
    b.applyModifier({ kind: 'added', stat: 'damage', value: 5 });
    b.applyModifier({ kind: 'increased', stat: 'attackSpeed', value: 0.5 });
    expect(b.getStat('damage').added).toBe(5);
    expect(b.getStat('damage').increased).toBe(0);
    expect(b.getStat('attackSpeed').added).toBe(0);
    expect(b.getStat('attackSpeed').increased).toBeCloseTo(0.5);
  });
});

// ============================================================================
// C. computeWeaponDamage 集成
// ============================================================================
describe('computeWeaponDamage()', () => {
  // 仅模拟 PlayerState 中 computeWeaponDamage 实际读到的字段
  const mkPlayer = (dM: number, cD: number): PlayerState =>
    ({ damageMultiplier: dM, critDamage: cD } as unknown as PlayerState);

  it('dM=1.0, no crit, base=12 → 12 (恒等)', () => {
    expect(computeWeaponDamage(12, mkPlayer(1.0, 1.5), ['sword', 'melee'], false)).toBe(12);
  });

  it('dM=1.5, crit, cD=2.0, base=10 → 30', () => {
    expect(computeWeaponDamage(10, mkPlayer(1.5, 2.0), ['sword', 'melee'], true)).toBe(30);
  });

  it('dM=1.2, no crit, base=12 → 14 (megachad sword Lv1, 与重构前 fireSword 等价)', () => {
    // round(12 × 1.2) = round(14.4) = 14
    expect(computeWeaponDamage(12, mkPlayer(1.2, 1.5), ['sword', 'melee'], false)).toBe(14);
  });

  it('dM=1.2, crit, cD=1.5, base=12 → 22 (round(12 × 1.2 × 1.5) = round(21.6))', () => {
    expect(computeWeaponDamage(12, mkPlayer(1.2, 1.5), ['sword', 'melee'], true)).toBe(22);
  });
});
