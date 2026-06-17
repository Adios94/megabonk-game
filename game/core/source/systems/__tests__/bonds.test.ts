import { describe, expect, it } from 'vitest';
import { tickBonds } from '../bonds.ts';
import { makeEngine, makeEnemy, makePlayer } from './_fixtures.ts';

const ARCANE_WEAPONS = [
  { type: 'lightning_staff' as const, level: 2, cooldownTimer: 0 },
  { type: 'flame_ring' as const, level: 2, cooldownTimer: 0 },
  { type: 'void_ripple' as const, level: 2, cooldownTimer: 0 },
  { type: 'scorch_boots' as const, level: 2, cooldownTimer: 0 },
];

describe('arcane bond', () => {
  it('T2 bursts at 60 mystery with higher damage and doubled splash radius', () => {
    const player = makePlayer({
      bonds: [{ bondId: 'arcane', tier: 2 }],
      bondMystery: 60,
      weapons: ARCANE_WEAPONS,
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const target = makeEnemy(1, 'necromancer', 20, 0, { hp: 200, maxHp: 200 });
    const inSplash = makeEnemy(2, 'skeleton_soldier', 25, 0, { hp: 100, maxHp: 100 });
    const outOfSplash = makeEnemy(3, 'skeleton_soldier', 27, 0, { hp: 100, maxHp: 100 });
    engine.state.enemies = [target, inSplash, outOfSplash];

    tickBonds(engine, 0.1);

    expect(player.bondMystery).toBe(0);
    expect(target.hp).toBe(144); // avg level 2 * burstPerLevel 28
    expect(inSplash.hp).toBe(72); // 50% splash within 6m
    expect(outOfSplash.hp).toBe(100);
    expect(engine.state.bondVfxEvents).toHaveLength(1);
  });

  it('T3 bursts at 30 mystery and keeps its damage multiplier', () => {
    const player = makePlayer({
      bonds: [{ bondId: 'arcane', tier: 3 }],
      bondMystery: 30,
      weapons: ARCANE_WEAPONS,
    });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const target = makeEnemy(1, 'necromancer', 20, 0, { hp: 300, maxHp: 300 });
    engine.state.enemies = [target];

    tickBonds(engine, 0.1);

    expect(player.bondMystery).toBe(0);
    expect(target.hp).toBe(216); // avg level 2 * burstPerLevel 28 * T3 1.5
  });
});
