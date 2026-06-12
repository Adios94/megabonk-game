/**
 * helpers 单元测试 —— findNearest* / addDamageEvent / applyKnockback / checkPlayerDeath / checkGameOver.
 */
import { describe, it, expect } from 'vitest';
import {
  findNearestEnemy,
  findNearestEnemyExcluding,
  findEnemyById,
  addDamageEvent,
  applyKnockback,
  checkPlayerDeath,
  checkGameOver,
} from '../helpers.ts';
import { makeEngine, makeEnemy, makePlayer, makeBoss } from './_fixtures.ts';

describe('findNearestEnemy', () => {
  it('返回最近的 alive enemy', () => {
    const engine = makeEngine();
    engine.state.enemies = [
      makeEnemy(1, 'skeleton_soldier', 10, 0),
      makeEnemy(2, 'skeleton_soldier', 3, 0),
      makeEnemy(3, 'skeleton_soldier', 7, 0),
    ];
    const e = findNearestEnemy(engine, 0, 0);
    expect(e?.id).toBe(2);
  });

  it('忽略 hp ≤ 0', () => {
    const engine = makeEngine();
    engine.state.enemies = [
      makeEnemy(1, 'skeleton_soldier', 1, 0, { hp: 0 }),
      makeEnemy(2, 'skeleton_soldier', 5, 0),
    ];
    const e = findNearestEnemy(engine, 0, 0);
    expect(e?.id).toBe(2);
  });

  it('maxRange 限制', () => {
    const engine = makeEngine();
    engine.state.enemies = [makeEnemy(1, 'skeleton_soldier', 50, 0)];
    expect(findNearestEnemy(engine, 0, 0, 10)).toBeNull();
    expect(findNearestEnemy(engine, 0, 0)).not.toBeNull();
  });
});

describe('findNearestEnemyExcluding', () => {
  it('排除指定 id, 默认 maxRange=20', () => {
    const engine = makeEngine();
    engine.state.enemies = [
      makeEnemy(1, 'skeleton_soldier', 3, 0),
      makeEnemy(2, 'skeleton_soldier', 5, 0),
    ];
    expect(findNearestEnemyExcluding(engine, 0, 0, [1])?.id).toBe(2);
    expect(findNearestEnemyExcluding(engine, 0, 0, [1, 2])).toBeNull();
  });

  it('25 远 (>20) 也返回 null', () => {
    const engine = makeEngine();
    engine.state.enemies = [makeEnemy(1, 'skeleton_soldier', 25, 0)];
    expect(findNearestEnemyExcluding(engine, 0, 0, [])).toBeNull();
  });
});

describe('findEnemyById', () => {
  it('hit / miss', () => {
    const engine = makeEngine();
    const e1 = makeEnemy(7, 'skeleton_soldier', 0, 0);
    engine.state.enemies = [e1];
    expect(findEnemyById(engine, 7)).toBe(e1);
    expect(findEnemyById(engine, 999)).toBeNull();
  });
});

describe('addDamageEvent', () => {
  it('push 到 state.damageEvents 带可选 weaponType', () => {
    const engine = makeEngine();
    addDamageEvent(engine, 1, 2, 3, 50, true, false, 'sword');
    expect(engine.state.damageEvents).toHaveLength(1);
    const evt = engine.state.damageEvents[0];
    expect(evt.damage).toBe(50);
    expect(evt.isCrit).toBe(true);
    expect(evt.isPlayerDamage).toBe(false);
    expect(evt.weaponType).toBe('sword');
  });
});

describe('applyKnockback', () => {
  it('基础力 1.5 沿远离方向推', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 5, 0);  // 玩家 (0,0), enemy +x
    applyKnockback(engine, enemy, 0, 0);
    expect(enemy.x).toBeCloseTo(6.5, 5);
    expect(enemy.z).toBe(0);
  });

  it('knockback_tome lv2 → 力 ×1.6 = 2.4', () => {
    const player = makePlayer({ tomes: [{ type: 'knockback_tome', level: 2 }] });
    const engine = makeEngine({ state: { ...makeEngine().state, player } });
    const enemy = makeEnemy(1, 'skeleton_soldier', 5, 0);
    applyKnockback(engine, enemy, 0, 0);
    expect(enemy.x).toBeCloseTo(7.4, 5);
  });

  it('被 mapSize+10 半径 clamp', () => {
    const engine = makeEngine();
    engine.config = { ...engine.config, mapSize: 100 };
    const enemy = makeEnemy(1, 'skeleton_soldier', 60, 0);  // 已超 halfMap=55
    applyKnockback(engine, enemy, 0, 0);
    expect(enemy.x).toBeLessThanOrEqual(55);
  });
});

describe('checkPlayerDeath', () => {
  it('hp ≤ 0 时 alive=false', () => {
    const engine = makeEngine();
    engine.state.player.hp = 0;
    checkPlayerDeath(engine);
    expect(engine.state.player.alive).toBe(false);
  });

  it('hp > 0 不变', () => {
    const engine = makeEngine();
    engine.state.player.hp = 5;
    checkPlayerDeath(engine);
    expect(engine.state.player.alive).toBe(true);
  });
});

describe('checkGameOver', () => {
  it('player 死 → defeat / finished / running=false', () => {
    const engine = makeEngine();
    engine.state.player.alive = false;
    engine.state.running = true;
    checkGameOver(engine);
    expect(engine.state.phase).toBe('defeat');
    expect(engine.state.finished).toBe(true);
    expect(engine.state.running).toBe(false);
  });

  it('第一关 boss hp ≤ 0 → portal_open + silver +50 + boss 宝箱', () => {
    const engine = makeEngine();
    engine.config.tier = 2;
    engine.state.tier = 2;
    engine.state.stage = 1;
    engine.state.boss = makeBoss();
    engine.state.boss.x = 6;
    engine.state.boss.z = -3;
    engine.state.boss.hp = 0;
    engine.state.phase = 'boss_fight';
    engine.state.running = true;
    engine.state.stats.silverEarned = 100;
    // 准备一个 boss_active 祭坛，验证它会被翻成 portal_ready
    engine.state.altars = [{
      x: 0, z: 0, phase: 'boss_active', summonTimer: 0, summonDuration: 1,
    }];
    checkGameOver(engine);
    expect(engine.state.phase).toBe('portal_open');
    expect(engine.state.finished).toBe(false);  // 游戏还没结束，玩家可选进传送门或留下
    expect(engine.state.boss).toBeNull();
    expect(engine.state.stats.silverEarned).toBe(150);
    expect(engine.state.altars[0].phase).toBe('portal_ready');
    expect(engine.state.chests).toHaveLength(1);
    expect(engine.state.chests[0]).toMatchObject({ x: 6, z: -3, opened: false, bossDrop: true });
  });

  it('第二关 boss hp ≤ 0 → 回到 playing，祭坛进入冷却', () => {
    const engine = makeEngine();
    engine.state.stage = 2;
    engine.state.boss = makeBoss();
    engine.state.boss.hp = 0;
    engine.state.phase = 'boss_fight';
    engine.state.altars = [{
      x: 0, z: 0, phase: 'boss_active', summonTimer: 0, summonDuration: 1,
    }];
    checkGameOver(engine);
    expect(engine.state.phase).toBe('playing');
    expect(engine.state.boss).toBeNull();
    expect(engine.state.altars[0].phase).toBe('cooldown');
    expect(engine.state.chests[0].bossDrop).toBe(true);
  });

  it('player 活, boss 没死 → 不变', () => {
    const engine = makeEngine();
    engine.state.boss = makeBoss();
    checkGameOver(engine);
    expect(engine.state.phase).toBe('playing');
    expect(engine.state.finished).toBe(false);
  });
});
