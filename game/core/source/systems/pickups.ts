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
import { distanceBetween, distanceSqBetween, normalizeDirection } from '../helpers/physics.ts';
import {
  MAX_PICKUPS,
  PICKUP_LIFETIME,
  PICKUP_ATTRACT_SPEED,
  HEALTH_DROP_CHANCE,
  HEALTH_SMALL_DROP_CHANCE,
  TIER_CONFIGS,
  AOE_MAX_Y_DELTA,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';
import { getShopBonuses } from '../data/shop.ts';
import { getTomePower } from '../data/tomeProgression.ts';
import { applyRelicKillEffects, getRelicBonusGoldOnKill, rollGoldForEnemy } from './relics.ts';
import { getXpPickupRadius, isXpPickupType, spawnConsumablesFromEnemy } from './consumables.ts';
import { recordBondKill, recordWeaponKill } from './weaponDamageStats.ts';
import { ObjectPool } from '../helpers/objectPool.ts';
import type { EnemyState, GoldMoteState, PickupState, PickupType } from '../types.ts';
import type { Engine } from './types.ts';

const PICKUP_SURFACE_OFFSET_Y = 0.2;
const GOLD_MOTE_OFFSET_Y = 0.7;

// ─── 对象池（降后期 GC churn；见 helpers/objectPool.ts）──────────────────────
// PickupState / GoldMoteState 字段全必填、无 optional，acquire 后逐字段覆盖即可，
// 无“状态残留”风险。客户端按 id 引用、id 单调递增，回收对象壳安全。
const pickupPool = new ObjectPool<PickupState>('pickup', () => ({
  id: 0, type: 'xp_green', x: 0, y: 0, z: 0, value: 0, lifetime: 0, attracted: false,
}));
const goldMotePool = new ObjectPool<GoldMoteState>('goldMote', () => ({
  id: 0, x: 0, y: 0, z: 0, value: 0, lifetime: 0,
}));

/** 从池取一个 Pickup 并写满字段。 */
export function acquirePickup(
  id: number, type: PickupType, x: number, y: number, z: number, value: number,
): PickupState {
  const p = pickupPool.acquire();
  p.id = id; p.type = type; p.x = x; p.y = y; p.z = z; p.value = value;
  p.lifetime = PICKUP_LIFETIME; p.attracted = false;
  return p;
}

/** Pickup 归还池（移除/清场调用）。 */
export function releasePickup(p: PickupState): void {
  pickupPool.release(p);
}

/** 清场：把 pickups + goldMotes 全部归还池后就地清空（不重建数组）。 */
export function recyclePickupArrays(state: Engine['state']): void {
  for (let i = 0; i < state.pickups.length; i++) pickupPool.release(state.pickups[i]);
  state.pickups.length = 0;
  for (let i = 0; i < state.goldMotes.length; i++) goldMotePool.release(state.goldMotes[i]);
  state.goldMotes.length = 0;
}

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
      if (enemy.lastHitWeaponType) {
        recordWeaponKill(engine, enemy.lastHitWeaponType);
      }
      if (enemy.lastHitBondId) {
        recordBondKill(engine, enemy.lastHitBondId);
      }
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
    engine.state.pickups.push(
      acquirePickup(engine.nextPickupId++, pickupType, enemy.x, dropY, enemy.z, xpReward),
    );
  }

  // Elite 掉 silver
  if (enemy.isElite && engine.state.pickups.length < MAX_PICKUPS) {
    engine.state.pickups.push(
      acquirePickup(
        engine.nextPickupId++, 'silver',
        enemy.x + (Math.random() - 0.5), dropY, enemy.z + (Math.random() - 0.5),
        5,
      ),
    );
  }

  // 随机生命掉落
  if (engine.state.pickups.length < MAX_PICKUPS) {
    const roll = Math.random();
    if (roll < HEALTH_DROP_CHANCE) {
      engine.state.pickups.push(
        acquirePickup(
          engine.nextPickupId++, 'health',
          enemy.x + (Math.random() - 0.5), dropY, enemy.z + (Math.random() - 0.5),
          50,
        ),
      );
    } else if (roll < HEALTH_DROP_CHANCE + HEALTH_SMALL_DROP_CHANCE) {
      engine.state.pickups.push(
        acquirePickup(
          engine.nextPickupId++, 'health_small',
          enemy.x + (Math.random() - 0.5), dropY, enemy.z + (Math.random() - 0.5),
          25,
        ),
      );
    }
  }
}

function spawnGoldMoteFromEnemy(engine: Engine, enemy: EnemyState): void {
  const value = rollGoldForEnemy(engine, enemy) + getRelicBonusGoldOnKill(engine);
  if (value <= 0) return;
  const mote = goldMotePool.acquire();
  mote.id = engine.nextPickupId++;
  mote.x = enemy.x;
  mote.y = enemy.y + GOLD_MOTE_OFFSET_Y;
  mote.z = enemy.z;
  mote.value = value;
  mote.lifetime = 1.5;
  engine.state.goldMotes.push(mote);
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
      releasePickup(pickup);
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
        releasePickup(pickup);
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
  engine.state.xpPickupEvents.push({
    x: pickup.x,
    y: pickup.y,
    z: pickup.z,
    amount: xpValue,
    type: pickup.type,
  });
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
      goldMotePool.release(mote);
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
  const thornsRangeSq = 1.5 * 1.5;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    if (Math.abs(enemy.y - player.y) > AOE_MAX_Y_DELTA) continue;
    if (distanceSqBetween(player.x, player.z, enemy.x, enemy.z) < thornsRangeSq) {
      enemy.hp -= thornsDamage;
      enemy.hitFlashTimer = 0.1;
      engine.state.stats.damageDealt += thornsDamage;
    }
  }
}
