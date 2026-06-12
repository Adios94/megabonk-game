import { describe, expect, it } from 'vitest';
import { onBondWeaponHit } from '../bonds.ts';
import { makeEngine, makeEnemy } from './_fixtures.ts';

describe('bond height filtering', () => {
  it('arc conductor chain does not hit marked targets on another layer', () => {
    const engine = makeEngine();
    engine.state.player.bonds = [{ bondId: 'arc_conductor', tier: 2 }];

    const target = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100, y: 4 });
    const markedBelow = makeEnemy(2, 'skeleton_soldier', 1, 0, {
      hp: 100,
      y: 0,
      conductorMarkTimer: 2,
    });
    engine.state.enemies = [target, markedBelow];

    onBondWeaponHit(engine, 'ray_gun', target, 100, false);
    expect(markedBelow.hp).toBe(100);
  });

  it('ember explosion does not splash targets on another layer', () => {
    const engine = makeEngine();
    engine.state.player.bonds = [{ bondId: 'ember_trail', tier: 2 }];

    const killed = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 0, maxHp: 100, y: 4 });
    const below = makeEnemy(2, 'skeleton_soldier', 1, 0, { hp: 100, y: 0 });
    engine.state.enemies = [killed, below];

    onBondWeaponHit(engine, 'flame_ring', killed, 50, false);
    expect(below.hp).toBe(100);
  });
});
