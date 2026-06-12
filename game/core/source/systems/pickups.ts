/**
 * 拾取系统 + 敌人死亡 + 反伤。
 *
 * - processDeaths: 扫 enemies, hp ≤ 0 的 → spawn XP/掉落 + gold mote → kill++ → combo++ → splice
 * - tickPickups:    寿命衰减 + 拾取半径吸附 + 距离 < 0.5 时 collect；gold mote 自动飞向玩家到账
 * - tickThorns:     扫附近 enemies，thorns_tome 等级 × 3 反伤
 *
 * 拾取类型：xp_orange/purple/blue/green / silver / health / health_small.
 * Curse_tome 给 XP 增益，luck_tome 加 silver bonus，xp_gain_tome / shop xpGain
 * / combo / tier 共同决定最终 XP value。
 */
import { distanceBetween, normalizeDirection } from '../physics.ts';
import {
  MAX_PICKUPS,
  XP_VALUES,
  PICKUP_LIFETIME,
  PICKUP_ATTRACT_SPEED,
  HEALTH_DROP_CHANCE,
  HEALTH_SMALL_DROP_CHANCE,
  TIER_CONFIGS,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';
import { getShopBonuses } from '../shop.ts';
import { getTomePower } from '../tomeProgression.ts';
import { applyRelicKillEffects, getRelicBonusGoldOnKill, rollGoldForEnemy } from './relics.ts';
import { getXpPickupRadius, isXpPickupType, spawnConsumablesFromEnemy } from './consumables.ts';
import type { EnemyState, PickupState, PickupType } from '../types.ts';
import type { Engine } from './types.ts';

const PICKUP_SURFACE_OFFSET_Y = 0.2;
const GOLD_MOTE_OFFSET_Y = 0.7;

export function processDeaths(engine: Engine): void {
  const enemies = engine.state.enemies;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) {
      spawnPickupFromEnemy(engine, enemy);
      spawnConsumablesFromEnemy(engine, enemy);
      applyRelicKillEffects(engine, enemy);
      spawnGoldMoteFromEnemy(engine, enemy);
      engine.state.stats.killCount++;
      engine.state.player.comboCount++;
      engine.state.player.comboTimer = 2.0;
      enemies.splice(i, 1);
    }
  }
}

function spawnPickupFromEnemy(engine: Engine, enemy: EnemyState): void {
  const cfg = ENEMIES[enemy.type];
  if (!cfg) return;
  const dropY = enemy.y + PICKUP_SURFACE_OFFSET_Y;

  let xpReward = cfg.xpReward;
  const curseTome = engine.state.player.tomes.find(t => t.type === 'curse_tome');
  if (curseTome) xpReward = Math.round(xpReward * (1 + getTomePower(curseTome) * 0.2));

  let pickupType: PickupType;
  if (xpReward >= 30) pickupType = 'xp_orange';
  else if (xpReward >= 10) pickupType = 'xp_purple';
  else if (xpReward >= 3) pickupType = 'xp_blue';
  else pickupType = 'xp_green';

  if (engine.state.pickups.length < MAX_PICKUPS) {
    engine.state.pickups.push({
      id: engine.nextPickupId++,
      type: pickupType,
      x: enemy.x, y: dropY, z: enemy.z,
      value: XP_VALUES[pickupType] ?? 1,
      lifetime: PICKUP_LIFETIME,
      attracted: false,
    });
  }

  // Elite 掉 silver
  if (enemy.isElite && engine.state.pickups.length < MAX_PICKUPS) {
    engine.state.pickups.push({
      id: engine.nextPickupId++,
      type: 'silver',
      x: enemy.x + (Math.random() - 0.5),
      y: dropY,
      z: enemy.z + (Math.random() - 0.5),
      value: 5,
      lifetime: PICKUP_LIFETIME,
      attracted: false,
    });
  }

  // 随机生命掉落
  if (engine.state.pickups.length < MAX_PICKUPS) {
    const roll = Math.random();
    if (roll < HEALTH_DROP_CHANCE) {
      engine.state.pickups.push({
        id: engine.nextPickupId++,
        type: 'health',
        x: enemy.x + (Math.random() - 0.5),
        y: dropY,
        z: enemy.z + (Math.random() - 0.5),
        value: 50, lifetime: PICKUP_LIFETIME, attracted: false,
      });
    } else if (roll < HEALTH_DROP_CHANCE + HEALTH_SMALL_DROP_CHANCE) {
      engine.state.pickups.push({
        id: engine.nextPickupId++,
        type: 'health_small',
        x: enemy.x + (Math.random() - 0.5),
        y: dropY,
        z: enemy.z + (Math.random() - 0.5),
        value: 25, lifetime: PICKUP_LIFETIME, attracted: false,
      });
    }
  }
}

function spawnGoldMoteFromEnemy(engine: Engine, enemy: EnemyState): void {
  const value = rollGoldForEnemy(engine, enemy) + getRelicBonusGoldOnKill(engine);
  if (value <= 0) return;
  engine.state.goldMotes.push({
    id: engine.nextPickupId++,
    x: enemy.x,
    y: enemy.y + GOLD_MOTE_OFFSET_Y,
    z: enemy.z,
    value,
    lifetime: 1.5,
  });
}

export function tickPickups(engine: Engine, dt: number): void {
  const player = engine.state.player;
  if (!player.alive) return;

  tickGoldMotes(engine, dt);

  const pickups = engine.state.pickups;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.lifetime -= dt;

    if (pickup.lifetime <= 0) {
      pickups.splice(i, 1);
      continue;
    }

    const dist = distanceBetween(player.x, player.z, pickup.x, pickup.z);
    const attractRadius = isXpPickupType(pickup.type)
      ? getXpPickupRadius(player)
      : player.pickupRadius;
    if (dist < attractRadius) {
      pickup.attracted = true;
    }

    if (pickup.attracted) {
      // 加速吸附：起步慢, 越靠近越快
      const maxDist = isXpPickupType(pickup.type)
        ? getXpPickupRadius(player)
        : player.pickupRadius;
      const t = Math.max(0, 1 - dist / maxDist);
      const attractSpeed = PICKUP_ATTRACT_SPEED * (0.3 + t * t * 2.0);

      const dir = normalizeDirection(player.x - pickup.x, player.z - pickup.z);
      pickup.x += dir.x * attractSpeed * dt;
      pickup.z += dir.z * attractSpeed * dt;
      pickup.y += ((player.y ?? 0) + PICKUP_SURFACE_OFFSET_Y - pickup.y) * Math.min(1, dt * 8);

      const newDist = distanceBetween(player.x, player.z, pickup.x, pickup.z);
      if (newDist < 0.5) {
        collectPickup(engine, pickup);
        pickups.splice(i, 1);
      }
    }
  }
}

function collectPickup(engine: Engine, pickup: PickupState): void {
  const player = engine.state.player;

  if (pickup.type === 'silver') {
    engine.state.stats.silverEarned += pickup.value;
    const luckTome = player.tomes.find(t => t.type === 'luck_tome');
    if (luckTome) engine.state.stats.silverEarned += Math.floor(getTomePower(luckTome));
    return;
  }

  if (pickup.type === 'health' || pickup.type === 'health_small') {
    player.hp = Math.min(player.maxHp, player.hp + pickup.value);
    return;
  }

  // XP pickup
  let xpValue = pickup.value;
  const xpGainTome = player.tomes.find(t => t.type === 'xp_gain_tome');
  if (xpGainTome) xpValue = Math.floor(xpValue * (1 + getTomePower(xpGainTome) * 0.15));

  const shopXpBonus = getShopBonuses()['xpGain'] ?? 0;
  if (shopXpBonus > 0) xpValue = Math.floor(xpValue * (1 + shopXpBonus));

  const traitXpBonus = player.characterTraitXpBonus ?? 0;
  if (traitXpBonus > 0) xpValue = Math.floor(xpValue * (1 + traitXpBonus));

  // Combo: 1 + min(comboCount * 0.05, 1.0) → max 2x
  const comboMultiplier = 1 + Math.min(player.comboCount * 0.05, 1.0);
  xpValue = Math.floor(xpValue * comboMultiplier);

  // Tier multiplier
  xpValue = Math.floor(xpValue * TIER_CONFIGS[engine.config.tier].xpMultiplier);
  player.xp += xpValue;
}

function tickGoldMotes(engine: Engine, dt: number): void {
  const player = engine.state.player;
  const motes = engine.state.goldMotes;
  for (let i = motes.length - 1; i >= 0; i--) {
    const mote = motes[i];
    mote.lifetime -= dt;
    const dist = distanceBetween(player.x, player.z, mote.x, mote.z);
    const dir = normalizeDirection(player.x - mote.x, player.z - mote.z);
    const speed = 7 + Math.max(0, 1.5 - mote.lifetime) * 12 + Math.max(0, 3 - dist) * 2;
    mote.x += dir.x * speed * dt;
    mote.z += dir.z * speed * dt;
    mote.y += ((player.y ?? 0) + 1.0 - mote.y) * Math.min(1, dt * 8);

    if (dist < 0.45 || mote.lifetime <= 0) {
      player.gold += mote.value;
      motes.splice(i, 1);
    }
  }
}

/** Thorns_tome: 1.5 单位内对 enemy 反伤 (level × 3). */
export function tickThorns(engine: Engine): void {
  const player = engine.state.player;
  const thornsTome = player.tomes.find(t => t.type === 'thorns_tome');
  const thornsPower = getTomePower(thornsTome);
  if (thornsPower <= 0) return;

  const thornsDamage = thornsPower * 3;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
    if (dist < 1.5) {
      enemy.hp -= thornsDamage;
      enemy.hitFlashTimer = 0.1;
      engine.state.stats.damageDealt += thornsDamage;
    }
  }
}
