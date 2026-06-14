import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../spatial-hash.ts';

describe('SpatialHash', () => {
  it('deduplicates entries inserted into multiple cells', () => {
    const hash = new SpatialHash(1);
    hash.insert(7, 0, 0, 2);

    expect(hash.query(0, 0, 2)).toEqual([7]);
  });

  it('returned query results are not mutated by later queries', () => {
    const hash = new SpatialHash(1);
    hash.insert(1, 0, 0, 0.2);
    hash.insert(2, 10, 0, 0.2);

    const first = hash.query(0, 0, 1);
    const second = hash.query(10, 0, 1);

    expect(first).toEqual([1]);
    expect(second).toEqual([2]);
  });
});
