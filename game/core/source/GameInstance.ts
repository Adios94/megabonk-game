/**
 * MegaBonk 3D Roguelike Survivor 鈥?Game Instance facade.
 *
 * Pure game logic 鈥?NO Three.js or rendering imports.
 *
 * Phase 6: 鏈枃浠剁缉鎴?thin facade. 鎵€鏈夊唴閮ㄩ€昏緫杩佸埌 `systems/`:
 *   - systems/player.ts     鈥?绉诲姩 / dash / 璁℃椂鍣?/ 鍗囩骇 / createInitialPlayer
 *   - systems/spawning.ts   鈥?wave / mini-boss / 鍗曟€?/ boss spawn
 *   - systems/projectiles.ts 鈥?鎶曞皠鐗╃Щ鍔?/ 瀵垮懡 / 鍑虹晫
 *   - systems/collisions.ts 鈥?4 绉嶇鎾?+ 鍑婚€€ + damage event
 *   - systems/pickups.ts    鈥?pickup 瀵垮懡 / 鍚搁檮 / collect / deaths / thorns
 *   - systems/weapons.ts    鈥?fireWeapons / getWeaponStats / evolution
 *   - systems/altars.ts     鈥?椋炵 / 浼犻€侀棬鐘舵€佹満
 *   - systems/chests.ts     鈥?瀹濈
 *   - systems/aiSystem.ts   鈥?enemy AI 涓诲惊鐜?
 *   - systems/bossAi.ts     鈥?boss AI 涓诲惊鐜?
 *   - systems/helpers.ts    鈥?findNearestEnemy / addDamageEvent / applyKnockback / ...
 *   - systems/collision.ts  鈥?鍏冲崱 / 纰版挒绯荤粺锛坓eometry + 楂樺害 / 妯悜闃绘尅鏌ヨ锛?
 *
 * 鍏紑 API 瀹屽叏涓嶅彉锛歴tart / tick / applyAction / selectUpgrade / pause / resume
 *                  / getState / getResult.
 */

import type {
  GameConfig, GameState, GameResult, InputState, PlayerState, TomeState, UpgradeRarity,
} from './types.ts';
import {
  TICK_INTERVAL_MS,
  TIER_CONFIGS,
} from './config.ts';
import { MAX_PROJECTILES, MAX_AREA_EFFECTS } from './config.ts';
import type { AiEffects, AiContext } from './ai/types.ts';

import { SpatialHash } from './helpers/spatialHash.ts';
import { createWorld } from './world.ts';
import { addSilver, updateRunStats, recordWeaponsUsed } from './services/save.ts';
import { getShopBonuses } from './data/shop.ts';
import { checkQuestCompletion } from './data/quests.ts';
import { spawnEnemy } from './factories/spawnEnemy.ts';
import { recomputePlayerStats } from './stats/recomputePlayerStats.ts';
import { applyTomeUpgrade } from './data/tomeProgression.ts';
import { tickEnemyAi } from './systems/aiSystem.ts';
import { tickBossAi } from './systems/bossAi.ts';

import type { Engine } from './systems/types.ts';
import { getTerrainHeightAt, makeLevelGeometry, NEON_CRUCIBLE_GEOMETRY } from './systems/levelGeometry.ts';
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
import { recordWeaponDamage, refreshAllWeaponDps } from './systems/weaponDamageStats.ts';
import { applyPlayerHit, tickConsumableEffects, tickConsumablePickups } from './systems/consumables.ts';
import { tickSpawning, checkBossSpawn, getBossOvertimeGrowthContext } from './systems/spawning.ts';
import { tickAltars, generateAltars } from './systems/altars.ts';
import { tickChests, generateChests, nextChestId, nextChestRespawnDelay } from './systems/chests.ts';
import { grantRelic } from './systems/relics.ts';
import { tickOvertime } from './systems/overtime.ts';
import { tickTierTransition } from './systems/tierTransition.ts';
import { tickShrines, generateShrines, applyShrineReward } from './systems/shrines.ts';
import { tickEnemySeparation } from './systems/enemySeparation.ts';
import { addDamageEvent, applyKnockback, checkGameOver, resetDamageEventPool } from './systems/helpers.ts';
import { pickRandomOne } from './factories/spawnPick.ts';

export class GameInstance {
  private engine: Engine;
  private resultSettled = false;
  // 复用 AiContext 对象，避免每 tick 创建新对象 + 新箭头闭包（每秒 60-120 次）。
  // getTerrainHeight 闭包内部读 engine.geo 是 live ref，关卡切换无需重建。
  private aiContext!: AiContext;

  constructor(config: GameConfig) {
    const world = createWorld();
    const state: GameState = {
      tick: 0,
      gameTime: 0,
      tier: config.tier,
      stage: 1,
      overtimeSeconds: 0,
      running: false,
      paused: false,
      finished: false,
      phase: 'menu',
      player: {} as PlayerState,  // 鍗犱綅, start() 浼氶噸寤?
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
      xpPickupEvents: [],
      fallDamageEvents: [],
      chestOpenEvents: [],
      pendingChestReward: null,
      stats: { killCount: 0, damageDealt: 0, damageTaken: 0, shieldAbsorbed: 0, silverEarned: 0 },
      weaponDamageStats: [],
      bondDamageStats: [],
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
      effects: null as unknown as AiEffects,  // 绔嬪埢濉?
      spatialHash: new SpatialHash(4),
      enemyById: new Map(),
      spatialIndexTick: -1,
      // 鍏冲崱鍑犱綍 鈥斺€?applyLevelConfig() 浼氭牴鎹?config.level 閲嶆柊璧嬪€硷紱姝ゅ鍏堢敤榛樿鍗犱綅
      geo: NEON_CRUCIBLE_GEOMETRY,
      nextEnemyId: 1,
      nextProjectileId: 1,
      nextPickupId: 1,
      nextChestId: 1,
      nextAreaEffectId: 1,
      spawnTimer: 1.0,
      chestRespawnTimer: nextChestRespawnDelay(),
      chestLockedSpawnKeys: [],
      chestPendingSpawnKeys: [],
      aiGroup: 0,
      miniBossTimer: 0,
      stageTwoBossSummonCount: 0,
      landingTimer: 0,
      lastDashInput: false,
      lastJumpInput: false,
      facingX: 0,
      facingZ: 1,
      weaponDamageWindows: {},
    } satisfies Engine;

    engine.effects = makeEffects(engine);
    this.engine = engine;
    this.aiContext = {
      player: state.player,
      enemies: state.enemies,
      boss: state.boss,
      dt: 0,
      gameTime: 0,
      mapSize: config.mapSize,
      aiGroup: 0,
      finalSwarm: false,
      getTerrainHeight: (x, z) => getTerrainHeightAt(engine.geo, x, z),
      geo: engine.geo,
      effects: engine.effects,
    };

    this.applyLevelConfig();
  }

  /**
   * 搴旂敤鍏冲崱鏁版嵁锛氭敞鍏ュ湴褰㈢鎾炵煩褰?+ 鐜╁鍑虹敓鐐广€?
   * 鏃犲叧鍗℃暟鎹椂鍥為€€鍒板唴缃?Neon Crucible 鍑犱綍銆?
   */
  private applyLevelConfig(): void {
    const { engine } = this;
    const level = engine.config.level;
    engine.geo = makeLevelGeometry(level);
    if (level) {
      const spawn = pickRandomOne(level.spawnPoints?.players ?? []);
      if (spawn) {
        engine.state.player.x = spawn.x;
        engine.state.player.z = spawn.z;
        const spawnY = Number.isFinite(spawn.y)
          ? spawn.y!
          : getTerrainHeightAt(engine.geo, spawn.x, spawn.z);
        engine.state.player.y = Number.isFinite(spawnY) ? spawnY : 0;
        setPlayerSpawn(spawn.x, engine.state.player.y, spawn.z);
      } else {
        setPlayerSpawn(engine.state.player.x, engine.state.player.y, engine.state.player.z);
      }
    } else {
      setPlayerSpawn(engine.state.player.x, engine.state.player.y, engine.state.player.z);
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
    state.tier = config.tier;
    state.stage = 1;
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
    state.xpPickupEvents = [];
    state.fallDamageEvents = [];
    state.chestOpenEvents = [];
    state.pendingChestReward = null;
    state.boss = null;
    state.upgradeOptions = null;
    state.stats = { killCount: 0, damageDealt: 0, damageTaken: 0, shieldAbsorbed: 0, silverEarned: 0 };
    state.weaponDamageStats = [];
    state.bondDamageStats = [];
    state.character = config.character;
    state.finalSwarm = false;
    state.player = createInitialPlayer(config);
    this.applyLevelConfig();
    state.waveIndex = 0;
    state.altars = generateAltars(config, state.player, engine.geo);
    state.shrines = generateShrines(config, engine.geo);
    state.activeShrineId = null;
    state.chests = generateChests(config);
    engine.nextChestId = nextChestId(state.chests);
    engine.weaponDamageWindows = {};
    this.resultSettled = false;
    engine.nextEnemyId = 1;
    engine.nextProjectileId = 1;
    engine.nextPickupId = 1;
    engine.nextAreaEffectId = 1;
    engine.nextChestId = nextChestId(state.chests);
    engine.spawnTimer = 1.0;
    engine.chestRespawnTimer = nextChestRespawnDelay();
    engine.chestLockedSpawnKeys = [];
    engine.chestPendingSpawnKeys = [];
    engine.aiGroup = 0;
    engine.landingTimer = 0;
    engine.miniBossTimer = 0;
    engine.stageTwoBossSummonCount = 0;
    engine.weaponDamageWindows = {};
    engine.spatialIndexTick = -1;
    engine.enemyById.clear();
    engine.spatialHash.clear();
  }

  tick(): boolean {
    const { engine } = this;
    const { state } = engine;

    if (!state.running || state.finished || state.paused) {
      return state.finished;
    }
    if (state.phase === 'level_up') return false;
    // shrine_reward phase: 鐜╁鍦?4 閫?1 閫夐」闈㈡澘锛実ame logic 鍏ㄩ儴鏆傚仠锛堢瓑鍚?level_up锛?
    if (state.phase === 'shrine_reward') return false;
    // chest_reward phase: 瀹濈宸叉秷鑰楋紝绛夊緟鐜╁鐣欎笅/涓㈠純閬楃墿锛実ame logic 鏆傚仠銆?
    if (state.phase === 'chest_reward') return false;

    const dt = TICK_INTERVAL_MS / 1000;

    // Boss intro 鍊掕鏃讹紙鍏跺畠 system 鍏ㄩ儴璺宠繃锛?
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

    // 娓呬笂涓€甯т簨浠讹紙client 鍦ㄤ袱甯т箣闂磋锛?
    resetDamageEventPool(engine);
    state.bondVfxEvents.length = 0;
    state.levelUpCompensationEvents.length = 0;
    state.xpPickupEvents.length = 0;
    state.fallDamageEvents.length = 0;
    state.chestOpenEvents.length = 0;

    state.gameTime += dt;
    state.tick++;

    // 鈹€鈹€鈹€ 椤哄簭瑙?systems/README.md銆傛瘡甯?dispatch 鈹€鈹€鈹€
    tickPlayerMovement(engine, dt);
    tickDash(engine, dt);
    tickTimers(engine, dt);
    tickEnemyAi(state.enemies, this.refreshAiContext(dt));
    // 鏁屼汉涔嬮棿杞垎绂?鈥斺€?AI 鍐冲畾鎰忓浘浣嶇Щ鍚庯紝鎶婅创鑴?閲嶅彔鐨勫悓浼存帹寮€锛堝甯ц蒋鎺掓枼锛屽皧閲嶅浣擄級銆?
    tickEnemySeparation(engine);
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
      tickBossAi(state.boss, this.refreshAiContext(dt));
    }
    tickThorns(engine);
    checkGameOver(engine);
    // Boss 姝讳骸鍚庨纰熶細杩?portal_ready锛涚帺瀹舵寜 E 杩涘叆鍚庡彉 portal_used銆?
    // tickTierTransition 妫€娴嬪苟鎵ц涓嬩竴鍏虫祦绋嬶紙娓呭満 + tier++锛夈€?
    tickTierTransition(engine);
    // Overtime 绱姞锛堜粎鍦?gameTime 鈮?540 涓旂帺瀹舵湭姝讳笖鏈湪缁撶畻鏃讹級銆?
    tickOvertime(engine, dt);
    refreshAllWeaponDps(engine);

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
            growth: emptyWeaponGrowth(),
          });
        }
        break;
      case 'weapon_upgrade':
        if (option.weaponType) {
          const weapon = player.weapons.find(w => w.type === option.weaponType);
          // 鏂拌鍒欙細level +1锛屽苟鎸夐€夐」绋€鏈夊害缂╂斁銆屾湰绾р啋涓嬩竴绾с€嶆杩涚疮鍔犲埌 growth銆?
          if (weapon) {
            const levels = Math.max(1, option.newLevel - weapon.level);
            for (let i = 0; i < levels; i++) applyWeaponUpgrade(weapon, option.rarity);
            if ((player.nextWeaponUpgradeBonus ?? 0) > 0) consumeNextUpgradeBonus(player);
          }
        }
        break;
      case 'tome':
        if (option.tomeType) {
          const existing = player.tomes.find(t => t.type === option.tomeType);
          if (existing) {
            applyTomeUpgradeSteps(existing, option.rarity, option.newLevel);
          } else {
            const tome = { type: option.tomeType!, level: 0 };
            applyTomeUpgradeSteps(tome, option.rarity, option.newLevel);
            player.tomes.push(tome);
          }
          if ((player.nextWeaponUpgradeBonus ?? 0) > 0) consumeNextUpgradeBonus(player);
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
   * 鐜╁浠?Charge Shrine 4 涓鍔遍€夐」閲岄€変竴涓?鈫?姘镐箙搴旂敤鍒?player +
   * 鍏抽棴 shrine 骞舵仮澶?phase銆?
   *
   * 涓?selectUpgrade 鍚屾牱鐨勮涔夌粨鏋勶細
   *   - 浠呭湪 phase === 'shrine_reward' 鏃剁敓鏁?
   *   - 閫夊畬 鈫?activeShrineId=null + shrine.phase='consumed'
   *   - 鎭㈠ phase 鍒?boss_fight / playing
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
    // damage/attack_speed/movement_speed/pickup_range/crit_damage 濂栧姳绱鍦?shrineBonuses锛?
    // recompute 鏈熬鍚堝苟鍚庡嵆鏃剁敓鏁堬紙鍏朵綑濂栧姳宸插湪 applyShrineReward 鍐呯洿鎺ュ啓瀛楁锛夈€?
    recomputePlayerStats(state.player, engine.config.character, getShopBonuses());

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

  /**
   * 刷新缓存的 AiContext —— 只更新会随帧变化的字段，复用对象。
   * enemies / player 引用稳定（始终是 engine.state 上的同名数组/对象），
   * 不需要每帧重新赋值，但 boss 会在 spawn/死亡时切换 null↔实例，必须同步。
   * geo 在关卡切换后才变，同步成本极低。
   */
  private refreshAiContext(dt: number): AiContext {
    const ctx = this.aiContext;
    const { state, config } = this.engine;
    ctx.player = state.player;
    ctx.enemies = state.enemies;
    ctx.boss = state.boss;
    ctx.dt = dt;
    ctx.gameTime = state.gameTime;
    ctx.mapSize = config.mapSize;
    ctx.aiGroup = this.engine.aiGroup;
    ctx.finalSwarm = state.finalSwarm;
    ctx.geo = this.engine.geo;
    ctx.effects = this.engine.effects;
    return ctx;
  }

  getResult(): GameResult {
    const { engine } = this;
    const { state, config } = engine;
    const tierCfg = TIER_CONFIGS[config.tier];
    const baseSilver = Math.floor(state.stats.killCount * 0.5 + state.player.level * 5);
    const victoryBonus = state.phase === 'victory' ? 100 : 0;
    const totalSilver = Math.round((baseSilver + victoryBonus + state.stats.silverEarned) * tierCfg.silverMultiplier);

    if (!this.resultSettled) {
      addSilver(totalSilver);
      recordWeaponsUsed(state.player.weapons.map(w => w.type));
      updateRunStats(
        state.stats.killCount,
        Math.floor(state.gameTime),
        state.player.level,
        state.phase === 'victory',
        state.stats.damageTaken,
      );
      checkQuestCompletion();
      this.resultSettled = true;
    }

    return {
      victory: state.phase === 'victory',
      survivalTime: Math.floor(state.gameTime),
      killCount: state.stats.killCount,
      level: state.player.level,
      silverEarned: totalSilver,
      weaponDamageStats: state.player.weapons.map((weapon) => (
        state.weaponDamageStats.find(stat => stat.weaponType === weapon.type) ?? {
          weaponType: weapon.type,
          killCount: 0,
          totalDamage: 0,
          dps: 0,
        }
      )),
    };
  }
}

// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// Helpers (file-private)
// 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function consumeNextUpgradeBonus(player: PlayerState): void {
  player.nextWeaponUpgradeBonus = 0;
  if (player.activeConsumable?.id === 'craftsman_hammer') {
    player.activeConsumable = null;
  }
}

function applyTomeUpgradeSteps(tome: TomeState, rarity: UpgradeRarity, targetLevel: number): void {
  while (tome.level < targetLevel) {
    applyTomeUpgrade(tome, rarity, tome.level + 1);
  }
}


/**
 * 鏋勯€?AiEffects 鈥斺€?缁?AI / 姝﹀櫒 behavior 鎻愪緵鍓綔鐢ㄥ叆鍙ｃ€侲ngine 宸插氨缁悗璋冧竴娆°€?
 */
function makeEffects(engine: Engine): AiEffects {
  return {
    addDamageEvent: (x, y, z, d, c, p, w, s, hitFlashColor) => addDamageEvent(engine, x, y, z, d, c, p, w, s, hitFlashColor),
    applyKnockback: (e, fx, fz, strengthMult) => applyKnockback(engine, e, fx, fz, strengthMult),
    addDamageDealt: (n, weaponType, target) => {
      if (weaponType) {
        recordWeaponDamage(engine, weaponType, n, target);
      } else {
        engine.state.stats.damageDealt += n;
      }
    },
    spawnProjectile: (p) => {
      if (!p.fromPlayer) {
        const enemyProjectileCount = engine.state.projectiles.filter(proj => !proj.fromPlayer).length;
        if (enemyProjectileCount >= 10) return null;
      }
      if (engine.state.projectiles.length >= MAX_PROJECTILES) return null;
      const id = engine.nextProjectileId++;
      const durationMult = p.fromPlayer ? (engine.state.player.durationMult ?? 1) : 1;
      engine.state.projectiles.push({
        id,
        hitEnemyIds: [],
        ...p,
        lifetime: p.lifetime * durationMult,
      });
      return id;
    },
    spawnAreaEffect: (a) => {
      if (engine.state.areaEffects.length >= MAX_AREA_EFFECTS) return null;
      const id = engine.nextAreaEffectId++;
      const durationMult = engine.state.player.durationMult ?? 1;
      engine.state.areaEffects.push({
        id,
        ...a,
        lifetime: a.lifetime * durationMult,
        maxLifetime: a.maxLifetime * durationMult,
      });
      return id;
    },
    getPlayerOrbitProjectiles: (weaponType) =>
      engine.state.projectiles.filter(
        (p) => p.fromPlayer && p.orbiting && p.weaponType === weaponType,
      ),
    bondHit: (weaponType, target, damage, isCrit) => {
      onBondWeaponHit(engine, weaponType, target, damage, isCrit);
    },
    spawnEnemyByType: (type, x, z, opts) => {
      const newEnemy = spawnEnemy(
        type, x, z,
        {
          gameTime: engine.state.gameTime,
          tier: engine.config.tier,
          overtimeSeconds: engine.state.overtimeSeconds,
          ...getBossOvertimeGrowthContext(engine),
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
