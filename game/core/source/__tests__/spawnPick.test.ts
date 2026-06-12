import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickRandomOne, pickRandomSubset } from '../spawnPick.ts';

describe('spawnPick', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('pickRandomSubset 无放回抽取固定数量', () => {
    const picked = pickRandomSubset([1, 2, 3, 4], 2);
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
  });

  it('pickRandomOne 从候选中选 1 个', () => {
    const picked = pickRandomOne([{ x: 1 }, { x: 2 }]);
    expect(picked).toBeDefined();
    expect([1, 2]).toContain(picked!.x);
    expect(pickRandomOne([])).toBeUndefined();
  });
});
