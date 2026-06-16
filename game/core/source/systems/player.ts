/**
 * 玩家系统 —— 初始化、移动、dash、计时器、升级判定。
 *
 * - createInitialPlayer: 用 charCfg + shopBonuses 构造起手 PlayerState（startingWeapon 装好）
 * - tickPlayerMovement:  bunny hop / 跳 / 重力 / slide 状态 / 加速度 / 朝向 / 边界 clamp
 * - tickDash:            dash 短无敌 + DASH_DURATION 内沿 facing 高速移动
 * - tickTimers:          dashCooldown / invincible / combo 倒计时 + enemy / boss hitFlash + attackCooldown
 * - tickLevelUp:         扫多级（一次 collect 可能跨多级）, 满则进入 'level_up' phase + 生成 upgrade options
 *
 * MegaBonk 移动特性: bunny hop (落地后 0.3s 内再跳获 1.4× 高度), 严格地形高度。
 */
import { applyMovement3D, normalizeDirection } from '../physics.ts';
import {
  CHARACTER_CONFIGS,
  PLAYER_BASE_CRIT_DAMAGE,
  PLAYER_PICKUP_RADIUS,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_DISTANCE,
  JUMP_FORCE,
  GRAVITY,
  SLIDE_DURATION,
  SLIDE_SPEED_MULTIPLIER,
  PLAYER_MOVE_SPEED_MULTIPLIER,
  BUNNY_HOP_WINDOW,
  BUNNY_HOP_BONUS,
  MAX_LEVEL,
  ACTIVE_WEAPON_SLOTS_INRUN_MAX,
  STEP_HEIGHT,
  FALL_RESPAWN_Y,
  CLIMB_SPEED,
  SHIELD_REGEN_RATE,
  SHIELD_REGEN_DELAY,
} from '../config.ts';
import { loadSave } from '../save.ts';
import { getShopBonuses } from '../shop.ts';
import { computeActiveWeaponSlots, generateUpgradeOptions, xpForLevel } from '../upgrades.ts';
import { emptyWeaponGrowth } from './weapons.ts';
import { applyCharacterTrait } from '../stats/applyCharacterTrait.ts';
import {
  getTerrainHeightAt,
  getSupportHeightAt,
  findClimbAt,
} from './collision.ts';
import { addDamageEvent, checkPlayerDeath } from './helpers.ts';
import { tryMoveHorizontally } from './horizontalMove.ts';
import type { GameConfig, PlayerState } from '../types.ts';
import type { Engine } from './types.ts';

/** 出生点 / 跌落复活点（模块级；GameInstance 开局通过 setPlayerSpawn 注入）。 */
let spawnX = 0;
let spawnY = 0;
let spawnZ = 0;

/** 蹬墙跳离后短暂禁止自动再抓墙（秒），确保能离开 climb 范围再下落。 */
let climbReleaseTimer = 0;

const SAFE_FALL_HEIGHT = 5;
const FALL_DAMAGE_START_PCT = 0.10;
const FALL_DAMAGE_MAX_PCT = 0.50;
const FALL_DAMAGE_PCT_PER_HEIGHT = 0.02;

/** 设置玩家出生点（同时作为掉出虚空后的复活点）。 */
export function setPlayerSpawn(x: number, y: number, z: number): void {
  spawnX = x;
  spawnY = y;
  spawnZ = z;
}

export function createInitialPlayer(config: GameConfig): PlayerState {
  const charCfg = CHARACTER_CONFIGS[config.character];
  const save = loadSave();
  const shopBonuses = getShopBonuses();
  const hasExtraSlot = save.extraWeaponSlots >= 1;
  const startLevel = 1 + (shopBonuses['startLevel'] ?? 0);
  const maxWeaponSlots = ACTIVE_WEAPON_SLOTS_INRUN_MAX + (hasExtraSlot ? 1 : 0);

  const player: PlayerState = {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, fallPeakY: undefined, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
    maxHp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
    consumableDropMult: 1,
    activeConsumable: null,
    nextHitNullify: false,
    nextLevelUpReroll: false,
    nextWeaponUpgradeBonus: 0,
    xpPickupRadiusMult: 1,
    consumableSpeedMult: 1,
    consumableAttackSpeedMult: 1,
    consumableArmorBonus: 0,
    consumableDamageMult: 1,
    consumableDamageTakenMult: 1,
    level: startLevel,
    xp: 0,
    xpToNext: xpForLevel(startLevel),
    speed: (charCfg.speed + (shopBonuses['speed'] ?? 0)) * PLAYER_MOVE_SPEED_MULTIPLIER,
    currentSpeed: 0,
    damageMultiplier: charCfg.damage + (shopBonuses['damage'] ?? 0),
    attackSpeedMultiplier: 1.0,
    critChance: charCfg.critChance + (shopBonuses['critChance'] ?? 0),
    critDamage: PLAYER_BASE_CRIT_DAMAGE,
    armor: charCfg.armor + (shopBonuses['armor'] ?? 0),
    pickupRadius: PLAYER_PICKUP_RADIUS + (shopBonuses['pickupRadius'] ?? 0),
    weapons: [{ type: charCfg.startingWeapon, level: 1, cooldownTimer: 0, growth: emptyWeaponGrowth() }],
    tomes: [],
    passives: [],
    dashCooldown: 0, dashCooldownMax: DASH_COOLDOWN, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: config.character,
    maxWeaponSlots,
    activeWeaponSlots: computeActiveWeaponSlots(startLevel, maxWeaponSlots),
    gold: 0,
    relicStacks: {},
    bonds: [],
    bondDamageMods: [],
    comboCount: 0, comboTimer: 0,
    // Shrine bonuses (默认值；charge shrine 奖励会累计到这些字段上)
    shield: 0,
    maxShield: 0,
    shieldRegenAccum: 0,
    hpRegenRate: 0,
    hpRegenAccum: 0,
    projectileBonus: 0,
    knockbackMult: 1,
    eliteDamageMult: 1,
    lifestealPct: 0,
    jumpHeightMult: 1,
    durationMult: 1,
    powerupMult: 1,
    difficultyMult: 1,
    luckBonus: 0,
    shrineBonuses: { damageMult: 1, attackSpeedMult: 1, speedMult: 1, pickupRadiusMult: 1, critDamageAdd: 0 },
  };

  applyCharacterTrait(player, config.character);
  return player;
}

export function tickPlayerMovement(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;
  if (player.dashTimer > 0) return;

  const moveX = engine.input.moveX;
  const moveZ = engine.input.moveY;

  // 朝向
  if (moveX !== 0 || moveZ !== 0) {
    engine.facingX = moveX;
    engine.facingZ = moveZ;
    player.rotation = Math.atan2(moveX, moveZ);
  }

  // Bunny hop window 倒计时
  if (player.bunnyHopTimer > 0) player.bunnyHopTimer -= dt;
  if (climbReleaseTimer > 0) climbReleaseTimer -= dt;

  // Jump (edge detect)
  const jumpPressed = engine.input.jump && !engine.lastJumpInput;
  engine.lastJumpInput = engine.input.jump;
  const isMoving = moveX !== 0 || moveZ !== 0;

  // ===== 攀爬 climb_ =====
  if (player.isClimbing) {
    const c = findClimbAt(engine.geo, player.x, player.z, player.y);
    if (!c) {
      // 离开攀爬体 → 松手下落
      player.isClimbing = false;
      player.isGrounded = false;
      player.fallPeakY = player.y;
    } else if (jumpPressed) {
      // 爬一半跳下：蹬墙跳开。给离墙水平初速 + 短暂禁止再抓，确保跳+方向能离开 climb 范围下落。
      player.isClimbing = false;
      player.isGrounded = false;
      player.isJumping = true;
      player.velocityY = JUMP_FORCE * 0.8 * (player.jumpHeightMult ?? 1);
      player.fallPeakY = player.y;
      climbReleaseTimer = 0.5;
      if (isMoving) player.currentSpeed = player.speed; // 朝输入方向蹬离墙面
    } else {
      // 贴墙竖直移动：有移动输入=上爬，按 slide=下爬，否则悬停
      const vdir = isMoving ? 1 : engine.input.slide ? -1 : 0;
      player.y += CLIMB_SPEED * vdir * dt;
      player.velocityY = 0;
      // 锁定在攀爬体表面（防止飘出 footprint）
      player.x = clamp(player.x, c.cx - c.halfW, c.cx + c.halfW);
      player.z = clamp(player.z, c.cz - c.halfD, c.cz + c.halfD);

      if (player.y >= c.topY) {
        // 爬到顶 → 翻上平台
        player.isClimbing = false;
        player.isGrounded = true;
        player.isJumping = false;
        player.y = c.topY;
        player.fallPeakY = undefined;
        // 朝当前朝向往里挪一点，落到平台面上
        player.x += engine.facingX * 0.9;
        player.z += engine.facingZ * 0.9;
        const top = getSupportHeightAt(engine.geo, player.x, player.z, player.y);
        if (Number.isFinite(top)) player.y = top;
      } else if (player.y < c.bottomY) {
        player.y = c.bottomY;
      }
    }
    // 仍在攀爬：跳过常规重力 / 水平移动
    if (player.isClimbing) return;
  } else {
    // 攀爬进入：跳向攀爬体（地面按跳），或下落中贴上攀爬体（仅下落阶段，避免蹬墙跳后立刻又抓住）
    const c = findClimbAt(engine.geo, player.x, player.z, player.y);
    const wantGrab =
      climbReleaseTimer <= 0 &&
      (jumpPressed || (!player.isGrounded && player.velocityY <= 0));
    if (c && player.y < c.topY - 0.1 && wantGrab) {
      player.isClimbing = true;
      player.isJumping = false;
      player.velocityY = 0;
      player.fallPeakY = undefined;
      player.isSliding = false;
      player.slideSpeedBoost = 0;
      player.x = clamp(player.x, c.cx - c.halfW, c.cx + c.halfW);
      player.z = clamp(player.z, c.cz - c.halfD, c.cz + c.halfD);
      return; // 本帧进入攀爬，跳过普通跳跃 / 重力
    }
  }

  if (jumpPressed && player.isGrounded && !player.isSliding) {
    const isBunnyHop = player.bunnyHopTimer > 0;
    const jumpMultiplier = isBunnyHop ? BUNNY_HOP_BONUS : 1.0;
    player.velocityY = JUMP_FORCE * jumpMultiplier * (player.jumpHeightMult ?? 1);
    player.isGrounded = false;
    player.isJumping = true;
    player.fallPeakY = player.y;
    player.bunnyHopTimer = 0;
  }

  // Gravity
  if (!player.isGrounded) {
    player.velocityY -= GRAVITY * dt;
    player.y += player.velocityY * dt;
    player.fallPeakY = Math.max(player.fallPeakY ?? player.y, player.y);

    // 支撑面：只认脚够得着的面，下落阶段才着地。
    const support = getSupportHeightAt(engine.geo, player.x, player.z, player.y);
    if (player.velocityY <= 0 && Number.isFinite(support) && player.y <= support) {
      applyFallDamage(engine, (player.fallPeakY ?? player.y) - support);
      player.y = support;
      player.velocityY = 0;
      player.isGrounded = true;
      player.isJumping = false;
      player.fallPeakY = undefined;
      player.bunnyHopTimer = BUNNY_HOP_WINDOW;

      if (engine.input.slide && !player.isSliding) {
        player.isSliding = true;
        player.slideTimer = SLIDE_DURATION;
        player.slideSpeedBoost = SLIDE_SPEED_MULTIPLIER;
      }
    } else if (player.y < FALL_RESPAWN_Y) {
      // 掉出关卡虚空 → 传送回出生点。
      applyFallDamage(engine, (player.fallPeakY ?? spawnY) - player.y);
      player.x = spawnX;
      player.z = spawnZ;
      player.y = spawnY;
      player.velocityY = 0;
      player.isGrounded = true;
      player.isJumping = false;
      player.fallPeakY = undefined;
    }
  }

  // Slide
  if (engine.input.slide && player.isGrounded && !player.isSliding && !player.isJumping) {
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

  // 水平移动 (加速度)。默认速度已经吸收了旧 slide 加速倍率；slide 不再额外提速。
  const targetSpeed = player.speed * (player.consumableSpeedMult ?? 1);

  if (isMoving) {
    player.currentSpeed += (targetSpeed - player.currentSpeed) * Math.min(1, 12.0 * dt);
  } else {
    player.currentSpeed += (0 - player.currentSpeed) * Math.min(1, 16.0 * dt);
  }

  if (player.currentSpeed > 0.01 && (isMoving || player.currentSpeed > 0.1)) {
    const result = applyMovement3D(
      player.x, player.z,
      isMoving ? moveX : engine.facingX,
      isMoving ? moveZ : engine.facingZ,
      player.currentSpeed, dt,
      engine.config.mapSize,
    );
    if (result) {
      // 横向阻挡：col_/wall_ 侧面挡人；climb_ 平时挡（蹬墙释放窗口内不挡，便于跳离）。
      const includeClimb = climbReleaseTimer <= 0;
      const moved = tryMoveHorizontally(
        engine.geo,
        player.x, player.z,
        result.x, result.z,
        player.y,
        { includeClimb },
      );
      player.x = moved.x;
      player.z = moved.z;

      // 地面跟随支撑面：迈步上 / 小台阶下贴地；无支撑或高崖则进入下落（修 O3）。
      if (player.isGrounded) {
        const support = getSupportHeightAt(engine.geo, player.x, player.z, player.y);
        if (Number.isFinite(support) && support - player.y >= -STEP_HEIGHT) {
          player.y = support;
        } else {
          player.isGrounded = false;
          player.velocityY = 0;
          player.fallPeakY = player.y;
        }
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function applyFallDamage(engine: Engine, fallDistance: number): void {
  if (fallDistance <= SAFE_FALL_HEIGHT) return;
  const player = engine.state.player;
  if (!player.alive) return;
  const pct = Math.min(
    FALL_DAMAGE_MAX_PCT,
    FALL_DAMAGE_START_PCT + (fallDistance - SAFE_FALL_HEIGHT) * FALL_DAMAGE_PCT_PER_HEIGHT,
  );
  const damage = Math.max(1, Math.round(player.maxHp * pct));
  player.hp -= damage;
  player.shieldRegenAccum = -SHIELD_REGEN_DELAY;
  engine.state.stats.damageTaken += damage;
  addDamageEvent(engine, player.x, player.y + 1.5, player.z, damage, false, true);
  checkPlayerDeath(engine);
}

export function tickDash(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  const dashPressed = engine.input.dash && !engine.lastDashInput;
  engine.lastDashInput = engine.input.dash;

  if (dashPressed && player.dashCooldown <= 0 && player.dashTimer <= 0) {
    player.dashTimer = DASH_DURATION;
    player.dashCooldown = DASH_COOLDOWN;
    player.invincibleTimer = DASH_DURATION;
  }

  if (player.dashTimer > 0) {
    player.dashTimer -= dt;
    const dashSpeed = DASH_DISTANCE / DASH_DURATION;
    const dir = normalizeDirection(engine.facingX, engine.facingZ);
    const result = applyMovement3D(
      player.x, player.z,
      dir.x, dir.z,
      dashSpeed, dt,
      engine.config.mapSize,
    );
    if (result) {
      // dash 也要走横向碰撞：被 col_/wall_/climb_ 挡住时沿墙滑/停下，
      // 而不是直接改坐标穿进实体里（旧逻辑会把玩家塞进墙体造成偶现嵌入）。
      const moved = tryMoveHorizontally(
        engine.geo,
        player.x, player.z,
        result.x, result.z,
        player.y,
      );
      player.x = moved.x;
      player.z = moved.z;
    }
  }
}

export function tickTimers(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  if (player.invincibleTimer > 0) player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);

  const hpRegenRate = player.hpRegenRate ?? 0;
  if (hpRegenRate > 0 && player.hp < player.maxHp) {
    player.hpRegenAccum = (player.hpRegenAccum ?? 0) + hpRegenRate * dt;
    const heal = Math.floor(player.hpRegenAccum);
    if (heal > 0) {
      player.hp = Math.min(player.maxHp, player.hp + heal);
      player.hpRegenAccum -= heal;
    }
  }

  const maxShield = player.maxShield ?? 0;
  if (maxShield > 0 && (player.shield ?? 0) < maxShield) {
    player.shieldRegenAccum = (player.shieldRegenAccum ?? 0) + dt;
    if (player.shieldRegenAccum >= 0) {
      const restored = SHIELD_REGEN_RATE * dt;
      player.shield = Math.min(maxShield, (player.shield ?? 0) + restored);
    }
  } else if (maxShield > 0) {
    player.shieldRegenAccum = 0;
  }

  if (player.comboTimer > 0) {
    player.comboTimer -= dt;
    if (player.comboTimer <= 0) {
      player.comboCount = 0;
      player.comboTimer = 0;
    }
  }

  for (const enemy of engine.state.enemies) {
    if (enemy.hitFlashTimer > 0) enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
    if (enemy.attackCooldown > 0) enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
  }

  if (engine.state.boss && engine.state.boss.hitFlashTimer > 0) {
    engine.state.boss.hitFlashTimer = Math.max(0, engine.state.boss.hitFlashTimer - dt);
  }
}

/** 升级选项池为空时 roll 金币或银币（50/50，数量随 level 缩放）。 */
function rollEmptyPoolCompensation(engine: Engine, level: number): void {
  const player = engine.state.player;
  const scale = 1 + level * 0.08;
  const isGold = Math.random() < 0.5;
  const amount = isGold
    ? Math.round(8 * scale + Math.floor(Math.random() * 13))
    : Math.round(15 * scale + Math.floor(Math.random() * 26));

  if (isGold) {
    player.gold += amount;
  } else {
    engine.state.stats.silverEarned += amount;
  }

  engine.state.levelUpCompensationEvents.push({
    x: player.x,
    y: player.y,
    z: player.z,
    level,
    kind: isGold ? 'gold' : 'silver',
    amount,
  });
}

/**
 * 检测升级 —— 一次可跨多级。满级时跳过。每升一级：
 *   - xp 扣减 / level++ / xpToNext 重算 / activeWeaponSlots 重算
 *   - 无自动治疗或 maxHp 增长
 *   - 有升级选项 → 进入 level_up phase；无选项 → roll 金币/银币补偿
 */
export function tickLevelUp(engine: Engine): void {
  const player = engine.state.player;
  if (!player.alive || engine.state.phase === 'level_up') return;
  if (player.level >= MAX_LEVEL) return;

  while (player.xp >= player.xpToNext && player.level < MAX_LEVEL) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = xpForLevel(player.level);
    player.activeWeaponSlots = computeActiveWeaponSlots(player.level, player.maxWeaponSlots);

    const useProphecy = player.nextLevelUpReroll === true;
    if (useProphecy) {
      player.nextLevelUpReroll = false;
      if (player.activeConsumable?.id === 'prophecy_book') {
        player.activeConsumable = null;
      }
    }
    const options = generateUpgradeOptions(player, 3, useProphecy ? { prophecy: true } : undefined);
    if (options.length > 0) {
      engine.state.upgradeOptions = options;
      engine.state.phase = 'level_up';
      return;
    }
    rollEmptyPoolCompensation(engine, player.level);
  }
}
