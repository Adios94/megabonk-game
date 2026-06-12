/**
 * collisions.processCollisions 单元测试 —— 4 类碰撞 + 击退 + pierce + bounce.
 *
 * 注：collisions.ts 直接 mutate state 不走 effects (与生产代码一致)，
 * 所以测试观察 enemy.hp / boss.hp / player.hp / projectiles.length.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { processCollisions } from '../collisions.ts';
import { makeEngine, makeEnemy, makePlayer, makeBoss } from './_fixtures.ts';
import type { ProjectileState } from '../../types.ts';

function makeProj(overrides: Partial<ProjectileState> = {}): ProjectileState {
  return {
    id: 1,
    weaponType: 'sword',
    x: 0, y: 1, z: 0,
    vx: 0, vy: 0, vz: 0,
    damage: 10,
    bouncesLeft: 0, pierceLeft: 0,
    lifetime: 2.0, radius: 0.5,
    fromPlayer: true,
    hitEnemyIds: [],
    ...overrides,
  };
}

describe('player projectile vs enemy', () => {
  it('碰到 enemy → hp 扣减 + projectile 销毁 + damageDealt 累加', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 0.2, 0, { hp: 50 });
    engine.state.enemies = [enemy];
    engine.state.projectiles.push(makeProj({ damage: 15, x: 0, z: 0 }));
    processCollisions(engine);
    expect(enemy.hp).toBe(35);
    expect(engine.state.projectiles).toHaveLength(0);
    expect(engine.state.stats.damageDealt).toBe(15);
  });

  it('pierce 1 → 第一击不消耗, hit list 累加, pierceLeft--', () => {
    const engine = makeEngine();
    const e1 = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100 });
    engine.state.enemies = [e1];
    const proj = makeProj({ pierceLeft: 1, damage: 10 });
    engine.state.projectiles.push(proj);
    processCollisions(engine);
    expect(e1.hp).toBe(90);
    expect(engine.state.projectiles).toHaveLength(1);  // pierce 不消耗
    expect(proj.pierceLeft).toBe(0);
  });

  it('hit list 已含 enemy id → 不重复扣血', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100 });
    engine.state.enemies = [enemy];
    engine.state.projectiles.push(makeProj({ hitEnemyIds: [1] }));
    processCollisions(engine);
    expect(enemy.hp).toBe(100);
  });

  it('水平重叠但垂直分层时不命中 enemy', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100, y: 4 });
    engine.state.enemies = [enemy];
    engine.state.projectiles.push(makeProj({ x: 0, y: 1, z: 0 }));
    processCollisions(engine);
    expect(enemy.hp).toBe(100);
    expect(engine.state.projectiles).toHaveLength(1);
  });
});

describe('player projectile vs boss', () => {
  it('boss id=-1 进 spatial hash, 命中扣血', () => {
    const engine = makeEngine();
    engine.state.boss = makeBoss(0, 0, 1000);
    engine.state.projectiles.push(makeProj({ damage: 50 }));
    processCollisions(engine);
    expect(engine.state.boss.hp).toBe(950);
    expect(engine.state.boss.hitFlashTimer).toBeCloseTo(0.15, 5);
  });

  it('水平重叠但垂直分层时不命中 boss', () => {
    const engine = makeEngine();
    engine.state.boss = makeBoss(0, 0, 1000);
    engine.state.boss.y = 4;
    engine.state.projectiles.push(makeProj({ damage: 50, y: 1 }));
    processCollisions(engine);
    expect(engine.state.boss.hp).toBe(1000);
    expect(engine.state.projectiles).toHaveLength(1);
  });
});

describe('bone_bouncer 弹跳', () => {
  it('击中后找下一个最近 enemy 改变 v 方向, hit list 累加', () => {
    const engine = makeEngine();
    const e1 = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100 });
    const e2 = makeEnemy(2, 'skeleton_soldier', 5, 0, { hp: 100 });
    engine.state.enemies = [e1, e2];
    const proj = makeProj({
      weaponType: 'bone_bouncer',
      bouncesLeft: 1,
      damage: 5,
      vx: 1, vz: 0,
    });
    engine.state.projectiles.push(proj);
    processCollisions(engine);
    expect(e1.hp).toBe(95);
    expect(proj.bouncesLeft).toBe(0);
    expect(proj.hitEnemyIds).toContain(1);
    expect(engine.state.projectiles).toHaveLength(1);  // 重定向, 不消耗
    // v 方向应朝 e2 (+x)
    expect(proj.vx).toBeGreaterThan(0);
  });

  it('没有下一个 enemy → 销毁', () => {
    const engine = makeEngine();
    const e1 = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100 });
    engine.state.enemies = [e1];
    engine.state.projectiles.push(makeProj({
      weaponType: 'bone_bouncer', bouncesLeft: 1,
    }));
    processCollisions(engine);
    expect(engine.state.projectiles).toHaveLength(0);
  });
});

describe('orbiting / gravitational 不被 single hit 销毁', () => {
  it('orbiting=true 命中后保留, 加入 hit list', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 0, 0, { hp: 100 });
    engine.state.enemies = [enemy];
    const proj = makeProj({ orbiting: true, damage: 5 });
    engine.state.projectiles.push(proj);
    processCollisions(engine);
    expect(enemy.hp).toBe(95);
    expect(engine.state.projectiles).toHaveLength(1);
    expect(proj.hitEnemyIds).toContain(1);
  });
});

describe('enemy 近战 vs player', () => {
  it('1.2 内 + cooldown=0 → player.hp 扣减 + cooldown 重置', () => {
    const engine = makeEngine();
    const enemy = makeEnemy(1, 'skeleton_soldier', 1, 0, {
      damage: 10, attackCooldown: 0, attackCooldownMax: 1.5,
    });
    engine.state.enemies = [enemy];
    const initialHp = engine.state.player.hp;
    processCollisions(engine);
    expect(engine.state.player.hp).toBeLessThan(initialHp);
    expect(enemy.attackCooldown).toBeCloseTo(1.5, 5);
  });

  it('player invincible 时不受伤', () => {
    const engine = makeEngine();
    engine.state.player.invincibleTimer = 0.5;
    const initialHp = engine.state.player.hp;
    engine.state.enemies = [makeEnemy(1, 'skeleton_soldier', 1, 0)];
    processCollisions(engine);
    expect(engine.state.player.hp).toBe(initialHp);
  });
});

describe('enemy projectile vs player', () => {
  it('近距离 + radius 检测 + y 接近 → player.hp 扣减 + projectile 销毁', () => {
    const engine = makeEngine();
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    const initialHp = engine.state.player.hp;
    engine.state.projectiles.push(makeProj({
      fromPlayer: false, x: 0, y: 0.5, z: 0, damage: 8, radius: 0.5,
    }));
    processCollisions(engine);
    expect(engine.state.player.hp).toBeLessThan(initialHp);
    expect(engine.state.projectiles).toHaveLength(0);
  });

  it('y 距离 > 1.5 不算命中', () => {
    const engine = makeEngine();
    engine.state.projectiles.push(makeProj({
      fromPlayer: false, x: 0, y: 5, z: 0, damage: 8, radius: 0.5,
    }));
    const initialHp = engine.state.player.hp;
    processCollisions(engine);
    expect(engine.state.player.hp).toBe(initialHp);
    expect(engine.state.projectiles).toHaveLength(1);
  });
});

describe('shield_tome 减伤', () => {
  it('shield_tome lv5 → 25% 减免 (+ armor)', () => {
    const engine = makeEngine();
    engine.state.player.armor = 0;
    engine.state.player.tomes = [{ type: 'shield_tome', level: 5 }];
    engine.state.player.hp = 100;
    const enemy = makeEnemy(1, 'skeleton_soldier', 1, 0, { damage: 20 });
    engine.state.enemies = [enemy];
    processCollisions(engine);
    // shield 5*0.05=0.25, raw 20-0=20, after = max(1, round(20*0.75)) = 15
    expect(engine.state.player.hp).toBe(85);
  });
});

describe('boss melee vs player', () => {
  it('< 2.0 + boss.attackCooldown=0 → 伤害 + boss.attackCooldown 重置', () => {
    const engine = makeEngine();
    engine.state.boss = makeBoss(0, 0, 2000);
    engine.state.boss.attackCooldown = 0;
    engine.state.boss.phase = 1;
    const initialHp = engine.state.player.hp;
    processCollisions(engine);
    expect(engine.state.player.hp).toBeLessThan(initialHp);
    expect(engine.state.boss.attackCooldown).toBe(2.0);
  });
});
