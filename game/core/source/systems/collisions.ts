/**
 * 碰撞系统 —— 4 种碰撞统一处理：
 *
 *   1. 玩家投射物 vs enemies / boss      (spatial hash 加速)
 *   2. enemy 近战 vs player              (1.2 单位内攻击, attackCooldown 重置)
 *   3. boss 近战 vs player               (2.0 单位内攻击, getBossMeleeDamage)
 *   4. enemy 投射物 vs player            (radius 检测, 命中即销毁)
 *
 * 击退、damageEvent、damageDealt 累计 — 都通过 systems/helpers.ts 的纯函数。
 *
 * boss 近战伤害走 ai/bosses/common.getBossMeleeDamage（两套机甲共用）。
 */
import { distanceSqBetween, normalizeDirection } from '../helpers/physics.ts';
import { getBossMeleeDamage } from '../ai/bosses/common.ts';
import {
  addDamageEvent,
  applyKnockback,
  findNearestTargetExcluding,
} from './helpers.ts';
import { applyPlayerHit } from './consumables.ts';
import { applyRelicTargetDamage } from './relics.ts';
import { applyPoison, applySlow } from './statusEffects.ts';
import { onBondWeaponHit } from './bonds.ts';
import { recordWeaponDamage } from './weaponDamageStats.ts';
import { bondConditionalDamageInc } from '../data/bonds.ts';
import { BONE_BOUNCER_MAX_Y_DELTA, bossDamageEventY, enemyDamageEventY, targetHitCenterY } from '../helpers/combatHeight.ts';
import type { Engine } from './types.ts';

// 垂直命中窗口（防止上下层穿模伤害）：
// - 近战：要求敌我脚高接近，避免隔楼层咬人
// - 投射物：要求弹体高度接近玩家身体中心
const ENEMY_MELEE_MAX_Y_DELTA = 1.2;
const BOSS_MELEE_MAX_Y_DELTA = 2.0;
const PLAYER_HIT_CENTER_OFFSET_Y = 0.8;
const PROJECTILE_HIT_MAX_Y_DELTA = 1.5;
const PLAYER_PROJECTILE_HIT_MAX_Y_DELTA = 1.5;

function projectileCanHitTarget(projectileY: number, targetY: number, maxYDelta: number): boolean {
  return Math.abs(projectileY - targetY) <= maxYDelta;
}

function playerProjectileHitMaxYDelta(weaponType: string): number {
  return weaponType === 'bone_bouncer'
    ? BONE_BOUNCER_MAX_Y_DELTA
    : PLAYER_PROJECTILE_HIT_MAX_Y_DELTA;
}

export function processCollisions(engine: Engine): void {
  const player = engine.state.player;
  const enemies = engine.state.enemies;

  // 1. 投射物 vs 敌人 / boss —— 用 spatial hash 加速
  ensureSpatialIndex(engine);

  for (let i = engine.state.projectiles.length - 1; i >= 0; i--) {
    const proj = engine.state.projectiles[i];
    if (!proj.fromPlayer) continue;

    // queryRef 返回内部复用 buffer（零分配）：本投射物在进入下一个投射物的 query 前
    // 同步遍历完 nearbyIds，期间无其它 spatial hash 查询，复用安全。
    const nearbyIds = engine.spatialHash.queryRef(proj.x, proj.z, proj.radius);
    let consumed = false;

    for (const id of nearbyIds) {
      if (proj.hitEnemyIds.includes(id)) continue;

      // boss 命中
      if (id === -1 && engine.state.boss && engine.state.boss.hp > 0) {
        const boss = engine.state.boss;
        if (!projectileCanHitTarget(proj.y, targetHitCenterY(boss), playerProjectileHitMaxYDelta(proj.weaponType))) continue;
        // 投射物 spawn 时已折算无条件加成；此处补「目标相关」的羁绊条件/机制增伤（贴身 / 易伤 / 烙印…）
        const condInc = bondConditionalDamageInc(player, proj.weaponType, boss);
        const dmg = condInc !== 0 ? Math.round(proj.damage * (1 + condInc)) : proj.damage;
        boss.hp -= dmg;
        boss.hitFlashTimer = 0.15;
        recordWeaponDamage(engine, proj.weaponType, dmg, boss);
        addDamageEvent(engine, boss.x, bossDamageEventY(boss), boss.z, dmg, false, false, proj.weaponType);
        proj.hitEnemyIds.push(id);

        // 羁绊命中机制（标记 / 易伤 / 烙印 / 神经毒素 / 导体连锁 / 击退冲击 / 余烬引爆）
        onBondWeaponHit(engine, proj.weaponType, boss, dmg, false);

        if (proj.pierceLeft > 0) {
          proj.pierceLeft--;
          continue;
        }
        if (!proj.gravitational && !proj.orbiting) {
          consumed = true;
        }
        break;
      }

      // enemy 命中
      const enemy = engine.enemyById.get(id);
      if (!enemy || enemy.hp <= 0) continue;
      if (!projectileCanHitTarget(proj.y, targetHitCenterY(enemy), playerProjectileHitMaxYDelta(proj.weaponType))) continue;

      // 投射物伤害在 spawn 时已折算无条件加成；此处补上「目标相关」的羁绊条件/机制增伤
      // （贴身、高血量、易伤、烙印…），因为投射物 spawn 时无目标上下文。
      const condInc = bondConditionalDamageInc(player, proj.weaponType, enemy);
      const bondScaled = condInc !== 0 ? Math.round(proj.damage * (1 + condInc)) : proj.damage;
      const damage = applyRelicTargetDamage(engine, bondScaled, enemy);
      enemy.hp -= damage;
      enemy.hitFlashTimer = 0.15;
      recordWeaponDamage(engine, proj.weaponType, damage, enemy);
      addDamageEvent(engine, enemy.x, enemyDamageEventY(enemy), enemy.z, damage, false, false, proj.weaponType);
      proj.hitEnemyIds.push(id);

      applyKnockback(engine, enemy, proj.x, proj.z);

      // 羁绊命中机制（奥秘 / 导体 / 易伤 / 烙印 / 神经毒素 / 击退冲击 / 余烬引爆）
      onBondWeaponHit(engine, proj.weaponType, enemy, damage, false);

      // 命中附带状态效果（麻痹枪减速 / 其它中毒投射物）
      if (proj.onHitStatus) {
        const s = proj.onHitStatus;
        if (s.slowFactor !== undefined && s.slowDuration) {
          applySlow(enemy, s.slowFactor, s.slowDuration);
        }
        if (s.poisonDps && s.poisonDuration) {
          applyPoison(enemy, s.poisonDps, s.poisonDuration);
        }
      }

      // bone_bouncer 弹跳 — 找下一个最近目标（含 boss；boss 用 -1 作为 hitEnemyIds 标记）
      if (proj.weaponType === 'bone_bouncer' && proj.bouncesLeft > 0) {
        proj.bouncesLeft--;
        const nextTarget = findNearestTargetExcluding(engine, proj.x, proj.z, proj.hitEnemyIds, proj.y, BONE_BOUNCER_MAX_Y_DELTA);
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

      if (proj.pierceLeft > 0) {
        proj.pierceLeft--;
        continue;
      }

      if (proj.gravitational || proj.orbiting) {
        continue;
      }

      consumed = true;
      break;
    }

    if (consumed) {
      engine.state.projectiles.splice(i, 1);
    }
  }

  // 2. enemy 近战 vs player
  if (player.alive && player.invincibleTimer <= 0) {
    const meleeRangeSq = 1.2 * 1.2;
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.attackCooldown > 0) continue;
      if (Math.abs(enemy.y - player.y) > ENEMY_MELEE_MAX_Y_DELTA) continue;

      const distSq = distanceSqBetween(player.x, player.z, enemy.x, enemy.z);
      if (distSq < meleeRangeSq) {
        applyPlayerHit(engine, enemy.damage);
        enemy.attackCooldown = enemy.attackCooldownMax;
        break;
      }
    }
  }

  // 3. boss 近战 vs player
  if (player.alive && player.invincibleTimer <= 0 && engine.state.boss && engine.state.boss.hp > 0) {
    if (Math.abs(engine.state.boss.y - player.y) <= BOSS_MELEE_MAX_Y_DELTA) {
      const distSq = distanceSqBetween(player.x, player.z, engine.state.boss.x, engine.state.boss.z);
      if (distSq < 2.0 * 2.0 && engine.state.boss.attackCooldown <= 0) {
        const bossDmg = getBossMeleeDamage(engine.state.boss);
        applyPlayerHit(engine, bossDmg);
        engine.state.boss.attackCooldown = 2.0;
      }
    }
  }

  // 4. enemy 投射物 vs player
  if (player.alive && player.invincibleTimer <= 0) {
    for (let i = engine.state.projectiles.length - 1; i >= 0; i--) {
      const proj = engine.state.projectiles[i];
      if (proj.fromPlayer) continue;

      const hitRange = proj.radius + 0.5;
      const distSq = distanceSqBetween(proj.x, proj.z, player.x, player.z);
      const yDist = Math.abs(proj.y - (player.y + PLAYER_HIT_CENTER_OFFSET_Y));
      if (distSq < hitRange * hitRange && yDist < PROJECTILE_HIT_MAX_Y_DELTA) {
        applyPlayerHit(engine, proj.damage);
        engine.state.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

/**
 * 重建 spatialHash + enemyById 索引；同一 tick 内多次调用只做一次（按 state.tick 去重）。
 *
 * GameInstance.tick 内的调用方：
 *   - tickAreaEffects 在 processCollisions 之前先调一次 → 第一次实际 rebuild
 *   - processCollisions 再调一次 → 命中 spatialIndexTick === state.tick 早退
 *
 * 安全性：tickAreaEffects 与 processCollisions 之间没有 system 写敌人 x/z（statusEffects /
 * bonds 只改 hp / 状态计时器），故复用同一份索引位置正确。死敌（hp<=0）保留在 hash 内，
 * 调用方依旧靠 `enemy.hp <= 0` 跳过，与原行为一致。
 */
export function ensureSpatialIndex(engine: Engine): void {
  if (engine.spatialIndexTick === engine.state.tick) return;
  engine.spatialIndexTick = engine.state.tick;

  engine.spatialHash.clear();
  engine.enemyById.clear();
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    engine.spatialHash.insert(enemy.id, enemy.x, enemy.z, 0.5);
    engine.enemyById.set(enemy.id, enemy);
  }
  if (engine.state.boss && engine.state.boss.hp > 0) {
    engine.spatialHash.insert(-1, engine.state.boss.x, engine.state.boss.z, 1.5);
  }
}

