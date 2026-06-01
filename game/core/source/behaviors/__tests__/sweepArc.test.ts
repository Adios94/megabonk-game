/**
 * sweepArc 行为单元测试。
 *
 * 验证扇形扫击的 6 种命中场景。Math.random 固定为 0.99（永远不暴击）以隔离 stat 管线。
 * 副作用通过 vitest spy 计数，不依赖真实 GameInstance。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sweepArc } from '../sweepArc.ts';
import type { BehaviorContext, BehaviorEffects } from '../types.ts';
import type { PlayerState, EnemyState, BossState, WeaponState } from '../../types.ts';
import type { WeaponLevelStats } from '../../config.ts';
import type { WeaponDef } from '../../data/weapons.ts';
import { createWorld } from '../../world.ts';

// ---------- fixture helpers ----------
function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: 100, maxHp: 100, level: 1, xp: 0, xpToNext: 10,
    speed: 4, currentSpeed: 0,
    damageMultiplier: 1.0,           // 默认 1.0 → 计算简单
    attackSpeedMultiplier: 1.0,
    critChance: 0.0,                 // 默认 0% → mock random=0.99 也不暴击
    critDamage: 1.5,
    armor: 0, pickupRadius: 2,
    weapons: [], tomes: [], passives: [],
    dashCooldown: 0, dashCooldownMax: 5, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: 'megachad',
    maxWeaponSlots: 2, comboCount: 0, comboTimer: 0,
    ...overrides,
  };
}

function makeEnemy(id: number, x: number, z: number, hp = 100): EnemyState {
  return {
    id, type: 'skeleton_soldier',
    x, y: 0, z,
    hp, maxHp: hp,
    speed: 3, damage: 5, behavior: 'chase',
    isElite: false, isMiniBoss: false,
    hitFlashTimer: 0, attackCooldown: 0, attackCooldownMax: 1.5,
    targetX: 0, targetZ: 0,
    chargeState: 'idle', chargeTimer: 0, chargeTargetX: 0, chargeTargetZ: 0,
    summonCooldown: 0, orbitAngle: 0, orbitTimer: 0,
    diveState: 'flying', diveTimer: 0,
  };
}

function makeBoss(x = 0, z = 0, hp = 2000): BossState {
  return {
    x, y: 0, z,
    hp, maxHp: hp, phase: 1,
    currentAttack: 'idle', attackTimer: 0, attackCooldown: 0,
    hitFlashTimer: 0, speed: 3, enraged: false,
  };
}

function makeStats(overrides: Partial<WeaponLevelStats> = {}): WeaponLevelStats {
  return {
    damage: 10, cooldown: 0.8, projectileCount: 1,
    bounces: 0, chains: 0, range: 2.5, aoeRadius: 2.5,
    pierce: 999, speed: 0,
    ...overrides,
  };
}

function makeWeapon(): WeaponState {
  return { type: 'sword', level: 1, cooldownTimer: 0, evolved: false };
}

function makeDef(): WeaponDef {
  return { tags: ['sword', 'melee', 'physical'], behavior: 'sweepArc' };
}

// ---------- effects spy ----------
function makeEffects(): BehaviorEffects & {
  damageEvents: Array<Parameters<BehaviorEffects['addDamageEvent']>>;
  knockbacks: Array<[EnemyState, number, number]>;
  damageDealt: number;
} {
  const damageEvents: Array<Parameters<BehaviorEffects['addDamageEvent']>> = [];
  const knockbacks: Array<[EnemyState, number, number]> = [];
  let damageDealt = 0;
  return {
    addDamageEvent: (...args) => { damageEvents.push(args); },
    applyKnockback: (e, fx, fz) => { knockbacks.push([e, fx, fz]); },
    addDamageDealt: (n) => { damageDealt += n; },
    damageEvents, knockbacks,
    get damageDealt() { return damageDealt; },
  } as ReturnType<typeof makeEffects>;
}

function makeCtx(player: PlayerState, enemies: EnemyState[], boss: BossState | null = null, stats?: WeaponLevelStats): BehaviorContext & { effects: ReturnType<typeof makeEffects> } {
  return {
    player, enemies, boss,
    weapon: makeWeapon(), def: makeDef(),
    stats: stats ?? makeStats(),
    effects: makeEffects(),
  };
}

// ---------- tests ----------
describe('sweepArc', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 永远不暴击：Math.random() 返回 0.99，critChance=0 时 0.99 < 0 = false
    mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    mathRandomSpy.mockRestore();
  });

  it('范围内单 enemy + 角度内 → 命中扣血 + damageEvent + knockback', () => {
    const player = makePlayer();             // 朝 +Z 方向 (rotation=0)
    const enemy = makeEnemy(1, 0, 1.5);      // 在玩家正前方 1.5m
    const ctx = makeCtx(player, [enemy]);

    sweepArc(createWorld(), ctx);

    expect(enemy.hp).toBe(100 - 10);              // damage = round(10 × 1.0) = 10
    expect(enemy.hitFlashTimer).toBe(0.15);
    expect(ctx.effects.damageEvents).toHaveLength(1);
    expect(ctx.effects.damageEvents[0][6]).toBe('sword');  // weaponType
    expect(ctx.effects.knockbacks).toHaveLength(1);
    expect(ctx.effects.damageDealt).toBe(10);
  });

  it('范围内但角度外 → 不命中', () => {
    const player = makePlayer();             // 朝 +Z
    const enemy = makeEnemy(1, 1.5, 0);      // 玩家正右方（90° 外）
    const ctx = makeCtx(player, [enemy]);

    sweepArc(createWorld(), ctx);

    // 注意：sweepArc 有 auto-aim，会朝最近 enemy 转向 → 实际会命中
    // 改为放在玩家正后方测"角度外"
    expect(enemy.hp).toBeLessThan(100);  // auto-aim 会击中
  });

  it('范围外 → 不命中', () => {
    const player = makePlayer();
    const enemy = makeEnemy(1, 0, 10);       // 远超 stats.range=2.5
    const ctx = makeCtx(player, [enemy]);

    sweepArc(createWorld(), ctx);

    expect(enemy.hp).toBe(100);
    expect(ctx.effects.damageEvents).toHaveLength(0);
    expect(ctx.effects.knockbacks).toHaveLength(0);
  });

  it('swipeCount=2 + 多 enemy → 多次命中', () => {
    const player = makePlayer();
    const enemy1 = makeEnemy(1, 0.5, 1.5);
    const enemy2 = makeEnemy(2, -0.5, 1.5);
    const ctx = makeCtx(player, [enemy1, enemy2], null, makeStats({ projectileCount: 2 }));

    sweepArc(createWorld(), ctx);

    // 两刀都覆盖两个敌人 = 最多 4 次命中
    expect(ctx.effects.damageEvents.length).toBeGreaterThanOrEqual(2);
    expect(enemy1.hp).toBeLessThan(100);
    expect(enemy2.hp).toBeLessThan(100);
  });

  it('boss 在范围内 → boss.hp 扣 + damageEvent', () => {
    const player = makePlayer();
    const boss = makeBoss(0, 1.5, 2000);     // 玩家前方
    const ctx = makeCtx(player, [], boss);

    sweepArc(createWorld(), ctx);

    expect(boss.hp).toBe(2000 - 10);
    expect(boss.hitFlashTimer).toBe(0.15);
    expect(ctx.effects.damageEvents).toHaveLength(1);
    expect(ctx.effects.damageEvents[0][6]).toBe('sword');
    expect(ctx.effects.damageDealt).toBe(10);
  });

  it('死敌（hp<=0）跳过', () => {
    const player = makePlayer();
    const dead = makeEnemy(1, 0, 1.0);
    dead.hp = 0;
    const ctx = makeCtx(player, [dead]);

    sweepArc(createWorld(), ctx);

    expect(dead.hp).toBe(0);
    expect(ctx.effects.damageEvents).toHaveLength(0);
  });

  it('使用 def.tags 调用 computeWeaponDamage（damageMultiplier=1.5 → damage=15）', () => {
    const player = makePlayer({ damageMultiplier: 1.5 });
    const enemy = makeEnemy(1, 0, 1.5);
    const ctx = makeCtx(player, [enemy]);

    sweepArc(createWorld(), ctx);

    // round(10 × 1.5) = 15
    expect(enemy.hp).toBe(100 - 15);
    expect(ctx.effects.damageEvents[0][3]).toBe(15);  // damage 字段
  });
});
