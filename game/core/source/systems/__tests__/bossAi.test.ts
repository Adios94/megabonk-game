/**
 * Boss AI movement / terrain-following behavior.
 */
import { describe, it, expect } from 'vitest';
import { tickBossAi } from '../bossAi.ts';
import { getTerrainHeightAt, makeLevelGeometry } from '../levelGeometry.ts';
import { makeAiContext, makeBoss, makePlayer } from '../../ai/__tests__/_fixtures.ts';

describe('tickBossAi terrain following', () => {
  it('does not snap boss to an unreachable platform above the same XZ', () => {
    const geo = makeLevelGeometry({
      collisionRects: [{ cx: 0, cz: 0, halfW: 4, halfD: 4, height: 3 }],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [],
    });
    const boss = makeBoss(0, 0);
    boss.y = 0;
    boss.attackTimer = 10;

    const ctx = makeAiContext({
      player: makePlayer({ x: 0, y: 0, z: 0 }),
      boss,
      geo,
      getTerrainHeight: (x, z) => getTerrainHeightAt(geo, x, z),
    });

    tickBossAi(boss, ctx);

    expect(getTerrainHeightAt(geo, boss.x, boss.z)).toBe(3);
    expect(boss.y).toBe(0);
  });

  it('keeps boss on a platform that is already within step reach', () => {
    const geo = makeLevelGeometry({
      collisionRects: [{ cx: 0, cz: 0, halfW: 4, halfD: 4, height: 3 }],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [],
    });
    const boss = makeBoss(0, 0);
    boss.y = 2.8;
    boss.attackTimer = 10;

    const ctx = makeAiContext({
      player: makePlayer({ x: 0, y: 3, z: 0 }),
      boss,
      geo,
      getTerrainHeight: (x, z) => getTerrainHeightAt(geo, x, z),
    });

    tickBossAi(boss, ctx);

    expect(boss.y).toBe(3);
  });
});
