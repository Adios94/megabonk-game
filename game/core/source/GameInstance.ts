/**
 * MegaBonk 3D Roguelike Survivor - Core Game Instance
 * Pure game logic — NO Three.js or rendering imports.
 * Features: MegaBonk-style movement (jump, slide, bunny hop),
 * 13 weapons, 10 tomes, 3 characters, teleporter system.
 */

import type {
  GameConfig,
  GameState,
  GameResult,
  InputState,
  PlayerState,
  EnemyState,
  ProjectileState,
  PickupState,
  BossState,
  DamageEvent,
  UpgradeOption,
  GamePhase,
  EnemyType,
  EnemyBehavior,
  WeaponState,
  WeaponType,
  GameStats,
  BossPhase,
  BossAttack,
  PickupType,
  CharacterType,
  TeleporterState,
  TomeState,
  ChestState,
} from './types.ts';

import {
  TICK_INTERVAL_MS,
  MAX_ENEMIES,
  MAX_PROJECTILES,
  MAX_PICKUPS,
  PLAYER_BASE_HP,
  PLAYER_BASE_SPEED,
  PLAYER_BASE_CRIT_CHANCE,
  PLAYER_BASE_CRIT_DAMAGE,
  PLAYER_PICKUP_RADIUS,
  PLAYER_INVINCIBLE_DURATION,
  DASH_DISTANCE,
  DASH_DURATION,
  DASH_COOLDOWN,
  JUMP_FORCE,
  GRAVITY,
  SLIDE_DURATION,
  SLIDE_SPEED_MULTIPLIER,
  BUNNY_HOP_WINDOW,
  BUNNY_HOP_BONUS,
  BOSS_SPAWN_TIME,
  BOSS_HP,
  BOSS_INTRO_DURATION,
  PICKUP_LIFETIME,
  PICKUP_ATTRACT_SPEED,
  HEALTH_DROP_CHANCE,
  HEALTH_SMALL_DROP_CHANCE,
  CHEST_COUNT,
  CHEST_INTERACT_RADIUS,
  CHEST_SILVER_MIN,
  CHEST_SILVER_MAX,
  TELEPORTER_ACTIVATION_DURATION,
  TELEPORTER_APPEAR_TIME,
  TELEPORTER_RADIUS,
  XP_VALUES,
  ENEMY_CONFIGS,
  WAVE_CONFIGS,
  WEAPON_STATS,
  CHARACTER_CONFIGS,
  MAX_WEAPONS_DEFAULT,
  MAX_WEAPONS_CAP,
  WEAPON_EVOLUTIONS,
  TIER_CONFIGS,
} from './config.ts';

import { loadSave, saveSave, updateRunStats } from './save.ts';
import { getShopBonuses } from './shop.ts';
import { checkQuestCompletion } from './quests.ts';

import { applyMovement3D, distanceBetween, normalizeDirection } from './physics.ts';
import { SpatialHash } from './spatial-hash.ts';
import { generateUpgradeOptions, xpForLevel } from './upgrades.ts';
import { updateOrbitingProjectile } from './weapons.ts';
import { computeWeaponDamage } from './stats/index.ts';
import { createWorld, type GameWorld } from './world.ts';
import { tryFireWeaponEcs } from './systems/weaponFiring.ts';
import type { BehaviorEffects } from './behaviors/types.ts';

/**
 * Phase 2-3 ECS 武器迁移期间的默认开关。
 * - true: 已迁移到 data/weapons.ts + behaviors/ 的武器走 ECS 路径
 * - false: 全部走旧 GameInstance.fireWeapon switch
 *
 * 测试期可通过 instance.useEcsWeapons = false 临时翻转（见 __tests__/parity.test.ts）。
 * Phase 3 完成（所有武器迁移）后，本常量 + useEcsWeapons 字段 + 旧 fireWeapon switch 一起删除。
 */
const USE_ECS_WEAPONS_DEFAULT = true;

export class GameInstance {
  private config: GameConfig;
  private state: GameState;
  private currentInput: InputState;
  private nextEnemyId: number;
  private nextProjectileId: number;
  private nextPickupId: number;
  private spatialHash: SpatialHash;
  private spawnTimer: number;
  private aiGroup: number;

  // Track last input for dash edge-detection
  private lastDashInput: boolean = false;
  private lastJumpInput: boolean = false;
  // Player facing direction for projectile aiming
  private facingX: number = 0;
  private facingZ: number = 1;
  // Bunny hop: track time since last landing
  private landingTimer: number = 0;
  // Mini-boss spawn timer (every 2 min after minute 3)
  private miniBossTimer: number = 0;

  /** Phase 2-3 ECS 武器路径开关。Phase 3 完成后随旧 switch 一起删除。 */
  useEcsWeapons: boolean = USE_ECS_WEAPONS_DEFAULT;
  private world: GameWorld;
  private effects: BehaviorEffects;

  constructor(config: GameConfig) {
    this.config = config;
    this.currentInput = { moveX: 0, moveY: 0, dash: false, skill1: false, skill2: false, jump: false, slide: false };
    this.nextEnemyId = 1;
    this.nextProjectileId = 1;
    this.nextPickupId = 1;
    this.spatialHash = new SpatialHash(4);
    this.spawnTimer = 1.0;
    this.aiGroup = 0;

    this.world = createWorld();
    this.effects = {
      addDamageEvent: (x, y, z, d, c, p, w) => this.addDamageEvent(x, y, z, d, c, p, w),
      applyKnockback: (e, fx, fz) => this.applyKnockback(e, fx, fz),
      addDamageDealt: (n) => { this.state.stats.damageDealt += n; },
    };

    this.world = createWorld();
    this.effects = {
      addDamageEvent: (x, y, z, d, c, p, w) => this.addDamageEvent(x, y, z, d, c, p, w),
      applyKnockback: (e, fx, fz) => this.applyKnockback(e, fx, fz),
      addDamageDealt: (n) => { this.state.stats.damageDealt += n; },
    };

    this.state = {
      tick: 0,
      gameTime: 0,
      running: false,
      paused: false,
      finished: false,
      phase: 'menu',
      player: this.createInitialPlayer(),
      enemies: [],
      projectiles: [],
      pickups: [],
      boss: null,
      upgradeOptions: null,
      damageEvents: [],
      stats: { killCount: 0, damageDealt: 0, damageTaken: 0, silverEarned: 0 },
      waveIndex: 0,
      teleporters: [],
      chests: [],
      character: config.character,
      finalSwarm: false,
    };
  }

  start(): void {
    this.state.running = true;
    this.state.paused = false;
    this.state.finished = false;
    this.state.phase = 'playing';
    this.state.gameTime = 0;
    this.state.tick = 0;
    this.state.enemies = [];
    this.state.projectiles = [];
    this.state.pickups = [];
    this.state.damageEvents = [];
    this.state.boss = null;
    this.state.upgradeOptions = null;
    this.state.stats = { killCount: 0, damageDealt: 0, damageTaken: 0, silverEarned: 0 };
    this.state.waveIndex = 0;
    this.state.teleporters = [];
    this.state.chests = this.generateChests();
    this.state.character = this.config.character;
    this.state.finalSwarm = false;
    this.state.player = this.createInitialPlayer();
    this.nextEnemyId = 1;
    this.nextProjectileId = 1;
    this.nextPickupId = 1;
    this.spawnTimer = 1.0;
    this.aiGroup = 0;
    this.landingTimer = 0;
    this.miniBossTimer = 0;
  }

  tick(): boolean {
    if (!this.state.running || this.state.finished || this.state.paused) {
      return this.state.finished;
    }

    if (this.state.phase === 'level_up') {
      return false;
    }

    // Boss intro countdown
    if (this.state.phase === 'boss_intro') {
      const dt = TICK_INTERVAL_MS / 1000;
      this.state.gameTime += dt;
      this.state.tick++;
      if (this.state.boss) {
        this.state.boss.attackTimer -= dt;
        if (this.state.boss.attackTimer <= 0) {
          this.state.phase = 'boss_fight';
        }
      }
      return false;
    }

    const dt = TICK_INTERVAL_MS / 1000;

    // Clear damage events from PREVIOUS tick (so client can read them between ticks)
    this.state.damageEvents = [];

    this.state.gameTime += dt;
    this.state.tick++;

    // Process player movement (with bunny hop)
    this.processPlayerMovement(dt);

    // Process dash
    this.processDash(dt);

    // Update timers
    this.updateTimers(dt);

    // Update enemies AI
    this.updateEnemiesAI(dt);

    // Fire weapons
    this.fireWeapons(dt);

    // Update projectiles (including orbiting, gravitational)
    this.updateProjectiles(dt);

    // Collision detection
    this.processCollisions();

    // Process deaths
    this.processDeaths();

    // Update pickups
    this.updatePickups(dt);

    // Check level up
    this.checkLevelUp();

    // Spawn enemies
    this.spawnEnemies(dt);

    // Update teleporters
    this.updateTeleporters(dt);

    // Update chests
    this.updateChests();

    // Check boss spawn
    this.checkBossSpawn();

    // Update boss AI
    if (this.state.boss && this.state.phase === 'boss_fight') {
      this.updateBossAI(dt);
    }

    // Apply thorns damage
    this.applyThornsDamage();

    // Check game over
    this.checkGameOver();

    // damageEvents are kept until next tick start (so client can read them)

    // Cycle AI group
    this.aiGroup = (this.aiGroup + 1) % 4;

    return this.state.finished;
  }

  applyAction(input: InputState): void {
    this.currentInput = input;
  }

  selectUpgrade(optionId: string): void {
    if (this.state.phase !== 'level_up' || !this.state.upgradeOptions) return;

    const option = this.state.upgradeOptions.find(o => o.id === optionId);
    if (!option) return;

    const player = this.state.player;

    switch (option.kind) {
      case 'new_weapon':
        if (option.weaponType && player.weapons.length < player.maxWeaponSlots) {
          player.weapons.push({
            type: option.weaponType,
            level: 1,
            cooldownTimer: 0,
            evolved: false,
          });
        }
        break;

      case 'weapon_upgrade':
        if (option.weaponType) {
          const weapon = player.weapons.find(w => w.type === option.weaponType);
          if (weapon) {
            weapon.level = option.newLevel;
          }
        }
        break;

      case 'tome':
        if (option.tomeType) {
          const existing = player.tomes.find(t => t.type === option.tomeType);
          if (existing) {
            existing.level = option.newLevel;
          } else {
            player.tomes.push({ type: option.tomeType!, level: option.newLevel });
          }
          // Keep passives in sync
          player.passives = player.tomes;
          this.recalculateTomeStats();
        }
        break;
    }

    // Clear upgrade state and resume
    this.state.upgradeOptions = null;
    this.state.phase = this.state.boss ? 'boss_fight' : 'playing';

    // Check for weapon evolutions after any upgrade
    this.checkWeaponEvolutions();
  }

  pause(): void {
    if (this.state.running && !this.state.finished) {
      this.state.paused = true;
    }
  }

  resume(): void {
    this.state.paused = false;
  }

  getState(): GameState {
    return this.state;
  }

  getResult(): GameResult {
    // Calculate silver earned for this run
    const tierCfg = TIER_CONFIGS[this.config.tier];
    const baseSilver = Math.floor(this.state.stats.killCount * 0.5 + this.state.player.level * 5);
    const victoryBonus = this.state.phase === 'victory' ? 100 : 0;
    const totalSilver = Math.round((baseSilver + victoryBonus + this.state.stats.silverEarned) * tierCfg.silverMultiplier);

    // Persist stats and silver
    updateRunStats(
      this.state.stats.killCount,
      this.state.gameTime,
      this.state.player.level,
      this.state.phase === 'victory',
      this.state.stats.damageTaken,
    );

    // Add silver to save
    const save = loadSave();
    save.silver += totalSilver;
    save.totalSilverEarned += totalSilver;
    saveSave(save);

    // Check quest completions
    checkQuestCompletion();

    return {
      victory: this.state.phase === 'victory',
      survivalTime: this.state.gameTime,
      killCount: this.state.stats.killCount,
      level: this.state.player.level,
      silverEarned: totalSilver,
    };
  }

  // =========================================================================
  // Private: Initialization
  // =========================================================================

  private createInitialPlayer(): PlayerState {
    const charCfg = CHARACTER_CONFIGS[this.config.character];
    const save = loadSave();
    const shopBonuses = getShopBonuses();

    // Apply extra weapon slots from quests
    const extraSlots = save.extraWeaponSlots;

    return {
      x: 0,
      y: 0,
      z: 0,
      rotation: 0,
      velocityY: 0,
      isGrounded: true,
      isJumping: false,
      isSliding: false,
      slideTimer: 0,
      slideSpeedBoost: 0,
      bunnyHopTimer: 0,
      hp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
      maxHp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
      level: 1 + (shopBonuses['startLevel'] ?? 0),
      xp: 0,
      xpToNext: xpForLevel(1 + (shopBonuses['startLevel'] ?? 0)),
      speed: charCfg.speed + (shopBonuses['speed'] ?? 0),
      currentSpeed: 0,
      damageMultiplier: charCfg.damage + (shopBonuses['damage'] ?? 0),
      attackSpeedMultiplier: 1.0,
      critChance: charCfg.critChance + (shopBonuses['critChance'] ?? 0),
      critDamage: PLAYER_BASE_CRIT_DAMAGE,
      armor: charCfg.armor + (shopBonuses['armor'] ?? 0),
      pickupRadius: PLAYER_PICKUP_RADIUS + (shopBonuses['pickupRadius'] ?? 0),
      weapons: [{ type: charCfg.startingWeapon, level: 1, cooldownTimer: 0, evolved: false }],
      tomes: [],
      passives: [],
      dashCooldown: 0,
      dashCooldownMax: DASH_COOLDOWN,
      dashTimer: 0,
      invincibleTimer: 0,
      alive: true,
      character: this.config.character,
      maxWeaponSlots: Math.min(MAX_WEAPONS_CAP, charCfg.weaponSlots + extraSlots),
      comboCount: 0,
      comboTimer: 0,
    };
  }

  // =========================================================================
  // Private: Player Movement & Dash (MegaBonk movement system)
  // =========================================================================

  private processPlayerMovement(dt: number): void {
    const player = this.state.player;
    if (!player.alive) return;
    if (player.dashTimer > 0) return;

    const moveX = this.currentInput.moveX;
    const moveZ = this.currentInput.moveY;

    // Update facing direction
    if (moveX !== 0 || moveZ !== 0) {
      this.facingX = moveX;
      this.facingZ = moveZ;
      player.rotation = Math.atan2(moveX, moveZ);
    }

    // --- Bunny Hop Timer ---
    if (player.bunnyHopTimer > 0) {
      player.bunnyHopTimer -= dt;
    }

    // --- Jump (with bunny hop mechanic) ---
    const jumpPressed = this.currentInput.jump && !this.lastJumpInput;
    this.lastJumpInput = this.currentInput.jump;

    if (jumpPressed && player.isGrounded && !player.isSliding) {
      // Bunny hop: if jump within BUNNY_HOP_WINDOW of landing, get extra height
      const isBunnyHop = player.bunnyHopTimer > 0;
      const jumpMultiplier = isBunnyHop ? BUNNY_HOP_BONUS : 1.0;
      player.velocityY = JUMP_FORCE * jumpMultiplier;
      player.isGrounded = false;
      player.isJumping = true;
      player.bunnyHopTimer = 0;
    }

    // --- Gravity ---
    if (!player.isGrounded) {
      player.velocityY -= GRAVITY * dt;
      player.y += player.velocityY * dt;

      const groundHeight = this.getTerrainHeight(player.x, player.z);
      if (player.y <= groundHeight) {
        player.y = groundHeight;
        player.velocityY = 0;
        player.isGrounded = true;
        player.isJumping = false;
        // Set bunny hop window timer on landing
        player.bunnyHopTimer = BUNNY_HOP_WINDOW;

        // Landing → slide if holding slide input
        if (this.currentInput.slide && !player.isSliding) {
          player.isSliding = true;
          player.slideTimer = SLIDE_DURATION;
          player.slideSpeedBoost = SLIDE_SPEED_MULTIPLIER;
        }
      }
    }

    // --- Slide ---
    if (this.currentInput.slide && player.isGrounded && !player.isSliding && !player.isJumping) {
      player.isSliding = true;
      player.slideTimer = SLIDE_DURATION;
      player.slideSpeedBoost = SLIDE_SPEED_MULTIPLIER;
    }

    if (player.isSliding) {
      player.slideTimer -= dt;
      if (player.slideTimer <= 0) {
        player.isSliding = false;
        player.slideSpeedBoost = 0;
      }
    }

    // --- Horizontal movement with acceleration ---
    const speedMultiplier = player.isSliding ? player.slideSpeedBoost : 1.0;
    const targetSpeed = player.speed * speedMultiplier;
    const isMoving = moveX !== 0 || moveZ !== 0;

    if (isMoving) {
      // Quick acceleration — responsive controls
      const accelRate = 12.0;
      player.currentSpeed += (targetSpeed - player.currentSpeed) * Math.min(1, accelRate * dt);
    } else {
      // Fast deceleration — no sliding when releasing input
      const decelRate = 16.0;
      player.currentSpeed += (0 - player.currentSpeed) * Math.min(1, decelRate * dt);
    }

    // Only move if we have meaningful speed
    if (player.currentSpeed > 0.01 && (isMoving || player.currentSpeed > 0.1)) {
      const result = applyMovement3D(
        player.x, player.z,
        isMoving ? moveX : this.facingX,
        isMoving ? moveZ : this.facingZ,
        player.currentSpeed, dt,
        this.config.mapSize,
      );

      if (result) {
        player.x = result.x;
        player.z = result.z;
      }
    }
  }

  /** Get terrain height at position — Neon Crucible arena layout */
  private getTerrainHeight(x: number, z: number): number {
    const platforms: [number, number, number, number, number][] = [
      // ═══════════════════════════════════════════════════════════════
      // GROUND FLOOR (y=0) — The Pit + Corridors
      // ═══════════════════════════════════════════════════════════════

      // Central Arena — 30×30 open square
      [0, 0, 15, 15, 0],

      // North Corridor (extends to z = -55)
      [0, -30, 6, 15, 0],
      // South Corridor (extends to z = +55)
      [0, 30, 6, 15, 0],
      // East Corridor (extends to x = +55)
      [30, 0, 15, 6, 0],
      // West Corridor (extends to x = -55)
      [-30, 0, 15, 6, 0],

      // Diagonal fill patches (smooth corners between arms)
      [15, -15, 5, 5, 0],
      [-15, -15, 5, 5, 0],
      [15, 15, 5, 5, 0],
      [-15, 15, 5, 5, 0],

      // Corridor end pads (wider landing zones at edges)
      [0, -50, 8, 5, 0],
      [0, 50, 8, 5, 0],
      [50, 0, 5, 8, 0],
      [-50, 0, 5, 8, 0],

      // ═══════════════════════════════════════════════════════════════
      // MID-LEVEL RING (y=2) — The Catwalk
      // ═══════════════════════════════════════════════════════════════

      // Cardinal stations (on corridor edges)
      [0, -25, 5, 4, 2],     // N station
      [0, 25, 5, 4, 2],      // S station
      [25, 0, 4, 5, 2],      // E station
      [-25, 0, 4, 5, 2],     // W station

      // Diagonal junctions (between corridors)
      [20, -20, 5, 5, 2],    // NE junction
      [-20, -20, 5, 5, 2],   // NW junction
      [20, 20, 5, 5, 2],     // SE junction
      [-20, 20, 5, 5, 2],    // SW junction

      // ═══════════════════════════════════════════════════════════════
      // WATCHTOWERS (y=4) — Cardinal Overlooks
      // ═══════════════════════════════════════════════════════════════

      [0, -40, 5, 5, 4],     // N tower
      [0, 40, 5, 5, 4],      // S tower
      [40, 0, 5, 5, 4],      // E tower
      [-40, 0, 5, 5, 4],     // W tower

      // ═══════════════════════════════════════════════════════════════
      // NESTS (y=6) — Diagonal Pinnacles
      // ═══════════════════════════════════════════════════════════════

      [38, -38, 3, 3, 6],    // NE nest
      [-38, -38, 3, 3, 6],   // NW nest
      [38, 38, 3, 3, 6],     // SE nest
      [-38, 38, 3, 3, 6],    // SW nest
    ];

    let height = 0;
    for (const [cx, cz, hw, hd, h] of platforms) {
      const dx = Math.abs(x - cx);
      const dz = Math.abs(z - cz);

      if (dx <= hw && dz <= hd) {
        height = Math.max(height, h);
      } else if (dx <= hw + 3 && dz <= hd + 3) {
        const edgeDist = Math.max(dx - hw, dz - hd, 0);
        if (edgeDist <= 3) {
          const rampHeight = h * (1 - edgeDist / 3);
          height = Math.max(height, rampHeight);
        }
      }
    }
    return height;
  }

  private processDash(dt: number): void {
    const player = this.state.player;
    if (!player.alive) return;

    const dashPressed = this.currentInput.dash && !this.lastDashInput;
    this.lastDashInput = this.currentInput.dash;

    if (dashPressed && player.dashCooldown <= 0 && player.dashTimer <= 0) {
      player.dashTimer = DASH_DURATION;
      player.dashCooldown = DASH_COOLDOWN;
      player.invincibleTimer = DASH_DURATION;
    }

    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      const dashSpeed = DASH_DISTANCE / DASH_DURATION;
      const dir = normalizeDirection(this.facingX, this.facingZ);

      const result = applyMovement3D(
        player.x, player.z,
        dir.x, dir.z,
        dashSpeed, dt,
        this.config.mapSize,
      );

      if (result) {
        player.x = result.x;
        player.z = result.z;
      }
    }
  }

  // =========================================================================
  // Private: Timer Updates
  // =========================================================================

  private updateTimers(dt: number): void {
    const player = this.state.player;
    if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    if (player.invincibleTimer > 0) player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);

    // Combo timer decay
    if (player.comboTimer > 0) {
      player.comboTimer -= dt;
      if (player.comboTimer <= 0) {
        player.comboCount = 0;
        player.comboTimer = 0;
      }
    }

    for (const enemy of this.state.enemies) {
      if (enemy.hitFlashTimer > 0) enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
      if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    }

    if (this.state.boss && this.state.boss.hitFlashTimer > 0) {
      this.state.boss.hitFlashTimer = Math.max(0, this.state.boss.hitFlashTimer - dt);
    }
  }

  // =========================================================================
  // Private: Enemy AI
  // =========================================================================

  private updateEnemiesAI(dt: number): void {
    const player = this.state.player;
    const enemies = this.state.enemies;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];

      // --- Skeleton Knight charge logic ---
      if (enemy.type === 'skeleton_knight') {
        this.updateChargeEnemy(enemy, player, dt);
        continue;
      }

      // --- Gargoyle dive-bomb logic ---
      if (enemy.type === 'gargoyle') {
        this.updateGargoyleEnemy(enemy, player, dt);
        continue;
      }

      // --- Necromancer summon logic ---
      if (enemy.type === 'necromancer') {
        enemy.summonCooldown -= dt;
        if (enemy.summonCooldown <= 0) {
          enemy.summonCooldown = 8.0;
          this.necromancerSummon(enemy);
        }
      }

      // Standard AI target computation (staggered for performance)
      if ((i % 4) === this.aiGroup) {
        this.computeEnemyTarget(enemy, player);
      }

      // --- Ranged enemy shooting ---
      if (enemy.behavior === 'ranged' && enemy.attackCooldown <= 0) {
        const dist = distanceBetween(enemy.x, enemy.z, player.x, player.z);
        const cfg = ENEMY_CONFIGS[enemy.type];
        const preferredRange = cfg?.preferredRange ?? 8;
        if (dist <= preferredRange * 1.5 && dist >= preferredRange * 0.5) {
          this.enemyRangedAttack(enemy, player);
        }
      }

      this.moveEnemy(enemy, dt);
    }
  }

  private updateChargeEnemy(enemy: EnemyState, player: PlayerState, dt: number): void {
    switch (enemy.chargeState) {
      case 'idle': {
        // Decide to charge when player is within 15 units
        const dist = distanceBetween(enemy.x, enemy.z, player.x, player.z);
        if (dist < 15 && enemy.attackCooldown <= 0) {
          enemy.chargeState = 'windup';
          enemy.chargeTimer = 0.8;
          enemy.chargeTargetX = player.x;
          enemy.chargeTargetZ = player.z;
        } else {
          // Normal chase
          enemy.targetX = player.x;
          enemy.targetZ = player.z;
          this.moveEnemy(enemy, dt);
        }
        break;
      }
      case 'windup': {
        // Stop moving, flash red
        enemy.chargeTimer -= dt;
        enemy.hitFlashTimer = 0.1; // pulse red during windup
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'charging';
          enemy.chargeTimer = 0.5;
          // Lock target position
          enemy.chargeTargetX = player.x;
          enemy.chargeTargetZ = player.z;
        }
        break;
      }
      case 'charging': {
        // Rush toward locked target at 3x speed
        enemy.chargeTimer -= dt;
        enemy.targetX = enemy.chargeTargetX;
        enemy.targetZ = enemy.chargeTargetZ;
        const dx = enemy.targetX - enemy.x;
        const dz = enemy.targetZ - enemy.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          const chargeSpeed = enemy.speed * 3.0 * dt;
          const actualMove = Math.min(chargeSpeed, dist);
          const nx = dx / dist;
          const nz = dz / dist;
          const halfMap = (this.config.mapSize + 10) * 0.5;
          enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
          enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));
        }
        if (enemy.chargeTimer <= 0 || dist <= 0.5) {
          enemy.chargeState = 'cooldown';
          enemy.chargeTimer = 3.0;
          enemy.attackCooldown = enemy.attackCooldownMax;
        }
        break;
      }
      case 'cooldown': {
        enemy.chargeTimer -= dt;
        if (enemy.chargeTimer <= 0) {
          enemy.chargeState = 'idle';
        }
        // Slow chase during cooldown
        enemy.targetX = player.x;
        enemy.targetZ = player.z;
        this.moveEnemy(enemy, dt);
        break;
      }
    }
  }

  private updateGargoyleEnemy(enemy: EnemyState, player: PlayerState, dt: number): void {
    switch (enemy.diveState) {
      case 'flying': {
        // Fly above ground at y=3, circle/approach player
        enemy.y = 3;
        enemy.targetX = player.x;
        enemy.targetZ = player.z;
        this.moveEnemy(enemy, dt);

        // When attack cooldown hits 0, initiate dive
        if (enemy.attackCooldown <= 0) {
          enemy.diveState = 'diving';
          enemy.diveTimer = 0.4;
          enemy.chargeTargetX = player.x;
          enemy.chargeTargetZ = player.z;
        }
        break;
      }
      case 'diving': {
        // Dive toward player position at high speed
        enemy.diveTimer -= dt;
        const dx = enemy.chargeTargetX - enemy.x;
        const dz = enemy.chargeTargetZ - enemy.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.3) {
          const diveSpeed = enemy.speed * 3.0 * dt;
          const nx = dx / dist;
          const nz = dz / dist;
          const halfMap = (this.config.mapSize + 10) * 0.5;
          enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * diveSpeed));
          enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * diveSpeed));
        }
        // Descend
        enemy.y = Math.max(0, enemy.y - 8 * dt);
        if (enemy.y <= 0 || enemy.diveTimer <= 0) {
          enemy.y = 0;
          enemy.diveState = 'landing';
          enemy.diveTimer = 0.3;
          // AOE damage on landing
          this.gargoyleLandingAOE(enemy);
        }
        break;
      }
      case 'landing': {
        // Brief pause on ground after landing
        enemy.diveTimer -= dt;
        if (enemy.diveTimer <= 0) {
          enemy.diveState = 'rising';
          enemy.diveTimer = 0.5;
        }
        break;
      }
      case 'rising': {
        // Float back up
        enemy.diveTimer -= dt;
        enemy.y = Math.min(3, enemy.y + 6 * dt);
        if (enemy.diveTimer <= 0 || enemy.y >= 3) {
          enemy.y = 3;
          enemy.diveState = 'flying';
          enemy.attackCooldown = enemy.attackCooldownMax;
        }
        break;
      }
    }
  }

  private gargoyleLandingAOE(enemy: EnemyState): void {
    const player = this.state.player;
    const aoRadius = 3;

    // Damage player if in AOE radius
    if (player.alive && player.invincibleTimer <= 0) {
      const dist = distanceBetween(enemy.x, enemy.z, player.x, player.z);
      if (dist <= aoRadius) {
        const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
        const shieldReduction = shieldTome ? shieldTome.level * 0.05 : 0;
        const rawDamage = Math.max(1, enemy.damage - player.armor);
        const damage = Math.max(1, Math.round(rawDamage * (1 - shieldReduction)));
        player.hp -= damage;
        player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
        this.state.stats.damageTaken += damage;
        this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);
        if (player.hp <= 0) {
          this.checkPlayerDeath();
        }
      }
    }

    // Also damage other enemies slightly (environmental impact)
    for (const other of this.state.enemies) {
      if (other.id === enemy.id || other.hp <= 0) continue;
      const dist = distanceBetween(enemy.x, enemy.z, other.x, other.z);
      if (dist <= aoRadius) {
        this.applyKnockback(other, enemy.x, enemy.z);
      }
    }
  }

  private enemyRangedAttack(enemy: EnemyState, player: PlayerState): void {
    if (this.state.projectiles.length >= MAX_PROJECTILES) return;

    const dir = normalizeDirection(player.x - enemy.x, player.z - enemy.z);
    let projectileSpeed = 8;
    if (enemy.type === 'necromancer') projectileSpeed = 6;

    this.state.projectiles.push({
      id: this.nextProjectileId++,
      weaponType: 'bow', // visual type for rendering
      x: enemy.x,
      y: 1.0,
      z: enemy.z,
      vx: dir.x * projectileSpeed,
      vy: 0,
      vz: dir.z * projectileSpeed,
      damage: enemy.damage,
      bouncesLeft: 0,
      pierceLeft: 0,
      lifetime: 4.0,
      radius: 0.4,
      fromPlayer: false,
      hitEnemyIds: [],
    });

    enemy.attackCooldown = enemy.attackCooldownMax;
  }

  private necromancerSummon(necro: EnemyState): void {
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 skeleton_soldiers
    const cfg = ENEMY_CONFIGS['skeleton_soldier'];
    if (!cfg) return;

    for (let i = 0; i < count; i++) {
      if (this.state.enemies.length >= 150) break; // respect max
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spawnDist = 2 + Math.random() * 1.5;
      const timeScale = 1 + this.state.gameTime / 600;

      this.state.enemies.push({
        id: this.nextEnemyId++,
        type: 'skeleton_soldier',
        x: necro.x + Math.cos(angle) * spawnDist,
        y: 0,
        z: necro.z + Math.sin(angle) * spawnDist,
        hp: Math.round(cfg.hp * timeScale),
        maxHp: Math.round(cfg.hp * timeScale),
        speed: cfg.speed,
        damage: cfg.damage,
        behavior: cfg.behavior as EnemyBehavior,
        isElite: false,
        isMiniBoss: false,
        hitFlashTimer: 0,
        attackCooldown: 0,
        attackCooldownMax: cfg.attackCooldown,
        targetX: this.state.player.x,
        targetZ: this.state.player.z,
        chargeState: 'idle',
        chargeTimer: 0,
        chargeTargetX: 0,
        chargeTargetZ: 0,
        summonCooldown: 0,
        orbitAngle: 0,
        orbitTimer: 0,
        diveState: 'flying',
        diveTimer: 0,
      });
    }
  }

  private computeEnemyTarget(enemy: EnemyState, player: PlayerState): void {
    const px = player.x;
    const pz = player.z;
    const dist = distanceBetween(enemy.x, enemy.z, px, pz);
    const cfg = ENEMY_CONFIGS[enemy.type];

    switch (enemy.behavior) {
      case 'chase':
        enemy.targetX = px;
        enemy.targetZ = pz;
        break;

      case 'ranged': {
        const preferredRange = cfg?.preferredRange ?? 8;
        if (dist < preferredRange) {
          const dir = normalizeDirection(enemy.x - px, enemy.z - pz);
          enemy.targetX = enemy.x + dir.x * 4;
          enemy.targetZ = enemy.z + dir.z * 4;
        } else if (dist > preferredRange * 1.5) {
          enemy.targetX = px;
          enemy.targetZ = pz;
        } else {
          enemy.targetX = enemy.x;
          enemy.targetZ = enemy.z;
        }
        break;
      }

      case 'charge':
        enemy.targetX = px;
        enemy.targetZ = pz;
        break;

      case 'dive':
        enemy.targetX = px;
        enemy.targetZ = pz;
        break;
    }
  }

  private moveEnemy(enemy: EnemyState, dt: number): void {
    const dx = enemy.targetX - enemy.x;
    const dz = enemy.targetZ - enemy.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return;

    let speedMult = 1.0;
    if (enemy.behavior === 'charge') speedMult = 2.0;
    else if (enemy.behavior === 'dive') speedMult = 1.5;

    // Curse tome: enemies move faster but drop more XP
    const curseTome = this.state.player.tomes.find(t => t.type === 'curse_tome');
    if (curseTome) {
      speedMult *= (1 + curseTome.level * 0.1);
    }

    // Final Swarm speed boost (20%)
    if (this.state.finalSwarm) {
      speedMult *= 1.2;
    }

    const moveSpeed = enemy.speed * speedMult * dt;
    const actualMove = Math.min(moveSpeed, dist);
    const nx = dx / dist;
    const nz = dz / dist;

    const halfMap = (this.config.mapSize + 10) * 0.5;
    enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
    enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));

    // Apply terrain height to ground-based enemies (not flying types)
    if (enemy.type !== 'gargoyle') {
      enemy.y = this.getTerrainHeight(enemy.x, enemy.z);
    }
  }

  // =========================================================================
  // Private: Weapons
  // =========================================================================

  private fireWeapons(dt: number): void {
    const player = this.state.player;
    if (!player.alive) return;

    for (const weapon of player.weapons) {
      weapon.cooldownTimer -= dt * player.attackSpeedMultiplier;
      if (weapon.cooldownTimer <= 0) {
        const stats = this.getWeaponStats(weapon);
        weapon.cooldownTimer = stats.cooldown;

        // Phase 2: 已迁移到 ECS 路径的武器走新流程, 否则 fall back 到旧 switch
        if (this.useEcsWeapons) {
          const handled = tryFireWeaponEcs(
            this.world, weapon, stats,
            player, this.state.enemies, this.state.boss,
            this.effects,
          );
          if (handled) continue;
        }
        this.fireWeapon(weapon, stats);
      }
    }
  }

  private fireWeapon(weapon: WeaponState, stats: typeof WEAPON_STATS['bone_bouncer'][0]): void {
    const player = this.state.player;

    switch (weapon.type) {
      case 'sword':
        this.fireSword(stats);
        break;
      case 'bone_bouncer':
        this.fireBoneBouncer(stats);
        break;
      case 'axe':
        this.fireAxe(stats);
        break;
      case 'bow':
        this.fireBow(stats);
        break;
      case 'lightning_staff':
        this.fireLightningStaff(stats);
        break;
      case 'flame_ring':
        this.fireFlameRing(stats);
        break;
      case 'shotgun':
        this.fireShotgun(stats);
        break;
    }
  }

  private fireSword(stats: typeof WEAPON_STATS['sword'][0]): void {
    const player = this.state.player;
    const arcAngle = Math.PI * 0.6;
    const swipeCount = stats.projectileCount;

    // Auto-target: find nearest enemy and swing toward it
    const target = this.findNearestEnemy(player.x, player.z, stats.range * 1.5);
    const aimAngle = target
      ? Math.atan2(target.x - player.x, target.z - player.z)
      : player.rotation;

    for (let s = 0; s < swipeCount; s++) {
      const baseAngle = aimAngle + (s - (swipeCount - 1) / 2) * 0.3;
      for (const enemy of this.state.enemies) {
        if (enemy.hp <= 0) continue;
        const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
        if (dist > stats.range) continue;

        const angleToEnemy = Math.atan2(enemy.x - player.x, enemy.z - player.z);
        let angleDiff = angleToEnemy - baseAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        if (Math.abs(angleDiff) <= arcAngle / 2) {
          const isCrit = Math.random() < player.critChance;
          const damage = computeWeaponDamage(stats.damage, player, ['sword', 'melee', 'physical'], isCrit);
          enemy.hp -= damage;
          enemy.hitFlashTimer = 0.15;
          this.state.stats.damageDealt += damage;
          this.addDamageEvent(enemy.x, 1.0, enemy.z, damage, isCrit, false, 'sword');
          this.applyKnockback(enemy, player.x, player.z);
        }
      }
    }

    // Also hit boss with sword
    if (this.state.boss && this.state.boss.hp > 0) {
      const dist = distanceBetween(player.x, player.z, this.state.boss.x, this.state.boss.z);
      if (dist <= stats.range) {
        const isCrit = Math.random() < player.critChance;
        const damage = computeWeaponDamage(stats.damage, player, ['sword', 'melee', 'physical'], isCrit);
        this.state.boss.hp -= damage;
        this.state.boss.hitFlashTimer = 0.15;
        this.state.stats.damageDealt += damage;
        this.addDamageEvent(this.state.boss.x, 2, this.state.boss.z, damage, isCrit, false, 'sword');
      }
    }
  }

  private fireBoneBouncer(stats: typeof WEAPON_STATS['bone_bouncer'][0]): void {
    const player = this.state.player;
    const count = stats.projectileCount;

    for (let i = 0; i < count; i++) {
      if (this.state.projectiles.length >= MAX_PROJECTILES) break;

      const target = this.findNearestEnemy(player.x, player.z);
      let vx: number, vz: number;

      if (target) {
        const dir = normalizeDirection(target.x - player.x, target.z - player.z);
        vx = dir.x * stats.speed;
        vz = dir.z * stats.speed;
      } else {
        vx = Math.sin(player.rotation) * stats.speed;
        vz = Math.cos(player.rotation) * stats.speed;
      }

      if (count > 1) {
        const angle = ((i - (count - 1) / 2) * 0.25);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nvx = vx * cos - vz * sin;
        const nvz = vx * sin + vz * cos;
        vx = nvx;
        vz = nvz;
      }

      const isCrit = Math.random() < player.critChance;
      const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));

      this.state.projectiles.push({
        id: this.nextProjectileId++,
        weaponType: 'bone_bouncer',
        x: player.x, y: 1.0, z: player.z,
        vx, vy: 0, vz,
        damage,
        bouncesLeft: stats.bounces,
        pierceLeft: 0,
        lifetime: 4.0,
        radius: 0.4,
        fromPlayer: true,
        hitEnemyIds: [],
      });
    }
  }

  private fireAxe(stats: typeof WEAPON_STATS['axe'][0]): void {
    const player = this.state.player;
    const count = stats.projectileCount;

    for (let i = 0; i < count; i++) {
      if (this.state.projectiles.length >= MAX_PROJECTILES) break;

      const startAngle = (i / count) * Math.PI * 2;
      const isCrit = Math.random() < player.critChance;
      const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));

      this.state.projectiles.push({
        id: this.nextProjectileId++,
        weaponType: 'axe',
        x: player.x + Math.cos(startAngle) * stats.range,
        y: 1.0,
        z: player.z + Math.sin(startAngle) * stats.range,
        vx: 0, vy: 0, vz: 0,
        damage,
        bouncesLeft: 0,
        pierceLeft: stats.pierce,
        lifetime: 3.0,
        radius: stats.aoeRadius,
        fromPlayer: true,
        hitEnemyIds: [],
        orbiting: true,
        orbitAngle: startAngle,
        orbitRadius: stats.range,
        orbitSpeed: stats.speed,
      });
    }
  }

  private fireBow(stats: typeof WEAPON_STATS['bow'][0]): void {
    const player = this.state.player;
    const count = stats.projectileCount;

    for (let i = 0; i < count; i++) {
      if (this.state.projectiles.length >= MAX_PROJECTILES) break;

      const target = this.findNearestEnemy(player.x, player.z, stats.range);
      let vx: number, vz: number;

      if (target && i === 0) {
        const dir = normalizeDirection(target.x - player.x, target.z - player.z);
        vx = dir.x * stats.speed;
        vz = dir.z * stats.speed;
      } else {
        const angle = player.rotation + (count > 1 ? (i - (count - 1) / 2) * 0.15 : 0);
        vx = Math.sin(angle) * stats.speed;
        vz = Math.cos(angle) * stats.speed;
      }

      const isCrit = Math.random() < player.critChance;
      const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));

      this.state.projectiles.push({
        id: this.nextProjectileId++,
        weaponType: 'bow',
        x: player.x, y: 1.0, z: player.z,
        vx, vy: 0, vz,
        damage,
        bouncesLeft: 0,
        pierceLeft: stats.pierce,
        lifetime: 3.0,
        radius: 0.25,
        fromPlayer: true,
        hitEnemyIds: [],
      });
    }
  }

  private fireLightningStaff(stats: typeof WEAPON_STATS['lightning_staff'][0]): void {
    const player = this.state.player;

    const target = this.findNearestEnemy(player.x, player.z, stats.range);
    if (!target) return;

    const isCrit = Math.random() < player.critChance;
    const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));
    target.hp -= damage;
    target.hitFlashTimer = 0.15;
    this.state.stats.damageDealt += damage;
    this.addDamageEvent(target.x, 1.5, target.z, damage, isCrit, false, 'lightning_staff');

    // Chain to nearby enemies
    const hitIds = new Set<number>([target.id]);
    let currentX = target.x;
    let currentZ = target.z;
    let chainsLeft = stats.chains - 1;

    while (chainsLeft > 0) {
      let nearestDist = stats.range * 0.6;
      let nearestEnemy: EnemyState | null = null;

      for (const enemy of this.state.enemies) {
        if (hitIds.has(enemy.id) || enemy.hp <= 0) continue;
        const dist = distanceBetween(currentX, currentZ, enemy.x, enemy.z);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = enemy;
        }
      }

      if (!nearestEnemy) break;

      const chainCrit = Math.random() < player.critChance;
      const chainDmg = Math.round(stats.damage * player.damageMultiplier * 0.7 * (chainCrit ? player.critDamage : 1));
      nearestEnemy.hp -= chainDmg;
      nearestEnemy.hitFlashTimer = 0.15;
      this.state.stats.damageDealt += chainDmg;
      this.addDamageEvent(nearestEnemy.x, 1.5, nearestEnemy.z, chainDmg, chainCrit, false, 'lightning_staff');

      hitIds.add(nearestEnemy.id);
      currentX = nearestEnemy.x;
      currentZ = nearestEnemy.z;
      chainsLeft--;
    }

    // Hit boss if in range
    if (this.state.boss && this.state.boss.hp > 0 && chainsLeft > 0) {
      const bossDist = distanceBetween(currentX, currentZ, this.state.boss.x, this.state.boss.z);
      if (bossDist < stats.range) {
        const bossCrit = Math.random() < player.critChance;
        const bossDmg = Math.round(stats.damage * player.damageMultiplier * 0.7 * (bossCrit ? player.critDamage : 1));
        this.state.boss.hp -= bossDmg;
        this.state.boss.hitFlashTimer = 0.15;
        this.state.stats.damageDealt += bossDmg;
        this.addDamageEvent(this.state.boss.x, 2, this.state.boss.z, bossDmg, bossCrit, false, 'lightning_staff');
      }
    }
  }

  private fireFlameRing(stats: typeof WEAPON_STATS['flame_ring'][0]): void {
    const player = this.state.player;
    const px = player.x;
    const pz = player.z;

    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      const dist = distanceBetween(px, pz, enemy.x, enemy.z);
      if (dist <= stats.aoeRadius) {
        const isCrit = Math.random() < player.critChance;
        const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));
        enemy.hp -= damage;
        enemy.hitFlashTimer = 0.1;
        this.state.stats.damageDealt += damage;
        this.addDamageEvent(enemy.x, 1.0, enemy.z, damage, isCrit, false, 'flame_ring');
      }
    }

    if (this.state.boss && this.state.boss.hp > 0) {
      const dist = distanceBetween(px, pz, this.state.boss.x, this.state.boss.z);
      if (dist <= stats.aoeRadius) {
        const isCrit = Math.random() < player.critChance;
        const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));
        this.state.boss.hp -= damage;
        this.state.boss.hitFlashTimer = 0.15;
        this.state.stats.damageDealt += damage;
        this.addDamageEvent(this.state.boss.x, 2, this.state.boss.z, damage, isCrit, false, 'flame_ring');
      }
    }
  }

  private fireShotgun(stats: typeof WEAPON_STATS['shotgun'][0]): void {
    const player = this.state.player;
    const count = stats.projectileCount;
    const spreadAngle = Math.PI * 0.35;

    for (let i = 0; i < count; i++) {
      if (this.state.projectiles.length >= MAX_PROJECTILES) break;

      const angleOffset = count > 1
        ? ((i / (count - 1)) - 0.5) * spreadAngle
        : 0;
      const angle = player.rotation + angleOffset;
      const vx = Math.sin(angle) * stats.speed;
      const vz = Math.cos(angle) * stats.speed;

      const isCrit = Math.random() < player.critChance;
      const damage = Math.round(stats.damage * player.damageMultiplier * (isCrit ? player.critDamage : 1));

      this.state.projectiles.push({
        id: this.nextProjectileId++,
        weaponType: 'shotgun',
        x: player.x, y: 1.0, z: player.z,
        vx, vy: 0, vz,
        damage,
        bouncesLeft: 0,
        pierceLeft: stats.pierce,
        lifetime: 1.5,
        radius: 0.2,
        fromPlayer: true,
        hitEnemyIds: [],
      });
    }
  }

  // =========================================================================
  // Private: Projectiles
  // =========================================================================

  private updateProjectiles(dt: number): void {
    const projectiles = this.state.projectiles;
    const player = this.state.player;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];

      // Handle orbiting projectiles (axe)
      if (proj.orbiting) {
        updateOrbitingProjectile(proj, player.x, player.z, dt);
      }
      // Normal movement
      else {
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        proj.z += proj.vz * dt;
      }

      // Ensure projectile y does not go below terrain height
      const terrainY = this.getTerrainHeight(proj.x, proj.z);
      if (proj.y < terrainY + 0.1) {
        proj.y = terrainY + 0.1;
      }

      proj.lifetime -= dt;
      if (proj.lifetime <= 0) {
        projectiles.splice(i, 1);
        continue;
      }

      // Remove if out of bounds
      const halfMap = (this.config.mapSize + 20) * 0.5;
      if (Math.abs(proj.x) > halfMap || Math.abs(proj.z) > halfMap) {
        projectiles.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // Private: Collision Detection
  // =========================================================================

  private processCollisions(): void {
    const player = this.state.player;
    const enemies = this.state.enemies;

    // Insert all enemies into spatial hash
    this.spatialHash.clear();
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      this.spatialHash.insert(enemy.id, enemy.x, enemy.z, 0.5);
    }
    if (this.state.boss && this.state.boss.hp > 0) {
      this.spatialHash.insert(-1, this.state.boss.x, this.state.boss.z, 1.5);
    }

    // Player projectiles vs enemies
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
      const proj = this.state.projectiles[i];
      if (!proj.fromPlayer) continue;

      // Gravitational projectiles deal periodic damage (handled via hit reset)
      if (proj.gravitational) {
        // Reset hit list periodically (every 0.5s)
        if (proj.lifetime % 0.5 < TICK_INTERVAL_MS / 1000) {
          proj.hitEnemyIds = [];
        }
      }

      const nearbyIds = this.spatialHash.query(proj.x, proj.z, proj.radius);
      let consumed = false;

      for (const id of nearbyIds) {
        if (proj.hitEnemyIds.includes(id)) continue;

        // Boss collision
        if (id === -1 && this.state.boss && this.state.boss.hp > 0) {
          this.state.boss.hp -= proj.damage;
          this.state.boss.hitFlashTimer = 0.15;
          this.state.stats.damageDealt += proj.damage;
          this.addDamageEvent(this.state.boss.x, 2, this.state.boss.z, proj.damage, false, false, proj.weaponType);
          proj.hitEnemyIds.push(id);

          if (proj.pierceLeft > 0) {
            proj.pierceLeft--;
            continue;
          }
          if (!proj.gravitational && !proj.orbiting) {
            consumed = true;
          }
          break;
        }

        // Enemy collision
        const enemy = this.findEnemyById(id);
        if (!enemy || enemy.hp <= 0) continue;

        enemy.hp -= proj.damage;
        enemy.hitFlashTimer = 0.15;
        this.state.stats.damageDealt += proj.damage;
        this.addDamageEvent(enemy.x, 1.0, enemy.z, proj.damage, false, false, proj.weaponType);
        proj.hitEnemyIds.push(id);

        // Knockback from knockback tome
        this.applyKnockback(enemy, proj.x, proj.z);

        // Handle bone_bouncer bounce
        if (proj.weaponType === 'bone_bouncer' && proj.bouncesLeft > 0) {
          proj.bouncesLeft--;
          const nextTarget = this.findNearestEnemyExcluding(proj.x, proj.z, proj.hitEnemyIds);
          if (nextTarget) {
            const dir = normalizeDirection(nextTarget.x - proj.x, nextTarget.z - proj.z);
            const speed = Math.sqrt(proj.vx * proj.vx + proj.vz * proj.vz);
            proj.vx = dir.x * speed;
            proj.vz = dir.z * speed;
          } else {
            consumed = true;
          }
          break;
        }

        // Handle pierce
        if (proj.pierceLeft > 0) {
          proj.pierceLeft--;
          continue;
        }

        // Gravitational/orbiting projectiles don't get consumed on single hits
        if (proj.gravitational || proj.orbiting) {
          continue;
        }

        consumed = true;
        break;
      }

      if (consumed) {
        this.state.projectiles.splice(i, 1);
      }
    }

    // Enemies attacking player (melee)
    if (player.alive && player.invincibleTimer <= 0) {
      for (const enemy of enemies) {
        if (enemy.hp <= 0 || enemy.attackCooldown > 0) continue;

        const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
        if (dist < 1.2) {
          // Shield tome reduces damage
          const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
          const shieldReduction = shieldTome ? shieldTome.level * 0.05 : 0;
          const rawDamage = Math.max(1, enemy.damage - player.armor);
          const damage = Math.max(1, Math.round(rawDamage * (1 - shieldReduction)));
          player.hp -= damage;
          player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
          enemy.attackCooldown = enemy.attackCooldownMax;
          this.state.stats.damageTaken += damage;
          this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);

          if (player.hp <= 0) {
            this.checkPlayerDeath();
          }
          break;
        }
      }
    }

    // Boss melee vs player
    if (player.alive && player.invincibleTimer <= 0 && this.state.boss && this.state.boss.hp > 0) {
      const dist = distanceBetween(player.x, player.z, this.state.boss.x, this.state.boss.z);
      if (dist < 2.0 && this.state.boss.attackCooldown <= 0) {
        const bossDmg = this.getBossMeleeDamage();
        const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
        const shieldReduction = shieldTome ? shieldTome.level * 0.05 : 0;
        const rawDamage = Math.max(1, bossDmg - player.armor);
        const damage = Math.max(1, Math.round(rawDamage * (1 - shieldReduction)));
        player.hp -= damage;
        player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
        this.state.boss.attackCooldown = 2.0;
        this.state.stats.damageTaken += damage;
        this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);

        if (player.hp <= 0) {
          this.checkPlayerDeath();
        }
      }
    }

    // Enemy projectiles vs player
    if (player.alive && player.invincibleTimer <= 0) {
      for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
        const proj = this.state.projectiles[i];
        if (proj.fromPlayer) continue;

        const dist = distanceBetween(proj.x, proj.z, player.x, player.z);
        const yDist = Math.abs(proj.y - 0.5);
        if (dist < proj.radius + 0.5 && yDist < 1.5) {
          const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
          const shieldReduction = shieldTome ? shieldTome.level * 0.05 : 0;
          const rawDamage = Math.max(1, proj.damage - player.armor);
          const damage = Math.max(1, Math.round(rawDamage * (1 - shieldReduction)));
          player.hp -= damage;
          player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
          this.state.stats.damageTaken += damage;
          this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);
          this.state.projectiles.splice(i, 1);

          if (player.hp <= 0) {
            this.checkPlayerDeath();
          }
          break;
        }
      }
    }
  }

  // =========================================================================
  // Private: Teleporter System
  // =========================================================================

  private updateTeleporters(dt: number): void {
    const player = this.state.player;
    const tierCfg = TIER_CONFIGS[this.config.tier];

    // Tier 1: no teleporters (boss spawns on timer)
    if (tierCfg.teleporterCount === 0) return;

    // Spawn teleporters when time is right
    if (this.state.teleporters.length < tierCfg.teleporterCount && this.state.gameTime >= TELEPORTER_APPEAR_TIME && !this.state.boss) {
      // Spawn teleporter(s) at random locations away from player
      while (this.state.teleporters.length < tierCfg.teleporterCount) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 25 + Math.random() * 15;
        const tx = Math.cos(angle) * distance;
        const tz = Math.sin(angle) * distance;
        const halfMap = this.config.mapSize * 0.4;

        this.state.teleporters.push({
          x: Math.max(-halfMap, Math.min(halfMap, tx)),
          z: Math.max(-halfMap, Math.min(halfMap, tz)),
          phase: 'available',
          activationTimer: 0,
          activationDuration: TELEPORTER_ACTIVATION_DURATION,
        });
      }
    }

    // Update existing teleporters
    for (const tp of this.state.teleporters) {
      if (tp.phase === 'available') {
        // Check if player is standing on it
        const dist = distanceBetween(player.x, player.z, tp.x, tp.z);
        if (dist < TELEPORTER_RADIUS) {
          tp.phase = 'activating';
          tp.activationTimer = 0;
        }
      } else if (tp.phase === 'activating') {
        const dist = distanceBetween(player.x, player.z, tp.x, tp.z);
        if (dist >= TELEPORTER_RADIUS) {
          // Player walked away, reset
          tp.phase = 'available';
          tp.activationTimer = 0;
        } else {
          tp.activationTimer += dt;
          if (tp.activationTimer >= tp.activationDuration) {
            tp.phase = 'activated';
            // Teleporter activated → trigger boss spawn
          }
        }
      }
    }
  }

  // =========================================================================
  // Private: Deaths & Pickups
  // =========================================================================

  private processDeaths(): void {
    const enemies = this.state.enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      if (enemy.hp <= 0) {
        this.spawnPickupFromEnemy(enemy);
        this.state.stats.killCount++;
        // Combo system: increment on each kill
        this.state.player.comboCount++;
        this.state.player.comboTimer = 2.0;
        enemies.splice(i, 1);
      }
    }
  }

  private spawnPickupFromEnemy(enemy: EnemyState): void {
    if (this.state.pickups.length >= MAX_PICKUPS) return;

    const cfg = ENEMY_CONFIGS[enemy.type];
    if (!cfg) return;

    let xpReward = cfg.xpReward;

    // Curse tome: more XP from kills
    const curseTome = this.state.player.tomes.find(t => t.type === 'curse_tome');
    if (curseTome) {
      xpReward = Math.round(xpReward * (1 + curseTome.level * 0.2));
    }

    let pickupType: PickupType;
    if (xpReward >= 30) {
      pickupType = 'xp_orange';
    } else if (xpReward >= 10) {
      pickupType = 'xp_purple';
    } else if (xpReward >= 3) {
      pickupType = 'xp_blue';
    } else {
      pickupType = 'xp_green';
    }

    this.state.pickups.push({
      id: this.nextPickupId++,
      type: pickupType,
      x: enemy.x,
      y: 0.2,
      z: enemy.z,
      value: XP_VALUES[pickupType] ?? 1,
      lifetime: PICKUP_LIFETIME,
      attracted: false,
    });

    // Elites also drop silver
    if (enemy.isElite && this.state.pickups.length < MAX_PICKUPS) {
      this.state.pickups.push({
        id: this.nextPickupId++,
        type: 'silver',
        x: enemy.x + (Math.random() - 0.5),
        y: 0.2,
        z: enemy.z + (Math.random() - 0.5),
        value: 5,
        lifetime: PICKUP_LIFETIME,
        attracted: false,
      });
    }

    // Random health drops
    if (this.state.pickups.length < MAX_PICKUPS) {
      const roll = Math.random();
      if (roll < HEALTH_DROP_CHANCE) {
        this.state.pickups.push({
          id: this.nextPickupId++,
          type: 'health',
          x: enemy.x + (Math.random() - 0.5),
          y: 0.2,
          z: enemy.z + (Math.random() - 0.5),
          value: 50,
          lifetime: PICKUP_LIFETIME,
          attracted: false,
        });
      } else if (roll < HEALTH_DROP_CHANCE + HEALTH_SMALL_DROP_CHANCE) {
        this.state.pickups.push({
          id: this.nextPickupId++,
          type: 'health_small',
          x: enemy.x + (Math.random() - 0.5),
          y: 0.2,
          z: enemy.z + (Math.random() - 0.5),
          value: 25,
          lifetime: PICKUP_LIFETIME,
          attracted: false,
        });
      }
    }
  }

  private updatePickups(dt: number): void {
    const player = this.state.player;
    if (!player.alive) return;

    const pickups = this.state.pickups;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pickup = pickups[i];
      pickup.lifetime -= dt;

      if (pickup.lifetime <= 0) {
        pickups.splice(i, 1);
        continue;
      }

      const dist = distanceBetween(player.x, player.z, pickup.x, pickup.z);

      if (dist < player.pickupRadius) {
        pickup.attracted = true;
      }

      if (pickup.attracted) {
        // Accelerating attraction: starts slow, gets faster as gem approaches
        // speed = PICKUP_ATTRACT_SPEED * (1 - distance/maxDist)^2
        const maxDist = player.pickupRadius;
        const t = Math.max(0, 1 - dist / maxDist);
        const attractSpeed = PICKUP_ATTRACT_SPEED * (0.3 + t * t * 2.0);

        const dir = normalizeDirection(player.x - pickup.x, player.z - pickup.z);
        pickup.x += dir.x * attractSpeed * dt;
        pickup.z += dir.z * attractSpeed * dt;

        const newDist = distanceBetween(player.x, player.z, pickup.x, pickup.z);
        if (newDist < 0.5) {
          this.collectPickup(pickup);
          pickups.splice(i, 1);
        }
      }
    }
  }

  private collectPickup(pickup: PickupState): void {
    if (pickup.type === 'silver') {
      this.state.stats.silverEarned += pickup.value;
      const luckTome = this.state.player.tomes.find(t => t.type === 'luck_tome');
      if (luckTome) {
        this.state.stats.silverEarned += luckTome.level;
      }
      return;
    }

    // Health pickup — restore HP
    if (pickup.type === 'health' || pickup.type === 'health_small') {
      const player = this.state.player;
      player.hp = Math.min(player.maxHp, player.hp + pickup.value);
      return;
    }

    // XP pickup
    let xpValue = pickup.value;
    const xpGainTome = this.state.player.tomes.find(t => t.type === 'xp_gain_tome');
    if (xpGainTome) {
      xpValue = Math.floor(xpValue * (1 + xpGainTome.level * 0.15));
    }
    // Shop xpGain bonus
    const shopBonuses = getShopBonuses();
    const shopXpBonus = shopBonuses['xpGain'] ?? 0;
    if (shopXpBonus > 0) {
      xpValue = Math.floor(xpValue * (1 + shopXpBonus));
    }
    // Combo multiplier: 1 + min(comboCount * 0.05, 1.0) → max 2x
    const comboMultiplier = 1 + Math.min(this.state.player.comboCount * 0.05, 1.0);
    xpValue = Math.floor(xpValue * comboMultiplier);
    // Tier XP multiplier
    const tierCfg = TIER_CONFIGS[this.config.tier];
    xpValue = Math.floor(xpValue * tierCfg.xpMultiplier);
    this.state.player.xp += xpValue;
  }

  // =========================================================================
  // Private: Level Up
  // =========================================================================

  private checkLevelUp(): void {
    const player = this.state.player;
    if (!player.alive || this.state.phase === 'level_up') return;
    if (player.level >= 40) return;

    while (player.xp >= player.xpToNext && player.level < 40) {
      player.xp -= player.xpToNext;
      player.level++;
      player.xpToNext = xpForLevel(player.level);

      // Heal on level up
      player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.1));

      // Unlock weapon slots at certain levels (MegaBonk progression)
      if (player.level === 5 && player.maxWeaponSlots < 3) player.maxWeaponSlots = 3;
      if (player.level === 10 && player.maxWeaponSlots < 4) player.maxWeaponSlots = 4;
      if (player.level === 20 && player.maxWeaponSlots < 5) player.maxWeaponSlots = 5;
      if (player.level === 30 && player.maxWeaponSlots < MAX_WEAPONS_CAP) player.maxWeaponSlots = MAX_WEAPONS_CAP;

      // Generate upgrade options
      const options = generateUpgradeOptions(player, 3);
      if (options.length > 0) {
        this.state.upgradeOptions = options;
        this.state.phase = 'level_up';
        return;
      }
    }
  }

  // =========================================================================
  // Private: Enemy Spawning
  // =========================================================================

  private spawnEnemies(dt: number): void {
    if (this.state.phase === 'boss_fight' || this.state.phase === 'boss_intro') return;

    const wave = this.getCurrentWave();
    if (!wave) return;

    for (let i = 0; i < WAVE_CONFIGS.length; i++) {
      if (this.state.gameTime >= WAVE_CONFIGS[i].timeStart && this.state.gameTime < WAVE_CONFIGS[i].timeEnd) {
        this.state.waveIndex = i;
        break;
      }
    }

    // --- Final Swarm Phase (time 480-540) ---
    const isFinalSwarm = this.state.gameTime >= 480 && this.state.gameTime < BOSS_SPAWN_TIME;
    this.state.finalSwarm = isFinalSwarm;

    const maxAlive = isFinalSwarm ? 150 : wave.maxAlive;
    const maxEnemiesLimit = isFinalSwarm ? 150 : this.config.maxEnemies;

    if (this.state.enemies.length >= maxAlive) return;
    if (this.state.enemies.length >= maxEnemiesLimit) return;

    // --- Mini-boss spawning (every 2 minutes after minute 3) ---
    if (this.state.gameTime >= 180) {
      this.miniBossTimer += dt;
      if (this.miniBossTimer >= 120) {
        this.miniBossTimer = 0;
        this.spawnMiniBoss();
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      // Curse tome: faster spawn rate
      const curseTome = this.state.player.tomes.find(t => t.type === 'curse_tome');
      const curseSpawnMult = curseTome ? (1 - curseTome.level * 0.1) : 1.0;
      let spawnInterval = wave.spawnInterval * Math.max(0.5, curseSpawnMult);

      // Final swarm: double spawn rate
      if (isFinalSwarm) {
        spawnInterval *= 0.5;
      }

      this.spawnTimer = spawnInterval;

      const groupMin = wave.groupSize[0];
      const groupMax = wave.groupSize[1];
      let groupSize = groupMin + Math.floor(Math.random() * (groupMax - groupMin + 1));

      // Curse tome: bigger groups
      if (curseTome) {
        groupSize = Math.round(groupSize * (1 + curseTome.level * 0.15));
      }

      // Final swarm: bigger groups
      if (isFinalSwarm) {
        groupSize = Math.round(groupSize * 1.5);
      }

      // Choose enemy types (all types available during final swarm)
      const availableEnemies = isFinalSwarm
        ? Object.keys(ENEMY_CONFIGS)
        : wave.enemies;

      for (let i = 0; i < groupSize; i++) {
        if (this.state.enemies.length >= maxAlive) break;
        if (this.state.enemies.length >= maxEnemiesLimit) break;

        const isEliteRoll = Math.random() < wave.eliteChance;
        let enemyType: string;

        if (isEliteRoll) {
          const eliteTypes = Object.keys(ENEMY_CONFIGS).filter(
            t => ENEMY_CONFIGS[t].isElite && ENEMY_CONFIGS[t].firstAppear <= this.state.gameTime
          );
          if (eliteTypes.length > 0) {
            enemyType = eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
          } else {
            enemyType = this.pickWeightedEnemy(availableEnemies);
          }
        } else {
          enemyType = this.pickWeightedEnemy(availableEnemies);
        }

        if (!enemyType) continue;
        this.spawnSingleEnemy(enemyType);
      }
    }
  }

  private spawnMiniBoss(): void {
    const allTypes = Object.keys(ENEMY_CONFIGS).filter(
      t => ENEMY_CONFIGS[t].firstAppear <= this.state.gameTime
    );
    if (allTypes.length === 0) return;

    const baseType = allTypes[Math.floor(Math.random() * allTypes.length)];
    const cfg = ENEMY_CONFIGS[baseType];
    if (!cfg) return;

    const spawnPos = this.getSpawnPosition();
    const timeScale = 1 + this.state.gameTime / 600;
    const tierCfg = TIER_CONFIGS[this.config.tier];

    const enemy: EnemyState = {
      id: this.nextEnemyId++,
      type: baseType as EnemyType,
      x: spawnPos.x,
      y: 0,
      z: spawnPos.z,
      hp: Math.round(cfg.hp * timeScale * 3 * tierCfg.enemyHpMultiplier),
      maxHp: Math.round(cfg.hp * timeScale * 3 * tierCfg.enemyHpMultiplier),
      speed: cfg.speed * tierCfg.enemySpeedMultiplier,
      damage: Math.round(cfg.damage * 2 * tierCfg.enemyDamageMultiplier),
      behavior: cfg.behavior as EnemyBehavior,
      isElite: true,
      isMiniBoss: true,
      hitFlashTimer: 0,
      attackCooldown: 0,
      attackCooldownMax: cfg.attackCooldown,
      targetX: this.state.player.x,
      targetZ: this.state.player.z,
      chargeState: 'idle',
      chargeTimer: 0,
      chargeTargetX: 0,
      chargeTargetZ: 0,
      summonCooldown: 8,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitTimer: 0,
      diveState: 'flying',
      diveTimer: 0,
    };

    this.state.enemies.push(enemy);
  }

  private getCurrentWave(): typeof WAVE_CONFIGS[number] | null {
    for (const wave of WAVE_CONFIGS) {
      if (this.state.gameTime >= wave.timeStart && this.state.gameTime < wave.timeEnd) {
        return wave;
      }
    }
    if (WAVE_CONFIGS.length > 0 && this.state.gameTime >= WAVE_CONFIGS[WAVE_CONFIGS.length - 1].timeEnd) {
      return WAVE_CONFIGS[WAVE_CONFIGS.length - 1];
    }
    return null;
  }

  private pickWeightedEnemy(types: string[]): string {
    const available = types.filter(
      t => ENEMY_CONFIGS[t] && ENEMY_CONFIGS[t].firstAppear <= this.state.gameTime
    );
    if (available.length === 0) return types[0];

    let totalWeight = 0;
    for (const t of available) {
      totalWeight += ENEMY_CONFIGS[t]?.spawnWeight ?? 1;
    }

    let roll = Math.random() * totalWeight;
    for (const t of available) {
      roll -= ENEMY_CONFIGS[t]?.spawnWeight ?? 1;
      if (roll <= 0) return t;
    }
    return available[available.length - 1];
  }

  private spawnSingleEnemy(type: string): void {
    const cfg = ENEMY_CONFIGS[type];
    if (!cfg) return;

    const spawnPos = this.getSpawnPosition();
    const timeScale = 1 + this.state.gameTime / 600;
    const tierCfg = TIER_CONFIGS[this.config.tier];

    // Enhanced HP scaling: after 3 minutes, +10% per minute
    let hpScale = timeScale;
    if (this.state.gameTime >= 180) {
      const extraMinutes = (this.state.gameTime - 180) / 60;
      hpScale *= (1 + extraMinutes * 0.1);
    }

    let hp = Math.round(cfg.hp * hpScale * tierCfg.enemyHpMultiplier);
    let speed = cfg.speed * tierCfg.enemySpeedMultiplier;
    let damage = Math.round(cfg.damage * tierCfg.enemyDamageMultiplier);
    let isElite = cfg.isElite;

    // Elite enemies: 50% chance of random buff (fast, tanky, or damage)
    if (isElite && Math.random() < 0.5) {
      const buff = Math.floor(Math.random() * 3);
      switch (buff) {
        case 0: speed *= 1.4; break; // fast
        case 1: hp = Math.round(hp * 1.5); break; // tanky
        case 2: damage = Math.round(damage * 1.5); break; // damage
      }
    }

    const enemy: EnemyState = {
      id: this.nextEnemyId++,
      type: type as EnemyType,
      x: spawnPos.x,
      y: type === 'gargoyle' ? 3 : 0,
      z: spawnPos.z,
      hp,
      maxHp: hp,
      speed,
      damage,
      behavior: cfg.behavior as EnemyBehavior,
      isElite,
      isMiniBoss: false,
      hitFlashTimer: 0,
      attackCooldown: 0,
      attackCooldownMax: cfg.attackCooldown,
      targetX: this.state.player.x,
      targetZ: this.state.player.z,
      chargeState: 'idle',
      chargeTimer: 0,
      chargeTargetX: 0,
      chargeTargetZ: 0,
      summonCooldown: type === 'necromancer' ? 8 : 0,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitTimer: 0,
      diveState: 'flying',
      diveTimer: 0,
    };

    this.state.enemies.push(enemy);
  }

  private getSpawnPosition(): { x: number; z: number } {
    const halfMap = this.config.mapSize * 0.5;
    const offset = 5;
    const side = Math.floor(Math.random() * 4);
    const along = (Math.random() - 0.5) * this.config.mapSize;

    switch (side) {
      case 0: return { x: along, z: -halfMap - offset };
      case 1: return { x: along, z: halfMap + offset };
      case 2: return { x: -halfMap - offset, z: along };
      default: return { x: halfMap + offset, z: along };
    }
  }

  // =========================================================================
  // Private: Boss
  // =========================================================================

  private checkBossSpawn(): void {
    if (this.state.boss) return;
    if (this.state.phase === 'victory' || this.state.phase === 'defeat') return;

    const tierCfg = TIER_CONFIGS[this.config.tier];

    if (tierCfg.teleporterCount === 0) {
      // Tier 1: boss spawns automatically on timer
      if (this.state.gameTime < BOSS_SPAWN_TIME) return;
    } else {
      // Tier 2+: boss ONLY spawns via teleporter activation (all must be activated)
      const allActivated = this.state.teleporters.length >= tierCfg.teleporterCount &&
        this.state.teleporters.every(t => t.phase === 'activated');
      if (!allActivated) return;
    }

    this.state.boss = {
      x: 0,
      y: 0,
      z: -this.config.mapSize * 0.3,
      hp: Math.round(BOSS_HP * tierCfg.bossHpMultiplier),
      maxHp: Math.round(BOSS_HP * tierCfg.bossHpMultiplier),
      phase: 1,
      currentAttack: 'idle',
      attackTimer: BOSS_INTRO_DURATION,
      attackCooldown: 3.0,
      hitFlashTimer: 0,
      speed: 3.0,
      enraged: false,
    };

    this.state.phase = 'boss_intro';
    this.state.enemies = [];
  }

  private updateBossAI(dt: number): void {
    const boss = this.state.boss;
    if (!boss) return;

    const player = this.state.player;

    const hpRatio = boss.hp / boss.maxHp;
    if (hpRatio <= 0.3) {
      boss.phase = 3;
      boss.enraged = true;
      boss.speed = 5.0;
    } else if (hpRatio <= 0.6) {
      boss.phase = 2;
      boss.speed = 4.0;
    } else {
      boss.phase = 1;
      boss.speed = 3.0;
    }

    boss.attackTimer -= dt;
    if (boss.attackCooldown > 0) {
      boss.attackCooldown -= dt;
    }

    if (boss.attackTimer <= 0) {
      boss.currentAttack = this.chooseBossAttack(boss.phase);
      boss.attackTimer = (boss.enraged ? 1.5 : 2.5) + Math.random() * 1.0;
      this.executeBossAttack(boss);
    }

    const dist = distanceBetween(boss.x, boss.z, player.x, player.z);
    if (dist > 2.0) {
      const dir = normalizeDirection(player.x - boss.x, player.z - boss.z);
      const halfMap = this.config.mapSize * 0.5;
      boss.x = Math.max(-halfMap, Math.min(halfMap, boss.x + dir.x * boss.speed * dt));
      boss.z = Math.max(-halfMap, Math.min(halfMap, boss.z + dir.z * boss.speed * dt));
    }
  }

  private chooseBossAttack(phase: BossPhase): BossAttack {
    const attacks: BossAttack[][] = [
      ['melee_sweep', 'ground_slam', 'dark_bolt'],
      ['melee_sweep', 'ground_slam', 'summon_wave', 'charge', 'dark_bolt'],
      ['aoe_explosion', 'dark_rain', 'charge', 'summon_wave', 'melee_sweep'],
    ];
    const pool = attacks[phase - 1];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private executeBossAttack(boss: BossState): void {
    const player = this.state.player;
    if (!player.alive) return;

    const dist = distanceBetween(boss.x, boss.z, player.x, player.z);

    switch (boss.currentAttack) {
      case 'melee_sweep':
        if (dist < 3.5 && player.invincibleTimer <= 0) {
          const damage = Math.max(1, 25 - player.armor);
          player.hp -= damage;
          player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
          this.state.stats.damageTaken += damage;
          this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);
          this.checkPlayerDeath();
        }
        break;

      case 'ground_slam':
        if (dist < 5.0 && player.invincibleTimer <= 0) {
          const damage = Math.max(1, 35 - player.armor);
          player.hp -= damage;
          player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
          this.state.stats.damageTaken += damage;
          this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);
          this.checkPlayerDeath();
        }
        break;

      case 'dark_bolt':
        if (this.state.projectiles.length < MAX_PROJECTILES) {
          const dir = normalizeDirection(player.x - boss.x, player.z - boss.z);
          this.state.projectiles.push({
            id: this.nextProjectileId++,
            weaponType: 'flame_ring',
            x: boss.x, y: 1.0, z: boss.z,
            vx: dir.x * 10, vy: 0, vz: dir.z * 10,
            damage: 20,
            bouncesLeft: 0, pierceLeft: 0,
            lifetime: 4.0, radius: 0.5,
            fromPlayer: false,
            hitEnemyIds: [],
          });
        }
        break;

      case 'summon_wave': {
        const count = boss.phase === 3 ? 8 : 4;
        for (let i = 0; i < count; i++) {
          if (this.state.enemies.length >= MAX_ENEMIES) break;
          const angle = (i / count) * Math.PI * 2;
          const spawnDist = 5;
          const enemyType = boss.phase >= 2 ? 'zombie' : 'skeleton_soldier';
          const cfg = ENEMY_CONFIGS[enemyType];
          if (!cfg) continue;

          this.state.enemies.push({
            id: this.nextEnemyId++,
            type: enemyType as EnemyType,
            x: boss.x + Math.cos(angle) * spawnDist,
            y: 0,
            z: boss.z + Math.sin(angle) * spawnDist,
            hp: cfg.hp,
            maxHp: cfg.hp,
            speed: cfg.speed,
            damage: cfg.damage,
            behavior: cfg.behavior as EnemyBehavior,
            isElite: false,
            isMiniBoss: false,
            hitFlashTimer: 0,
            attackCooldown: 0,
            attackCooldownMax: cfg.attackCooldown,
            targetX: player.x,
            targetZ: player.z,
            chargeState: 'idle',
            chargeTimer: 0,
            chargeTargetX: 0,
            chargeTargetZ: 0,
            summonCooldown: 0,
            orbitAngle: Math.random() * Math.PI * 2,
            orbitTimer: 0,
            diveState: 'flying',
            diveTimer: 0,
          });
        }
        break;
      }

      case 'aoe_explosion':
        if (dist < 7.0 && player.invincibleTimer <= 0) {
          const damage = Math.max(1, 40 - player.armor);
          player.hp -= damage;
          player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
          this.state.stats.damageTaken += damage;
          this.addDamageEvent(player.x, 1.5, player.z, damage, false, true);
          this.checkPlayerDeath();
        }
        break;

      case 'charge':
        boss.speed = 12.0;
        break;

      case 'dark_rain':
        for (let i = 0; i < 6; i++) {
          if (this.state.projectiles.length >= MAX_PROJECTILES) break;
          const ox = (Math.random() - 0.5) * 12;
          const oz = (Math.random() - 0.5) * 12;
          this.state.projectiles.push({
            id: this.nextProjectileId++,
            weaponType: 'flame_ring',
            x: player.x + ox, y: 10, z: player.z + oz,
            vx: 0, vy: -12, vz: 0,
            damage: 15,
            bouncesLeft: 0, pierceLeft: 0,
            lifetime: 2.0, radius: 1.0,
            fromPlayer: false,
            hitEnemyIds: [],
          });
        }
        break;

      case 'idle':
        break;
    }
  }

  private getBossMeleeDamage(): number {
    if (!this.state.boss) return 20;
    switch (this.state.boss.phase) {
      case 1: return 20;
      case 2: return 30;
      case 3: return 40;
      default: return 20;
    }
  }

  // =========================================================================
  // Private: Thorns & Knockback
  // =========================================================================

  private applyThornsDamage(): void {
    const player = this.state.player;
    const thornsTome = player.tomes.find(t => t.type === 'thorns_tome');
    if (!thornsTome || thornsTome.level <= 0) return;

    const thornsDamage = thornsTome.level * 3;
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
      if (dist < 1.5) {
        enemy.hp -= thornsDamage;
        enemy.hitFlashTimer = 0.1;
        this.state.stats.damageDealt += thornsDamage;
      }
    }
  }

  private applyKnockback(enemy: EnemyState, fromX: number, fromZ: number): void {
    const knockbackTome = this.state.player.tomes.find(t => t.type === 'knockback_tome');
    // Always apply a base knockback; tome multiplies it
    const baseForce = 1.5;
    const tomeMultiplier = knockbackTome ? (1 + knockbackTome.level * 0.3) : 1.0;
    const force = baseForce * tomeMultiplier;

    const dir = normalizeDirection(enemy.x - fromX, enemy.z - fromZ);
    const halfMap = (this.config.mapSize + 10) * 0.5;
    enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + dir.x * force));
    enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + dir.z * force));
  }

  // =========================================================================
  // Private: Game Over
  // =========================================================================

  private checkGameOver(): void {
    if (!this.state.player.alive) {
      this.state.phase = 'defeat';
      this.state.finished = true;
      this.state.running = false;
      return;
    }

    if (this.state.boss && this.state.boss.hp <= 0) {
      this.state.phase = 'victory';
      this.state.finished = true;
      this.state.running = false;
      this.state.stats.silverEarned += 50;
    }
  }

  private checkPlayerDeath(): void {
    const player = this.state.player;
    if (player.hp <= 0) {
      // No revive mechanic in MegaBonk — just die
      player.alive = false;
    }
  }

  // =========================================================================
  // Private: Tome Stats Recalculation
  // =========================================================================

  private recalculateTomeStats(): void {
    const player = this.state.player;
    const charCfg = CHARACTER_CONFIGS[this.config.character];
    const shopBonuses = getShopBonuses();

    let speedMult = 1.0;
    let damageMult = charCfg.damage + (shopBonuses['damage'] ?? 0);
    let attackSpeedMult = 1.0;
    let critChance = charCfg.critChance + (shopBonuses['critChance'] ?? 0);
    let critDamage = PLAYER_BASE_CRIT_DAMAGE;
    let armor = charCfg.armor + (shopBonuses['armor'] ?? 0);
    let pickupRadius = PLAYER_PICKUP_RADIUS + (shopBonuses['pickupRadius'] ?? 0);

    for (const tome of player.tomes) {
      switch (tome.type) {
        case 'attack_speed_tome':
          attackSpeedMult += tome.level * 0.1;
          break;
        case 'speed_tome':
          speedMult += tome.level * 0.08;
          break;
        case 'attraction_tome':
          pickupRadius += tome.level * 1.2;
          break;
        case 'shield_tome':
          armor += tome.level * 2;
          break;
        case 'precision_tome':
          critChance += tome.level * 0.05;
          critDamage += tome.level * 0.1;
          break;
        // thorns_tome, knockback_tome, luck_tome, xp_gain_tome, curse_tome
        // are handled contextually in their respective code paths
      }
    }

    player.speed = (charCfg.speed + (shopBonuses['speed'] ?? 0)) * speedMult;
    player.damageMultiplier = damageMult;
    player.attackSpeedMultiplier = attackSpeedMult;
    player.critChance = critChance;
    player.critDamage = critDamage;
    player.armor = armor;
    player.pickupRadius = pickupRadius;
  }

  // =========================================================================
  // Private: Weapon Evolution
  // =========================================================================

  private checkWeaponEvolutions(): void {
    const player = this.state.player;

    for (const weapon of player.weapons) {
      if (weapon.evolved) continue;
      if (weapon.level < 8) continue;

      // Check if any evolution matches this weapon
      const evolution = WEAPON_EVOLUTIONS.find(e => e.baseWeapon === weapon.type);
      if (!evolution) continue;

      // Check if the required tome is at the required level
      const tome = player.tomes.find(t => t.type === evolution.requiredTome);
      if (!tome || tome.level < evolution.requiredTomeLevel) continue;

      // Evolve the weapon!
      weapon.evolved = true;
      weapon.level = 9; // Special evolved level

      // Track evolution in save stats
      const save = loadSave();
      save.stats.totalEvolutions += 1;
      saveSave(save);
    }
  }

  // =========================================================================
  // Private: Chests
  // =========================================================================

  private generateChests(): ChestState[] {
    const chests: ChestState[] = [];
    const halfMap = this.config.mapSize * 0.4;
    for (let i = 0; i < CHEST_COUNT; i++) {
      const angle = (i / CHEST_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 15 + Math.random() * halfMap * 0.5;
      chests.push({
        id: i + 1,
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        opened: false,
        reward: CHEST_SILVER_MIN + Math.floor(Math.random() * (CHEST_SILVER_MAX - CHEST_SILVER_MIN)),
      });
    }
    return chests;
  }

  private updateChests(): void {
    const player = this.state.player;
    if (!player.alive) return;
    for (const chest of this.state.chests) {
      if (chest.opened) continue;
      const dist = distanceBetween(player.x, player.z, chest.x, chest.z);
      if (dist < CHEST_INTERACT_RADIUS) {
        chest.opened = true;
        this.state.stats.silverEarned += chest.reward;
      }
    }
  }

  // =========================================================================
  // Private: Utility
  // =========================================================================

  private getWeaponStats(weapon: WeaponState) {
    const levelStats = WEAPON_STATS[weapon.type];
    if (!levelStats) return WEAPON_STATS['bone_bouncer'][0];
    // Evolved weapons use max level stats with multiplier
    const idx = Math.max(0, Math.min((weapon.evolved ? 7 : weapon.level - 1), levelStats.length - 1));
    const baseStats = levelStats[idx];

    if (weapon.evolved) {
      const evolution = WEAPON_EVOLUTIONS.find(e => e.baseWeapon === weapon.type);
      if (evolution) {
        return {
          ...baseStats,
          damage: Math.round(baseStats.damage * evolution.damageMultiplier),
          projectileCount: baseStats.projectileCount + 1,
        };
      }
    }

    return baseStats;
  }

  private findNearestEnemy(x: number, z: number, maxRange?: number): EnemyState | null {
    let nearest: EnemyState | null = null;
    let nearestDist = maxRange ?? Infinity;

    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      const dist = distanceBetween(x, z, enemy.x, enemy.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private findNearestEnemyExcluding(x: number, z: number, excludeIds: number[]): EnemyState | null {
    let nearest: EnemyState | null = null;
    let nearestDist = 20;

    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      if (excludeIds.includes(enemy.id)) continue;
      const dist = distanceBetween(x, z, enemy.x, enemy.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private findEnemyById(id: number): EnemyState | null {
    for (let i = 0; i < this.state.enemies.length; i++) {
      if (this.state.enemies[i].id === id) return this.state.enemies[i];
    }
    return null;
  }

  private addDamageEvent(x: number, y: number, z: number, damage: number, isCrit: boolean, isPlayerDamage: boolean, weaponType?: WeaponType): void {
    this.state.damageEvents.push({ x, y, z, damage, isCrit, isPlayerDamage, weaponType });
  }
}
