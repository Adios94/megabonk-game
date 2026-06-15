import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../../config.ts';
import { makeLevelGeometry } from '../collision.ts';
import { generateShrines, isShrineSpotWalkable } from '../shrines.ts';
import type { LevelData } from '../../types.ts';

function geoFor(partial: Partial<LevelData>) {
  return makeLevelGeometry({
    collisionRects: [],
    walls: [],
    climbVolumes: [],
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
    ...partial,
  });
}

describe('isShrineSpotWalkable', () => {
  it('colcyl_ 平台圆心：地面高度玩家无法踏入 → 不可走', () => {
    const geo = geoFor({
      collisionDiscs: [{ cx: 10, cz: 10, radius: 3, height: 2, baseY: 0 }],
    });
    expect(isShrineSpotWalkable(geo, 10, 10)).toBe(false);
  });

  it('开阔平地：可走', () => {
    const geo = geoFor({
      collisionRects: [{ cx: 0, cz: 0, halfW: 30, halfD: 30, height: 0, baseY: 0 }],
    });
    expect(isShrineSpotWalkable(geo, 5, 5)).toBe(true);
  });
});

describe('generateShrines', () => {
  it('有 geo 时不会刷在 colcyl_ 圆心', () => {
    const geo = geoFor({
      collisionDiscs: [
        { cx: 20, cz: 0, radius: 4, height: 2, baseY: 0 },
        { cx: -18, cz: 15, radius: 4, height: 2, baseY: 0 },
        { cx: 0, cz: -22, radius: 4, height: 2, baseY: 0 },
      ],
      collisionRects: [{ cx: 0, cz: 0, halfW: 40, halfD: 40, height: 0, baseY: 0 }],
    });
    const shrines = generateShrines(DEFAULT_GAME_CONFIG, geo);
    expect(shrines).toHaveLength(3);
    for (const s of shrines) {
      expect(isShrineSpotWalkable(geo, s.x, s.z)).toBe(true);
      expect(s.y).toBeDefined();
    }
  });
});
