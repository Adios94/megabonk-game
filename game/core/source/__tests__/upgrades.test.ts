import { describe, expect, it } from 'vitest';
import { computeActiveWeaponSlots, xpForLevel } from '../upgrades.ts';

describe('xpForLevel', () => {
  it('L ≤ 10 沿用早期线性公式', () => {
    expect(xpForLevel(1)).toBe(Math.floor(10 * (1 + 1 * 0.35)));
    expect(xpForLevel(10)).toBe(Math.floor(10 * (1 + 10 * 0.35)));
  });

  it('L 11-40 叠加二次增长', () => {
    expect(xpForLevel(20)).toBe(Math.floor(10 * (1 + 20 * 0.35) + Math.pow(10, 2) * 0.5));
    expect(xpForLevel(40)).toBe(Math.floor(10 * (1 + 40 * 0.35) + Math.pow(30, 2) * 0.5));
  });

  it('L > 40 从新中期曲线继续指数增长', () => {
    const level40 = Math.floor(10 * (1 + 40 * 0.35) + Math.pow(30, 2) * 0.5);
    expect(xpForLevel(41)).toBe(Math.floor(level40 * Math.pow(1.0725, 1)));
    expect(xpForLevel(100)).toBe(Math.floor(level40 * Math.pow(1.0725, 60)));
  });
});

describe('computeActiveWeaponSlots', () => {
  it('局内等级解锁最高 5 槽（无局外奖励）', () => {
    expect(computeActiveWeaponSlots(1, 5)).toBe(1);
    expect(computeActiveWeaponSlots(4, 5)).toBe(1);
    expect(computeActiveWeaponSlots(5, 5)).toBe(2);
    expect(computeActiveWeaponSlots(10, 5)).toBe(3);
    expect(computeActiveWeaponSlots(30, 5)).toBe(5);
    expect(computeActiveWeaponSlots(50, 5)).toBe(5);
  });

  it('局外 +1 槽任务后 50 级解锁第 6 槽', () => {
    expect(computeActiveWeaponSlots(30, 6)).toBe(5);
    expect(computeActiveWeaponSlots(50, 6)).toBe(6);
  });
});
