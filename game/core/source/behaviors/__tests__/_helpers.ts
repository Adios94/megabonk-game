/**
 * 共享 behavior 测试 fixture 工具。
 *
 * 命名约定：以 `_` 开头避免被 vitest 当作 spec 文件加载。
 * vitest 默认匹配 `*.test.ts` / `*.spec.ts`，本文件不会被自动 collect。
 */
import type { BehaviorContext, BehaviorEffects } from '../types.ts';
import type {
  PlayerState, EnemyState, BossState, WeaponState, WeaponType, ProjectileState, AreaEffectState,
} from '../../types.ts';
import type { WeaponLevelStats } from '../../config.ts';
import type { WeaponDef } from '../../data/weapons.ts';
import type { BehaviorId } from '../index.ts';

export function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: 100, maxHp: 100, level: 1, xp: 0, xpToNext: 10,
    speed: 4, currentSpeed: 0,
    damageMultiplier: 1.0,
    attackSpeedMultiplier: 1.0,
    critChance: 0.0,
    critDamage: 1.5,
    armor: 0, pickupRadius: 2,
    weapons: [], tomes: [], passives: [],
    dashCooldown: 0, dashCooldownMax: 5, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: 'megachad',
    maxWeaponSlots: 2, activeWeaponSlots: 2, gold: 0, relicStacks: {}, comboCount: 0, comboTimer: 0,
    ...overrides,
  };
}

export function makeEnemy(id: number, x: number, z: number, hp = 100): EnemyState {
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

export function makeBoss(x = 0, z = 0, hp = 2000): BossState {
  return {
    x, y: 0, z,
    hp, maxHp: hp, phase: 1,
    currentAttack: 'idle', attackTimer: 0, attackCooldown: 0,
    hitFlashTimer: 0, speed: 3, enraged: false,
  };
}

export function makeStats(overrides: Partial<WeaponLevelStats> = {}): WeaponLevelStats {
  return {
    damage: 10, cooldown: 1.0, projectileCount: 1,
    bounces: 0, chains: 0, range: 5, aoeRadius: 3,
    pierce: 0, speed: 10,
    ...overrides,
  };
}

export function makeWeapon(type: WeaponType = 'sword'): WeaponState {
  return { type, level: 1, cooldownTimer: 0, evolved: false };
}

export function makeDef(behavior: BehaviorId, tags: readonly string[]): WeaponDef {
  return { tags, behavior };
}

export type SpawnedProjectile = Omit<ProjectileState, 'id' | 'fromPlayer' | 'hitEnemyIds'>;
export type SpawnedAreaEffect = Omit<AreaEffectState, 'id'>;

export interface SpyEffects extends BehaviorEffects {
  damageEvents: Array<Parameters<BehaviorEffects['addDamageEvent']>>;
  knockbacks: Array<[EnemyState, number, number]>;
  projectiles: SpawnedProjectile[];
  areaEffects: SpawnedAreaEffect[];
  damageDealtTotal: number;
}

export function makeEffects(): SpyEffects {
  const damageEvents: Array<Parameters<BehaviorEffects['addDamageEvent']>> = [];
  const knockbacks: Array<[EnemyState, number, number]> = [];
  const projectiles: SpawnedProjectile[] = [];
  const areaEffects: SpawnedAreaEffect[] = [];
  let damageDealtTotal = 0;
  let nextId = 1;
  return {
    addDamageEvent: (...args) => { damageEvents.push(args); },
    applyKnockback: (e, fx, fz) => { knockbacks.push([e, fx, fz]); },
    addDamageDealt: (n) => { damageDealtTotal += n; },
    spawnProjectile: (p) => {
      projectiles.push(p);
      return nextId++;
    },
    spawnAreaEffect: (a) => {
      areaEffects.push(a);
      return nextId++;
    },
    damageEvents, knockbacks, projectiles, areaEffects,
    get damageDealtTotal() { return damageDealtTotal; },
  } as SpyEffects;
}

export function makeCtx(
  player: PlayerState,
  enemies: EnemyState[],
  boss: BossState | null = null,
  stats?: WeaponLevelStats,
  weaponType: WeaponType = 'sword',
  behavior: BehaviorId = 'sweepArc',
  tags: readonly string[] = ['sword', 'melee', 'physical'],
): BehaviorContext & { effects: SpyEffects } {
  return {
    player, enemies, boss,
    weapon: makeWeapon(weaponType),
    def: makeDef(behavior, tags),
    stats: stats ?? makeStats(),
    effects: makeEffects(),
  };
}
