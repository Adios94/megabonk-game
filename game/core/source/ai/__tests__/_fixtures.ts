/**
 * AI 行为单元测试用的 fixture 工具。
 *
 * 提供 makePlayer / makeEnemy / makeAiContext / makeAiEffects 帮手 ——
 * 使每个 .test.ts 不必重复 50 行 setup。
 */
import { vi } from 'vitest';
import type {
  PlayerState,
  EnemyState,
  EnemyType,
  EnemyBehavior,
  BossState,
} from '../../types.ts';
import type { AiContext, AiEffects } from '../types.ts';
import { NEON_CRUCIBLE_GEOMETRY } from '../../systems/levelGeometry.ts';

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

export function makeEnemy(
  id: number,
  type: EnemyType,
  x: number,
  z: number,
  overrides: Partial<EnemyState> = {},
): EnemyState {
  // behavior 默认按 type 推断
  const behaviorByType: Record<EnemyType, EnemyBehavior> = {
    skeleton_soldier: 'chase',
    zombie: 'chase',
    skeleton_archer: 'ranged',
    skeleton_knight: 'charge',
    necromancer: 'ranged',
    gargoyle: 'dive',
  };
  return {
    id, type,
    x, y: type === 'gargoyle' ? 3 : 0, z,
    hp: 50, maxHp: 50,
    speed: 3, damage: 5,
    behavior: behaviorByType[type],
    isElite: false, isMiniBoss: false,
    hitFlashTimer: 0,
    attackCooldown: 0, attackCooldownMax: 1.5,
    targetX: 0, targetZ: 0,
    aiPhase: 0, // AI错峰相位
    chargeState: 'idle', chargeTimer: 0, chargeTargetX: 0, chargeTargetZ: 0,
    summonCooldown: 0,
    orbitAngle: 0, orbitTimer: 0,
    diveState: 'flying', diveTimer: 0,
    ...overrides,
  };
}

export interface MockAiEffects extends AiEffects {
  spawnProjectileSpy: ReturnType<typeof vi.fn>;
  spawnEnemyByTypeSpy: ReturnType<typeof vi.fn>;
  damagePlayerSpy: ReturnType<typeof vi.fn>;
  applyKnockbackSpy: ReturnType<typeof vi.fn>;
}

export function makeAiEffects(): MockAiEffects {
  const spawnProjectileSpy = vi.fn().mockReturnValue(1);
  const spawnEnemyByTypeSpy = vi.fn().mockReturnValue(null);
  const damagePlayerSpy = vi.fn();
  const applyKnockbackSpy = vi.fn();
  return {
    addDamageEvent: vi.fn(),
    applyKnockback: applyKnockbackSpy,
    addDamageDealt: vi.fn(),
    spawnProjectile: spawnProjectileSpy,
    spawnAreaEffect: vi.fn().mockReturnValue(1),
    spawnEnemyByType: spawnEnemyByTypeSpy,
    damagePlayer: damagePlayerSpy,
    spawnProjectileSpy,
    spawnEnemyByTypeSpy,
    damagePlayerSpy,
    applyKnockbackSpy,
  };
}

export function makeAiContext(overrides: Partial<AiContext> = {}): AiContext {
  const player = overrides.player ?? makePlayer();
  return {
    player,
    enemies: overrides.enemies ?? [],
    boss: overrides.boss ?? null,
    dt: 1 / 60,
    gameTime: 0,
    mapSize: 100,
    aiGroup: 0,
    finalSwarm: false,
    getTerrainHeight: () => 0,
    geo: NEON_CRUCIBLE_GEOMETRY,
    effects: overrides.effects ?? makeAiEffects(),
    ...overrides,
  };
}

export function makeBoss(x = 0, z = 0, hp = 2000): BossState {
  return {
    x, y: 0, z,
    hp, maxHp: hp, bossType: 'gunner_mech', phase: 1,
    currentAttack: 'idle', attackTimer: 0, attackAnimTimer: 0, attackCooldown: 0,
    hitFlashTimer: 0, speed: 3, enraged: false,
  };
}
