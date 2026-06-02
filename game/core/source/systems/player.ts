/**
 * 玩家系统 —— 初始化、移动、dash、计时器、升级判定。
 *
 * - createInitialPlayer: 用 charCfg + shopBonuses 构造起手 PlayerState（startingWeapon 装好）
 * - tickPlayerMovement:  bunny hop / 跳 / 重力 / slide / 加速度 / 朝向 / 边界 clamp
 * - tickDash:            dash 短无敌 + DASH_DURATION 内沿 facing 高速移动
 * - tickTimers:          dashCooldown / invincible / combo 倒计时 + enemy / boss hitFlash + attackCooldown
 * - tickLevelUp:         扫多级（一次 collect 可能跨多级）, 满则进入 'level_up' phase + 生成 upgrade options
 *
 * MegaBonk 移动特性: bunny hop (落地后 0.3s 内再跳获 1.4× 高度), slide 加速, 严格地形高度。
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
  BUNNY_HOP_WINDOW,
  BUNNY_HOP_BONUS,
  MAX_WEAPONS_CAP,
} from '../config.ts';
import { loadSave } from '../save.ts';
import { getShopBonuses } from '../shop.ts';
import { generateUpgradeOptions, xpForLevel } from '../upgrades.ts';
import { getTerrainHeight } from './terrain.ts';
import type { GameConfig, PlayerState } from '../types.ts';
import type { Engine } from './types.ts';

export function createInitialPlayer(config: GameConfig): PlayerState {
  const charCfg = CHARACTER_CONFIGS[config.character];
  const save = loadSave();
  const shopBonuses = getShopBonuses();
  const extraSlots = save.extraWeaponSlots;
  const startLevel = 1 + (shopBonuses['startLevel'] ?? 0);

  return {
    x: 0, y: 0, z: 0, rotation: 0,
    velocityY: 0, isGrounded: true, isJumping: false,
    isSliding: false, slideTimer: 0, slideSpeedBoost: 0, bunnyHopTimer: 0,
    hp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
    maxHp: charCfg.hp + (shopBonuses['maxHp'] ?? 0),
    level: startLevel,
    xp: 0,
    xpToNext: xpForLevel(startLevel),
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
    dashCooldown: 0, dashCooldownMax: DASH_COOLDOWN, dashTimer: 0, invincibleTimer: 0,
    alive: true, character: config.character,
    maxWeaponSlots: Math.min(MAX_WEAPONS_CAP, charCfg.weaponSlots + extraSlots),
    comboCount: 0, comboTimer: 0,
  };
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

  // Jump (edge detect)
  const jumpPressed = engine.input.jump && !engine.lastJumpInput;
  engine.lastJumpInput = engine.input.jump;

  if (jumpPressed && player.isGrounded && !player.isSliding) {
    const isBunnyHop = player.bunnyHopTimer > 0;
    const jumpMultiplier = isBunnyHop ? BUNNY_HOP_BONUS : 1.0;
    player.velocityY = JUMP_FORCE * jumpMultiplier;
    player.isGrounded = false;
    player.isJumping = true;
    player.bunnyHopTimer = 0;
  }

  // Gravity
  if (!player.isGrounded) {
    player.velocityY -= GRAVITY * dt;
    player.y += player.velocityY * dt;

    const groundHeight = getTerrainHeight(player.x, player.z);
    if (player.y <= groundHeight) {
      player.y = groundHeight;
      player.velocityY = 0;
      player.isGrounded = true;
      player.isJumping = false;
      player.bunnyHopTimer = BUNNY_HOP_WINDOW;

      if (engine.input.slide && !player.isSliding) {
        player.isSliding = true;
        player.slideTimer = SLIDE_DURATION;
        player.slideSpeedBoost = SLIDE_SPEED_MULTIPLIER;
      }
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

  // 水平移动 (加速度)
  const speedMultiplier = player.isSliding ? player.slideSpeedBoost : 1.0;
  const targetSpeed = player.speed * speedMultiplier;
  const isMoving = moveX !== 0 || moveZ !== 0;

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
      player.x = result.x;
      player.z = result.z;
    }
  }
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
      player.x = result.x;
      player.z = result.z;
    }
  }
}

export function tickTimers(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  if (player.invincibleTimer > 0) player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);

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

/**
 * 检测升级 —— 一次可跨多级。满级时跳过。每升一级：
 *   - xp 扣减 / level++ / xpToNext 重算
 *   - 治疗 10% maxHp
 *   - 5 / 10 / 20 / 30 级解锁武器槽
 *   - 第一次 generateUpgradeOptions 命中 → 进入 level_up phase, return (后续升级延后处理)
 */
export function tickLevelUp(engine: Engine): void {
  const player = engine.state.player;
  if (!player.alive || engine.state.phase === 'level_up') return;
  if (player.level >= 40) return;

  while (player.xp >= player.xpToNext && player.level < 40) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = xpForLevel(player.level);
    player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.1));

    if (player.level === 5 && player.maxWeaponSlots < 3) player.maxWeaponSlots = 3;
    if (player.level === 10 && player.maxWeaponSlots < 4) player.maxWeaponSlots = 4;
    if (player.level === 20 && player.maxWeaponSlots < 5) player.maxWeaponSlots = 5;
    if (player.level === 30 && player.maxWeaponSlots < MAX_WEAPONS_CAP) player.maxWeaponSlots = MAX_WEAPONS_CAP;

    const options = generateUpgradeOptions(player, 3);
    if (options.length > 0) {
      engine.state.upgradeOptions = options;
      engine.state.phase = 'level_up';
      return;
    }
  }
}
