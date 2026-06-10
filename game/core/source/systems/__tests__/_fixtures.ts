/**
 * systems 单元测试用 fixture 工具。
 *
 * 提供 makeEngine() —— 用最小依赖构造一个 Engine 实例，避免每个测试文件重复 80 行 setup。
 * 复用 ai/__tests__/_fixtures.ts 的 makePlayer / makeEnemy。
 */
import { vi } from 'vitest';
import { SpatialHash } from '../../spatial-hash.ts';
import { createWorld } from '../../world.ts';
import { DEFAULT_GAME_CONFIG } from '../../config.ts';
import type { GameConfig, GameState, InputState, PlayerState } from '../../types.ts';
import type { AiEffects } from '../../ai/types.ts';
import type { Engine } from '../types.ts';
import { NEON_CRUCIBLE_GEOMETRY } from '../collision.ts';
import { makePlayer } from '../../ai/__tests__/_fixtures.ts';

export { makePlayer, makeEnemy, makeBoss } from '../../ai/__tests__/_fixtures.ts';

export interface MockAiEffects extends AiEffects {
  spawnProjectileSpy: ReturnType<typeof vi.fn>;
  spawnAreaEffectSpy: ReturnType<typeof vi.fn>;
  spawnEnemyByTypeSpy: ReturnType<typeof vi.fn>;
  damagePlayerSpy: ReturnType<typeof vi.fn>;
  applyKnockbackSpy: ReturnType<typeof vi.fn>;
  addDamageEventSpy: ReturnType<typeof vi.fn>;
  addDamageDealtSpy: ReturnType<typeof vi.fn>;
}

function defaultInput(): InputState {
  return { moveX: 0, moveY: 0, dash: false, skill1: false, skill2: false, jump: false, slide: false, interact: false };
}

function defaultState(player: PlayerState, character: GameConfig['character'] = 'megachad'): GameState {
  return {
    tick: 0, gameTime: 0, overtimeSeconds: 0, running: false, paused: false, finished: false,
    phase: 'playing',
    player,
    enemies: [], projectiles: [], areaEffects: [], pickups: [], consumablePickups: [], goldMotes: [], boss: null,
    upgradeOptions: null, damageEvents: [], bondVfxEvents: [], levelUpCompensationEvents: [],
    chestOpenEvents: [], pendingChestReward: null,
    stats: { killCount: 0, damageDealt: 0, damageTaken: 0, shieldAbsorbed: 0, silverEarned: 0 },
    waveIndex: 0, altars: [], shrines: [], activeShrineId: null, chests: [],
    character,
    finalSwarm: false,
  };
}

/**
 * 创建一个最小可用 Engine. effects 是 spy mock —— 系统调用立即被记录, 不做真实 push.
 *
 * 注意：spawnProjectile / spawnEnemyByType 在 effects 上是 mock; 但有些 system
 * 直接 mutate engine.state.projectiles / enemies, 这些不走 effects (与生产代码一致)。
 */
export function makeEngine(overrides: Partial<Engine> = {}): Engine {
  const config: GameConfig = overrides.config ?? { ...DEFAULT_GAME_CONFIG };
  const player = overrides.state?.player ?? makePlayer();
  const state = overrides.state ?? defaultState(player, config.character);

  const spawnProjectileSpy = vi.fn().mockReturnValue(1);
  const spawnEnemyByTypeSpy = vi.fn().mockReturnValue(null);
  const damagePlayerSpy = vi.fn();
  const applyKnockbackSpy = vi.fn();
  const addDamageEventSpy = vi.fn();
  const addDamageDealtSpy = vi.fn();
  const spawnAreaEffectSpy = vi.fn().mockReturnValue(1);

  const effects: MockAiEffects = {
    addDamageEvent: addDamageEventSpy,
    applyKnockback: applyKnockbackSpy,
    addDamageDealt: addDamageDealtSpy,
    spawnProjectile: spawnProjectileSpy,
    spawnAreaEffect: spawnAreaEffectSpy,
    spawnEnemyByType: spawnEnemyByTypeSpy,
    damagePlayer: damagePlayerSpy,
    spawnProjectileSpy,
    spawnAreaEffectSpy,
    spawnEnemyByTypeSpy,
    damagePlayerSpy,
    applyKnockbackSpy,
    addDamageEventSpy,
    addDamageDealtSpy,
  };

  return {
    state,
    config,
    input: defaultInput(),
    world: createWorld(),
    effects: overrides.effects ?? effects,
    spatialHash: overrides.spatialHash ?? new SpatialHash(4),
    geo: overrides.geo ?? NEON_CRUCIBLE_GEOMETRY,
    nextEnemyId: 100,
    nextProjectileId: 100,
    nextPickupId: 100,
    nextChestId: 100,
    nextAreaEffectId: 100,
    spawnTimer: 0,
    chestRespawnTimer: 999,
    aiGroup: 0,
    miniBossTimer: 0,
    landingTimer: 0,
    lastDashInput: false,
    lastJumpInput: false,
    facingX: 0,
    facingZ: 1,
    ...overrides,
  };
}

/** 给 engine 装一个真实的 effects（不是 mock）—— 若测试需要走真实 spawnProjectile 路径. */
export function withRealEffects(engine: Engine): Engine {
  const real: AiEffects = {
    addDamageEvent: (x, y, z, d, c, p, w) => {
      engine.state.damageEvents.push({ x, y, z, damage: d, isCrit: c, isPlayerDamage: p, weaponType: w });
    },
    applyKnockback: () => {},
    addDamageDealt: (n) => { engine.state.stats.damageDealt += n; },
    spawnProjectile: (proj) => {
      const id = engine.nextProjectileId++;
      engine.state.projectiles.push({ id, hitEnemyIds: [], ...proj });
      return id;
    },
    spawnAreaEffect: (a) => {
      const id = engine.nextAreaEffectId++;
      engine.state.areaEffects.push({ id, ...a });
      return id;
    },
    spawnEnemyByType: () => null,
    damagePlayer: () => {},
  };
  engine.effects = real;
  return engine;
}
