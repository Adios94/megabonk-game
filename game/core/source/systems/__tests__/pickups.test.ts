/**
 * pickups.{processDeaths, tickPickups, tickThorns} 单元测试.
 */
import { describe, it, expect } from 'vitest';
import { processDeaths, tickPickups, tickThorns } from '../pickups.ts';
import { makeEngine, makeEnemy, makePlayer } from './_fixtures.ts';
import type { PickupState } from '../../types.ts';

describe('processDeaths', () => {
  it('hp ≤ 0 enemy 被 splice + kill++ + combo++', () => {
    const engine = makeEngine();
    engine.state.enemies = [
      makeEnemy(1, 'skeleton_soldier', 5, 5, { hp: 0 }),
      makeEnemy(2, 'skeleton_soldier', 0, 0, { hp: 30 }),
    ];
    processDeaths(engine);
    expect(engine.state.enemies).toHaveLength(1);
    expect(engine.state.enemies[0].id).toBe(2);
    expect(engine.state.stats.killCount).toBe(1);
    expect(engine.state.player.comboCount).toBe(1);
    expect(engine.state.player.comboTimer).toBeCloseTo(2.0, 5);
  });

  it('每只死敌生成至少 1 个 XP pickup', () => {
    const engine = makeEngine();
    engine.state.enemies = [makeEnemy(1, 'skeleton_soldier', 5, 5, { hp: 0 })];
    processDeaths(engine);
    expect(engine.state.pickups.length).toBeGreaterThanOrEqual(1);
    const xpPickup = engine.state.pickups.find(p =>
      p.type === 'xp_green' || p.type === 'xp_blue' || p.type === 'xp_purple' || p.type === 'xp_orange'
    );
    expect(xpPickup).toBeDefined();
  });

  it('Elite enemy 多掉 1 个 silver', () => {
    const engine = makeEngine();
    engine.state.enemies = [
      makeEnemy(1, 'skeleton_knight', 5, 5, { hp: 0, isElite: true }),
    ];
    processDeaths(engine);
    const silverPickup = engine.state.pickups.find(p => p.type === 'silver');
    expect(silverPickup).toBeDefined();
    expect(silverPickup!.value).toBe(5);
  });
});

describe('tickPickups: 寿命衰减', () => {
  function makePickup(overrides: Partial<PickupState> = {}): PickupState {
    return {
      id: 1, type: 'xp_green',
      x: 0, y: 0.2, z: 0,
      value: 1, lifetime: 5, attracted: false,
      ...overrides,
    };
  }

  it('lifetime ≤ 0 时 splice', () => {
    const engine = makeEngine();
    engine.state.pickups.push(makePickup({ lifetime: 0.01 }));
    tickPickups(engine, 0.1);
    expect(engine.state.pickups).toHaveLength(0);
  });
});

describe('tickPickups: 拾取吸附 + collect', () => {
  it('在 pickupRadius 内 attracted=true 后向玩家移动', () => {
    const player = makePlayer({ x: 0, z: 0, pickupRadius: 5 });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const pickup = { id: 1, type: 'xp_green' as const, x: 3, y: 0.2, z: 0, value: 1, lifetime: 5, attracted: false };
    engine.state.pickups.push(pickup);
    tickPickups(engine, 0.05);
    expect(pickup.attracted).toBe(true);
    expect(pickup.x).toBeLessThan(3);  // 已移动
  });

  it('XP pickup 距离 < 0.5 时 collect → player.xp 增加', () => {
    const player = makePlayer({ x: 0, z: 0, xp: 0, pickupRadius: 5 });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    engine.state.pickups.push({
      id: 1, type: 'xp_green', x: 0.3, y: 0.2, z: 0,
      value: 5, lifetime: 5, attracted: true,
    });
    tickPickups(engine, 0.01);
    expect(engine.state.pickups).toHaveLength(0);
    expect(player.xp).toBeGreaterThan(0);
  });

  it('Silver pickup → silverEarned 增加', () => {
    const player = makePlayer({ x: 0, z: 0, pickupRadius: 5 });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    engine.state.pickups.push({
      id: 1, type: 'silver', x: 0.3, y: 0.2, z: 0,
      value: 7, lifetime: 5, attracted: true,
    });
    tickPickups(engine, 0.01);
    expect(engine.state.stats.silverEarned).toBe(7);
  });

  it('Health pickup 治疗到 maxHp', () => {
    const player = makePlayer({ x: 0, z: 0, hp: 30, maxHp: 100, pickupRadius: 5 });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    engine.state.pickups.push({
      id: 1, type: 'health', x: 0.3, y: 0.2, z: 0,
      value: 50, lifetime: 5, attracted: true,
    });
    tickPickups(engine, 0.01);
    expect(player.hp).toBe(80);
  });

  it('Health pickup 不溢出 maxHp', () => {
    const player = makePlayer({ x: 0, z: 0, hp: 90, maxHp: 100, pickupRadius: 5 });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    engine.state.pickups.push({
      id: 1, type: 'health', x: 0.3, y: 0.2, z: 0,
      value: 50, lifetime: 5, attracted: true,
    });
    tickPickups(engine, 0.01);
    expect(player.hp).toBe(100);
  });
});

describe('tickThorns', () => {
  it('thorns_tome lv2 → 1.5 内 enemy 被反伤 6 (level × 3)', () => {
    const player = makePlayer({ x: 0, z: 0, tomes: [{ type: 'thorns_tome', level: 2 }] });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const enemy = makeEnemy(1, 'skeleton_soldier', 1.0, 0, { hp: 30 });
    engine.state.enemies = [enemy];
    tickThorns(engine);
    expect(enemy.hp).toBe(24);  // 30 - 6
    expect(enemy.hitFlashTimer).toBeCloseTo(0.1, 5);
    expect(engine.state.stats.damageDealt).toBe(6);
  });

  it('1.5 外不伤害', () => {
    const player = makePlayer({ x: 0, z: 0, tomes: [{ type: 'thorns_tome', level: 5 }] });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const enemy = makeEnemy(1, 'skeleton_soldier', 5, 0, { hp: 30 });
    engine.state.enemies = [enemy];
    tickThorns(engine);
    expect(enemy.hp).toBe(30);
  });

  it('无 thorns_tome no-op', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 0.5, 0, { hp: 30 });
    engine.state.enemies = [enemy];
    tickThorns(engine);
    expect(enemy.hp).toBe(30);
  });
});
