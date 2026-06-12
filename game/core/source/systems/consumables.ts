/**
 * 消耗品系统 —— 掉落、拾取、timed buff 计时、一次性效果钩子。
 *
 * 同时仅 1 个生效槽（新拾取覆盖旧效果与持续时间）。
 * 拾取即用：instant / one_shot 立即生效；timed 进入 activeConsumable 倒计时。
 */
import { distanceBetween, normalizeDirection } from '../physics.ts';
import {
  PICKUP_ATTRACT_SPEED,
  PICKUP_LIFETIME,
  PLAYER_INVINCIBLE_DURATION,
} from '../config.ts';
import { CONSUMABLES, rollConsumableForEnemy, rollMiniBossBonusConsumable } from '../data/consumables.ts';
import { getTomePower } from '../tomeProgression.ts';
import { applyCharacterTrait } from '../stats/applyCharacterTrait.ts';
import { addDamageEvent, checkPlayerDeath } from './helpers.ts';
import { onPlayerHitBonds } from './bonds.ts';
import type { ConsumableId, ConsumablePickupState, EnemyState } from '../types.ts';
import type { Engine } from './types.ts';

const XP_PICKUP_TYPES = new Set(['xp_green', 'xp_blue', 'xp_purple', 'xp_orange']);
const CONSUMABLE_ATTRACT_RADIUS = 0.65;
const CONSUMABLE_COLLECT_RADIUS = 0.32;
const CONSUMABLE_SURFACE_OFFSET_Y = 0.35;

export function spawnConsumablesFromEnemy(engine: Engine, enemy: EnemyState): void {
  const player = engine.state.player;
  const dropMult = player.consumableDropMult ?? 1;
  const dropY = enemy.y + CONSUMABLE_SURFACE_OFFSET_Y;

  const primary = rollConsumableForEnemy(enemy.isElite, enemy.isMiniBoss, dropMult);
  if (primary) {
    pushConsumablePickup(engine, primary, enemy.x, dropY, enemy.z);
  }

  if (enemy.isMiniBoss) {
    const bonus = rollMiniBossBonusConsumable(dropMult);
    if (bonus) {
      pushConsumablePickup(
        engine,
        bonus,
        enemy.x + (Math.random() - 0.5) * 0.8,
        dropY,
        enemy.z + (Math.random() - 0.5) * 0.8,
      );
    }
  }
}

function pushConsumablePickup(
  engine: Engine,
  consumableId: ConsumableId,
  x: number,
  y: number,
  z: number,
): void {
  engine.state.consumablePickups.push({
    id: engine.nextPickupId++,
    consumableId,
    x,
    y,
    z,
    lifetime: PICKUP_LIFETIME,
    attracted: false,
  });
}

export function tickConsumablePickups(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  const pickups = engine.state.consumablePickups;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.lifetime -= dt;
    if (pickup.lifetime <= 0) {
      pickups.splice(i, 1);
      continue;
    }

    const dist = distanceBetween(player.x, player.z, pickup.x, pickup.z);
    if (dist < CONSUMABLE_COLLECT_RADIUS) {
      applyConsumable(engine, pickup.consumableId);
      pickups.splice(i, 1);
      continue;
    }

    // Consumables intentionally ignore pickupRadius / magnet bonuses; they only
    // nudge toward the player when almost touched.
    pickup.attracted = dist < CONSUMABLE_ATTRACT_RADIUS;
    if (pickup.attracted) {
      const maxDist = CONSUMABLE_ATTRACT_RADIUS;
      const t = Math.max(0, 1 - dist / maxDist);
      const attractSpeed = PICKUP_ATTRACT_SPEED * (0.3 + t * t * 2.0);
      const dir = normalizeDirection(player.x - pickup.x, player.z - pickup.z);
      pickup.x += dir.x * attractSpeed * dt;
      pickup.z += dir.z * attractSpeed * dt;
      pickup.y += ((player.y ?? 0) + CONSUMABLE_SURFACE_OFFSET_Y - pickup.y) * Math.min(1, dt * 8);

      const newDist = distanceBetween(player.x, player.z, pickup.x, pickup.z);
      if (newDist < CONSUMABLE_COLLECT_RADIUS) {
        applyConsumable(engine, pickup.consumableId);
        pickups.splice(i, 1);
      }
    }
  }
}

/** 新拾取覆盖旧槽位与所有消耗品派生 buff。 */
export function clearConsumableEffects(player: Engine['state']['player']): void {
  player.activeConsumable = null;
  player.nextHitNullify = false;
  player.nextLevelUpReroll = false;
  player.nextWeaponUpgradeBonus = 0;
  player.xpPickupRadiusMult = 1;
  player.consumableSpeedMult = 1;
  player.consumableAttackSpeedMult = 1;
  player.consumableArmorBonus = 0;
  player.consumableDamageMult = 1;
  player.consumableDamageTakenMult = 1;
  applyCharacterTrait(player, player.character);
}

export function applyConsumable(engine: Engine, consumableId: ConsumableId): void {
  const player = engine.state.player;
  const def = CONSUMABLES[consumableId];
  if (!def) return;

  clearConsumableEffects(player);

  switch (consumableId) {
    case 'wild_berry':
      player.hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.15));
      return;

    case 'hard_bread':
      player.nextHitNullify = true;
      player.activeConsumable = { id: consumableId, remaining: -1 };
      return;

    case 'prophecy_book':
      player.nextLevelUpReroll = true;
      player.activeConsumable = { id: consumableId, remaining: -1 };
      return;

    case 'craftsman_hammer':
      player.nextWeaponUpgradeBonus = 1;
      player.activeConsumable = { id: consumableId, remaining: -1 };
      return;

    case 'hot_soup':
    case 'mint_candy':
    case 'energy_bar':
    case 'magnet':
    case 'iron_meal':
    case 'rage_potion':
      applyTimedConsumable(player, consumableId, def.duration ?? 0);
      return;
  }
}

function applyTimedConsumable(
  player: Engine['state']['player'],
  consumableId: ConsumableId,
  duration: number,
): void {
  player.activeConsumable = { id: consumableId, remaining: duration };

  switch (consumableId) {
    case 'mint_candy':
      player.consumableSpeedMult = 1.15;
      break;
    case 'energy_bar':
      player.consumableAttackSpeedMult = 1.20;
      break;
    case 'magnet':
      player.xpPickupRadiusMult = 2.0;
      break;
    case 'iron_meal':
      player.consumableArmorBonus = 4;
      break;
    case 'rage_potion':
      player.consumableDamageMult = 1.18;
      player.consumableDamageTakenMult = 1.10;
      break;
    case 'hot_soup':
      break;
  }

  applyCharacterTrait(player, player.character);
}

export function tickConsumableEffects(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  const active = player.activeConsumable;
  if (active && active.remaining > 0) {
    if (active.id === 'hot_soup' && player.hp < player.maxHp) {
      const heal = player.maxHp * 0.02 * dt;
      player.hp = Math.min(player.maxHp, player.hp + heal);
    }

    active.remaining -= dt;
    if (active.remaining <= 0) {
      clearConsumableEffects(player);
    }
  }
}

/** 计算玩家受击最终伤害（含护甲 / shield_tome / 狂怒药受伤加成）。 */
export function computePlayerHitDamage(engine: Engine, raw: number): number {
  const player = engine.state.player;
  const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
  const shieldReduction = getTomePower(shieldTome) * 0.05;
  const takenMult = player.consumableDamageTakenMult ?? 1;
  const scaledRaw = Math.round(raw * takenMult);
  const afterArmor = Math.max(1, scaledRaw - player.armor - (player.consumableArmorBonus ?? 0));
  return Math.max(1, Math.round(afterArmor * (1 - shieldReduction)));
}

/**
 * 对玩家造成伤害；返回实际扣血量。F04 完全格挡时返回 0。
 * 调用方负责设置 invincibleTimer（本函数在格挡时也会设置）。
 */
export function applyPlayerHit(engine: Engine, rawDamage: number): number {
  const player = engine.state.player;
  if (!player.alive || player.invincibleTimer > 0) return 0;

  if (player.nextHitNullify) {
    player.nextHitNullify = false;
    player.activeConsumable = null;
    player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
    addDamageEvent(engine, player.x, 1.5, player.z, 0, false, true);
    return 0;
  }

  const damage = computePlayerHitDamage(engine, rawDamage);
  const { hpDamage, absorbed } = applyShieldAbsorb(player, damage);
  player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
  engine.state.stats.damageTaken += hpDamage + absorbed;
  engine.state.stats.shieldAbsorbed += absorbed;
  // 铁血反击：受击（含护盾吸收）即触发。
  onPlayerHitBonds(engine);
  if (hpDamage > 0) {
    addDamageEvent(engine, player.x, 1.5, player.z, hpDamage, false, true);
  }
  if (absorbed > 0) {
    addDamageEvent(engine, player.x, 1.7, player.z, absorbed, false, true, undefined, true);
  }
  if (player.hp <= 0) checkPlayerDeath(engine);
  return hpDamage;
}

function applyShieldAbsorb(player: Engine['state']['player'], damage: number): { hpDamage: number; absorbed: number } {
  const shield = player.shield ?? 0;
  if (shield <= 0) {
    player.hp -= damage;
    return { hpDamage: damage, absorbed: 0 };
  }

  const absorbed = Math.min(shield, damage);
  player.shield = shield - absorbed;
  const hpDamage = damage - absorbed;
  if (hpDamage > 0) player.hp -= hpDamage;
  return { hpDamage, absorbed };
}

/** XP 宝石拾取半径（磁铁仅扩大 XP 类拾取）。 */
export function getXpPickupRadius(player: Engine['state']['player']): number {
  return player.pickupRadius * (player.xpPickupRadiusMult ?? 1);
}

export function isXpPickupType(type: string): boolean {
  return XP_PICKUP_TYPES.has(type);
}

export function makeConsumablePickup(
  overrides: Partial<ConsumablePickupState> = {},
): ConsumablePickupState {
  return {
    id: 1,
    consumableId: 'wild_berry',
    x: 0,
    y: 0.35,
    z: 0,
    lifetime: PICKUP_LIFETIME,
    attracted: false,
    ...overrides,
  };
}
