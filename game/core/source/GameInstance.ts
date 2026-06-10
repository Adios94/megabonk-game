/**
 * MegaBonk 3D Roguelike Survivor — Game Instance facade.
 *
 * Pure game logic — NO Three.js or rendering imports.
 *
 * Phase 6: 本文件缩成 thin facade. 所有内部逻辑迁到 `systems/`:
 *   - systems/player.ts     — 移动 / dash / 计时器 / 升级 / createInitialPlayer
 *   - systems/spawning.ts   — wave / mini-boss / 单怪 / boss spawn
 *   - systems/projectiles.ts — 投射物移动 / 寿命 / 出界
 *   - systems/collisions.ts — 4 种碰撞 + 击退 + damage event
 *   - systems/pickups.ts    — pickup 寿命 / 吸附 / collect / deaths / thorns
 *   - systems/weapons.ts    — fireWeapons / getWeaponStats / evolution
 *   - systems/teleporters.ts — teleporter 状态机 + 宝箱
 *   - systems/aiSystem.ts   — enemy AI 主循环
 *   - systems/bossAi.ts     — boss AI 主循环
 *   - systems/helpers.ts    — findNearestEnemy / addDamageEvent / applyKnockback / ...
 *   - systems/collision.ts  — 关卡 / 碰撞系统（geometry + 高度 / 横向阻挡查询）
 *
 * 公开 API 完全不变：start / tick / applyAction / selectUpgrade / pause / resume
 *                  / getState / getResult.
 */

import type {
  GameConfig, GameState, GameResult, InputState, PlayerState,
} from './types.ts';
import {
  TICK_INTERVAL_MS,
  TIER_CONFIGS,
} from './config.ts';
import { MAX_PROJECTILES } from './config.ts';
import type { AiEffects, AiContext } from './ai/types.ts';

import { SpatialHash } from './spatial-hash.ts';
import { createWorld } from './world.ts';
import { updateRunStats, recordWeaponsUsed } from './save.ts';
import { getShopBonuses } from './shop.ts';
import { checkQuestCompletion } from './quests.ts';
import { spawnEnemy } from './factories/spawnEnemy.ts';
import { recomputePlayerStats } from './stats/recomputePlayerStats.ts';
import { applyTomeUpgrade } from './tomeProgression.ts';
import { tickEnemyAi } from './systems/aiSystem.ts';
import { tickBossAi } from './systems/bossAi.ts';

import type { Engine } from './systems/types.ts';
import { getTerrainHeightAt, makeLevelGeometry, NEON_CRUCIBLE_GEOMETRY } from './systems/collision.ts';
import {
  createInitialPlayer,
  tickPlayerMovement,
  tickDash,
  tickTimers,
  tickLevelUp,
  setPlayerSpawn,
} from './systems/player.ts';
import { tickWeapons, applyWeaponUpgrade, emptyWeaponGrowth } from './systems/weapons.ts';
import { tickBonds, applyBondUpgrade, onBondWeaponHit } from './systems/bonds.ts';
import { tickProjectiles } from './systems/projectiles.ts';
import { processCollisions } from './systems/collisions.ts';
import { tickStatusEffects } from './systems/statusEffects.ts';
import { tickAreaEffects } from './systems/areaEffects.ts';
import { processDeaths, tickPickups, tickThorns } from './systems/pickups.ts';
import { applyPlayerHit, tickConsumableEffects, tickConsumablePickups } from './systems/consumables.ts';
import { tickSpawning, checkBossSpawn } from './systems/spawning.ts';
import { tickAltars, generateAltars } from './systems/altars.ts';
import { tickChests, generateChests, nextChestId, nextChestRespawnDelay } from './systems/chests.ts';
import { grantRelic } from './systems/relics.ts';
import { tickOvertime } from './systems/overtime.ts';
import { tickTierTransition } from './systems/tierTransition.ts';
import { tickShrines, generateShrines, applyShrineReward } from './systems/shrines.ts';
import { addDamageEvent, applyKnockback, checkGameOver } from './systems/helpers.ts';

export class GameInstance {
  private engine: Engine;

  constructor(config: GameConfig) {
    const world = createWorld();
    const state: GameState = {
      tick: 0,
      gameTime: 0,
      overtimeSeconds: 0,
      running: false,
      paused: false,
      finished: false,
      phase: 'menu',
      player: {} as PlayerState,  // 占位, start() 会重建
      enemies: [],
      projectiles: [],
      areaEffects: [],
      pickups: [],
      consumablePickups: [],
      goldMotes: [],
      boss: null,
      upgradeOptions: null,
      damageEvents: [],
      bondVfxEvents: [],
      levelUpCompensationEvents: [],
      chestOpenEvents: [],
      pendingChestReward: null,
      stats: { killCount: 0, damageDealt: 0, damageTaken: 0, shieldAbsorbed: 0, silverEarned: 0 },
      waveIndex: 0,
      altars: [],
      shrines: [],
      activeShrineId: null,
      chests: [],
      character: config.character,
      finalSwarm: false,
    };
    state.player = createInitialPlayer(config);

    const engine = {
      state,
      config,
      input: { moveX: 0, moveY: 0, dash: false, skill1: false, skill2: false, jump: false, slide: false, interact: false },
      world,
      effects: null as unknown as AiEffects,  // 立刻填
      spatialHash: new SpatialHash(4),
      // 关卡几何 —— applyLevelConfig() 会根据 config.level 重新赋值；此处先用默认占位
      geo: NEON_CRUCIBLE_GEOMETRY,
      nextEnemyId: 1,
      nextProjectileId: 1,
      nextPickupId: 1,
      nextChestId: 1,
      nextAreaEffectId: 1,
      spawnTimer: 1.0,
      chestRespawnTimer: nextChestRespawnDelay(),
      aiGroup: 0,
      miniBossTimer: 0,
      landingTimer: 0,
      lastDashInput: false,
      lastJumpInput: false,
      facingX: 0,
      facingZ: 1,
    } satisfies Engine;

    engine.effects = makeEffects(engine);
    this.engine = engine;

    this.applyLevelConfig();
  }

  /**
   * 应用关卡数据：注入地形碰撞矩形 + 玩家出生点。
   * 无关卡数据时回退到内置 Neon Crucible 几何。
   */
  private applyLevelConfig(): void {
    const { engine } = this;
    const level = engine.config.level;
    engine.geo = makeLevelGeometry(level);
    if (level) {
      const spawn = level.spawnPoints?.player;
      if (spawn) {
        engine.state.player.x = spawn.x;
        engine.state.player.z = spawn.z;
        const groundAt = getTerrainHeightAt(engine.geo, spawn.x, spawn.z);
        engine.state.player.y = Number.isFinite(groundAt) ? groundAt : 0;
        setPlayerSpawn(spawn.x, spawn.z);
      } else {
        setPlayerSpawn(engine.state.player.x, engine.state.player.z);
      }
    } else {
      setPlayerSpawn(engine.state.player.x, engine.state.player.z);
    }
    engine.state.player.isClimbing = false;
  }

  start(): void {
    const { engine } = this;
    const { state, config } = engine;
    state.running = true;
    state.paused = false;
    state.finished = false;
    state.phase = 'playing';
    state.gameTime = 0;
    state.overtimeSeconds = 0;
    state.tick = 0;
    state.enemies = [];
    state.projectiles = [];
    state.areaEffects = [];
    state.pickups = [];
    state.consumablePickups = [];
    state.goldMotes = [];
    state.damageEvents = [];
    state.bondVfxEvents = [];
    state.levelUpCompensationEvents = [];
    state.chestOpenEvents = [];
    state.pendingChestReward = null;
    state.boss = null;
    state.upgradeOptions = null;
    state.stats = { killCount: 0, damageDealt: 0, damageTaken: 0, shieldAbsorbed: 0, silverEarned: 0 };
    state.waveIndex = 0;
    state.altars = generateAltars(config);
    state.shrines = generateShrines(config);
    state.activeShrineId = null;
    state.chests = generateChests(config);
    engine.nextChestId = nextChestId(state.chests);
    state.character = config.character;
    state.finalSwarm = false;
    state.player = createInitialPlayer(config);
    engine.nextEnemyId = 1;
    engine.nextProjectileId = 1;
    engine.nextPickupId = 1;
    engine.nextAreaEffectId = 1;
    engine.nextChestId = nextChestId(state.chests);
    engine.spawnTimer = 1.0;
    engine.chestRespawnTimer = nextChestRespawnDelay();
    engine.aiGroup = 0;
    engine.landingTimer = 0;
    engine.miniBossTimer = 0;

    this.applyLevelConfig();
  }

  tick(): boolean {
    const { engine } = this;
    const { state } = engine;

    if (!state.running || state.finished || state.paused) {
      return state.finished;
    }
    if (state.phase === 'level_up') return false;
    // shrine_reward phase: 玩家在 4 选 1 选项面板，game logic 全部暂停（等同 level_up）
    if (state.phase === 'shrine_reward') return false;
    // chest_reward phase: 宝箱已消耗，等待玩家留下/丢弃遗物，game logic 暂停。
    if (state.phase === 'chest_reward') return false;

    const dt = TICK_INTERVAL_MS / 1000;

    // Boss intro 倒计时（其它 system 全部跳过）
    if (state.phase === 'boss_intro') {
      state.gameTime += dt;
      state.tick++;
      if (state.boss) {
        state.boss.attackTimer -= dt;
        if (state.boss.attackTimer <= 0) {
          state.phase = 'boss_fight';
        }
      }
      return false;
    }

    // 清上一帧事件（client 在两帧之间读）
    state.damageEvents = [];
    state.bondVfxEvents = [];
    state.levelUpCompensationEvents = [];
    state.chestOpenEvents = [];

    state.gameTime += dt;
    state.tick++;

    // ─── 顺序见 systems/README.md。每帧 dispatch ───
    tickPlayerMovement(engine, dt);
    tickDash(engine, dt);
    tickTimers(engine, dt);
    tickEnemyAi(state.enemies, makeAiContext(engine, dt));
    tickWeapons(engine, dt);
    tickProjectiles(engine, dt);
    tickAreaEffects(engine, dt);
    tickStatusEffects(engine, dt);
    tickBonds(engine, dt);
    processCollisions(engine);
    processDeaths(engine);
    tickPickups(engine, dt);
    tickConsumablePickups(engine, dt);
    tickConsumableEffects(engine, dt);
    tickLevelUp(engine);
    tickSpawning(engine, dt);
    tickAltars(engine, dt);
    tickShrines(engine, dt);
    tickChests(engine, dt);
    if ((state.phase as GameState['phase']) === 'chest_reward') return false;
    checkBossSpawn(engine);
    if (state.boss && state.phase === 'boss_fight') {
      tickBossAi(state.boss, makeAiContext(engine, dt));
    }
    tickThorns(engine);
    checkGameOver(engine);
    // Boss 死亡后祭坛会进 portal_ready；玩家按 E 进入后变 portal_used。
    // tickTierTransition 检测并执行下一关流程（清场 + tier++）。
    tickTierTransition(engine);
    // Overtime 累加（仅在 gameTime ≥ 540 且玩家未死且未在结算时）。
    tickOvertime(engine, dt);

    engine.aiGroup = (engine.aiGroup + 1) % 4;

    return state.finished;
  }

  applyAction(input: InputState): void {
    this.engine.input = input;
  }

  selectUpgrade(optionId: string): void {
    const { engine } = this;
    const { state } = engine;
    if (state.phase !== 'level_up' || !state.upgradeOptions) return;

    const option = state.upgradeOptions.find(o => o.id === optionId);
    if (!option) return;

    const player = state.player;

    switch (option.kind) {
      case 'new_weapon':
        if (option.weaponType && player.weapons.length < player.activeWeaponSlots) {
          player.weapons.push({
            type: option.weaponType,
            level: 1,
            cooldownTimer: 0,
            evolved: false,
            growth: emptyWeaponGrowth(),
          });
        }
        break;
      case 'weapon_upgrade':
        if (option.weaponType) {
          const weapon = player.weapons.find(w => w.type === option.weaponType);
          // 新规则：level +1，并按选项稀有度缩放「本级→下一级」步进累加到 growth。
          if (weapon && !weapon.evolved) {
            applyWeaponUpgrade(weapon, option.rarity);
            const bonus = player.nextWeaponUpgradeBonus ?? 0;
            if (bonus > 0) {
              player.nextWeaponUpgradeBonus = 0;
              if (player.activeConsumable?.id === 'craftsman_hammer') {
                player.activeConsumable = null;
              }
              for (let i = 0; i < bonus && !weapon.evolved; i++) {
                applyWeaponUpgrade(weapon, option.rarity);
              }
            }
          }
        }
        break;
      case 'tome':
        if (option.tomeType) {
          const existing = player.tomes.find(t => t.type === option.tomeType);
          if (existing) {
            applyTomeUpgrade(existing, option.rarity, option.newLevel);
          } else {
            const tome = { type: option.tomeType!, level: 0 };
            applyTomeUpgrade(tome, option.rarity, option.newLevel);
            player.tomes.push(tome);
          }
          player.passives = player.tomes;
          recomputePlayerStats(player, engine.config.character, getShopBonuses());
        }
        break;
      case 'bond_activate':
      case 'bond_upgrade':
        if (option.bondId) {
          applyBondUpgrade(player, option.bondId, option.newLevel as 1 | 2 | 3);
          recomputePlayerStats(player, engine.config.character, getShopBonuses());
        }
        break;
    }

    state.upgradeOptions = null;
    state.phase = state.boss ? 'boss_fight' : 'playing';
  }

  /**
   * 玩家从 Charge Shrine 4 个奖励选项里选一个 → 永久应用到 player +
   * 关闭 shrine 并恢复 phase。
   *
   * 与 selectUpgrade 同样的语义结构：
   *   - 仅在 phase === 'shrine_reward' 时生效
   *   - 选完 → activeShrineId=null + shrine.phase='consumed'
   *   - 恢复 phase 到 boss_fight / playing
   */
  selectShrineReward(optionId: string): void {
    const { engine } = this;
    const { state } = engine;
    if (state.phase !== 'shrine_reward') return;
    if (state.activeShrineId == null) return;

    const shrine = state.shrines.find(s => s.id === state.activeShrineId);
    if (!shrine || !shrine.options) return;

    const option = shrine.options.find(o => o.id === optionId);
    if (!option) return;

    applyShrineReward(state.player, option.reward, option.value);

    shrine.phase = 'consumed';
    shrine.options = null;
    state.activeShrineId = null;
    state.phase = state.boss ? 'boss_fight' : 'playing';
  }

  selectChestReward(keep: boolean): void {
    const { engine } = this;
    const { state } = engine;
    if (state.phase !== 'chest_reward' || !state.pendingChestReward) return;

    const reward = state.pendingChestReward;
    if (keep) {
      grantRelic(engine, reward.relicId);
    }

    state.pendingChestReward = null;
    state.phase = reward.returnPhase;
  }

  pause(): void {
    if (this.engine.state.running && !this.engine.state.finished) {
      this.engine.state.paused = true;
    }
  }

  resume(): void {
    this.engine.state.paused = false;
  }

  getState(): GameState {
    return this.engine.state;
  }

  getResult(): GameResult {
    const { engine } = this;
    const { state, config } = engine;
    const tierCfg = TIER_CONFIGS[config.tier];
    const baseSilver = Math.floor(state.stats.killCount * 0.5 + state.player.level * 5);
    const victoryBonus = state.phase === 'victory' ? 100 : 0;
    const totalSilver = Math.round((baseSilver + victoryBonus + state.stats.silverEarned) * tierCfg.silverMultiplier);

    recordWeaponsUsed(state.player.weapons.map(w => w.type));
    updateRunStats(
      state.stats.killCount,
      Math.floor(state.gameTime),
      state.player.level,
      state.phase === 'victory',
      state.stats.damageTaken,
    );
    checkQuestCompletion();

    return {
      victory: state.phase === 'victory',
      survivalTime: Math.floor(state.gameTime),
      killCount: state.stats.killCount,
      level: state.player.level,
      silverEarned: totalSilver,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ─────────────────────────────────────────────────────────────────────────

function makeAiContext(engine: Engine, dt: number): AiContext {
  return {
    player: engine.state.player,
    enemies: engine.state.enemies,
    boss: engine.state.boss,
    dt,
    gameTime: engine.state.gameTime,
    mapSize: engine.config.mapSize,
    aiGroup: engine.aiGroup,
    finalSwarm: engine.state.finalSwarm,
    // 闭包绑定 engine.geo —— 关卡切换后下一帧就读到新几何
    getTerrainHeight: (x, z) => getTerrainHeightAt(engine.geo, x, z),
    geo: engine.geo,
    effects: engine.effects,
  };
}

/**
 * 构造 AiEffects —— 给 AI / 武器 behavior 提供副作用入口。Engine 已就绪后调一次。
 */
function makeEffects(engine: Engine): AiEffects {
  return {
    addDamageEvent: (x, y, z, d, c, p, w) => addDamageEvent(engine, x, y, z, d, c, p, w),
    applyKnockback: (e, fx, fz) => applyKnockback(engine, e, fx, fz),
    addDamageDealt: (n) => { engine.state.stats.damageDealt += n; },
    spawnProjectile: (p) => {
      if (engine.state.projectiles.length >= MAX_PROJECTILES) return null;
      const id = engine.nextProjectileId++;
      engine.state.projectiles.push({ id, hitEnemyIds: [], ...p });
      return id;
    },
    spawnAreaEffect: (a) => {
      const id = engine.nextAreaEffectId++;
      engine.state.areaEffects.push({ id, ...a });
      return id;
    },
    bondHit: (weaponType, enemy, damage, isCrit) => {
      onBondWeaponHit(engine, weaponType, enemy, damage, isCrit);
    },
    spawnEnemyByType: (type, x, z, opts) => {
      const newEnemy = spawnEnemy(
        type, x, z,
        {
          gameTime: engine.state.gameTime,
          tier: engine.config.tier,
          overtimeSeconds: engine.state.overtimeSeconds,
          player: engine.state.player,
          nextId: () => engine.nextEnemyId++,
        },
        opts ?? {},
      );
      engine.state.enemies.push(newEnemy);
      return newEnemy;
    },
    damagePlayer: (rawDamage: number) => {
      applyPlayerHit(engine, rawDamage);
    },
  };
}
