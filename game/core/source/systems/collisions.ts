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
 * Phase 4b 起 boss 近战伤害走 ai/bosses/skeletonKing.getBossMeleeDamage。
 */
import { distanceBetween, normalizeDirection } from '../physics.ts';
import { TICK_INTERVAL_MS } from '../config.ts';
import { getBossMeleeDamage } from '../ai/bosses/skeletonKing.ts';
import {
  addDamageEvent,
  applyKnockback,
  findEnemyById,
  findNearestEnemyExcluding,
} from './helpers.ts';
import { applyPlayerHit } from './consumables.ts';
import { applyRelicTargetDamage } from './relics.ts';
import { applyPoison, applySlow } from './statusEffects.ts';
import { onBondWeaponHit } from './bonds.ts';
import { bondConditionalDamageInc } from '../data/bonds.ts';
import { bossDamageEventY, enemyDamageEventY, targetHitCenterY } from '../combatHeight.ts';
import type { Engine } from './types.ts';

// 垂直命中窗口（防止上下层穿模伤害）：
// - 近战：要求敌我脚高接近，避免隔楼层咬人
// - 投射物：要求弹体高度接近玩家身体中心
const ENEMY_MELEE_MAX_Y_DELTA = 1.2;
const BOSS_MELEE_MAX_Y_DELTA = 2.0;
const PLAYER_HIT_CENTER_OFFSET_Y = 0.8;
const PROJECTILE_HIT_MAX_Y_DELTA = 1.5;
const PLAYER_PROJECTILE_HIT_MAX_Y_DELTA = 1.5;

function projectileCanHitTarget(projectileY: number, targetY: number): boolean {
  return Math.abs(projectileY - targetY) <= PLAYER_PROJECTILE_HIT_MAX_Y_DELTA;
}

export function processCollisions(engine: Engine): void {
  const player = engine.state.player;
  const enemies = engine.state.enemies;

  // 1. 投射物 vs 敌人 / boss —— 用 spatial hash 加速
  rebuildSpatialHash(engine);

  for (let i = engine.state.projectiles.length - 1; i >= 0; i--) {
    const proj = engine.state.projectiles[i];
    if (!proj.fromPlayer) continue;

    // gravitational 周期性重置 hit list (每 0.5s)
    if (proj.gravitational) {
      if (proj.lifetime % 0.5 < TICK_INTERVAL_MS / 1000) {
        proj.hitEnemyIds = [];
      }
    }

    const nearbyIds = engine.spatialHash.query(proj.x, proj.z, proj.radius);
    let consumed = false;

    for (const id of nearbyIds) {
      if (proj.hitEnemyIds.includes(id)) continue;

      // boss 命中
      if (id === -1 && engine.state.boss && engine.state.boss.hp > 0) {
        const boss = engine.state.boss;
        if (!projectileCanHitTarget(proj.y, targetHitCenterY(boss))) continue;
        // 投射物 spawn 时已折算无条件加成；此处补「目标相关」的羁绊条件/机制增伤（贴身 / 易伤 / 烙印…）
        const condInc = bondConditionalDamageInc(player, proj.weaponType, boss);
        const dmg = condInc !== 0 ? Math.round(proj.damage * (1 + condInc)) : proj.damage;
        boss.hp -= dmg;
        boss.hitFlashTimer = 0.15;
        engine.state.stats.damageDealt += dmg;
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
      const enemy = findEnemyById(engine, id);
      if (!enemy || enemy.hp <= 0) continue;
      if (!projectileCanHitTarget(proj.y, targetHitCenterY(enemy))) continue;

      // 投射物伤害在 spawn 时已折算无条件加成；此处补上「目标相关」的羁绊条件/机制增伤
      // （贴身、高血量、易伤、烙印…），因为投射物 spawn 时无目标上下文。
      const condInc = bondConditionalDamageInc(player, proj.weaponType, enemy);
      const bondScaled = condInc !== 0 ? Math.round(proj.damage * (1 + condInc)) : proj.damage;
      const damage = applyRelicTargetDamage(engine, bondScaled, enemy);
      enemy.hp -= damage;
      enemy.hitFlashTimer = 0.15;
      engine.state.stats.damageDealt += damage;
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

      // bone_bouncer 弹跳 — 找下一个最近敌人
      if (proj.weaponType === 'bone_bouncer' && proj.bouncesLeft > 0) {
        proj.bouncesLeft--;
        const nextTarget = findNearestEnemyExcluding(engine, proj.x, proj.z, proj.hitEnemyIds, proj.y);
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
    for (const enemy of enemies) {
      if (enemy.hp <= 0 || enemy.attackCooldown > 0) continue;
      if (Math.abs(enemy.y - player.y) > ENEMY_MELEE_MAX_Y_DELTA) continue;

      const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
      if (dist < 1.2) {
        applyPlayerHit(engine, enemy.damage);
        enemy.attackCooldown = enemy.attackCooldownMax;
        break;
      }
    }
  }

  // 3. boss 近战 vs player
  if (player.alive && player.invincibleTimer <= 0 && engine.state.boss && engine.state.boss.hp > 0) {
    if (Math.abs(engine.state.boss.y - player.y) <= BOSS_MELEE_MAX_Y_DELTA) {
      const dist = distanceBetween(player.x, player.z, engine.state.boss.x, engine.state.boss.z);
      if (dist < 2.0 && engine.state.boss.attackCooldown <= 0) {
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

      const dist = distanceBetween(proj.x, proj.z, player.x, player.z);
      const yDist = Math.abs(proj.y - (player.y + PLAYER_HIT_CENTER_OFFSET_Y));
      if (dist < proj.radius + 0.5 && yDist < PROJECTILE_HIT_MAX_Y_DELTA) {
        applyPlayerHit(engine, proj.damage);
        engine.state.projectiles.splice(i, 1);
        break;
      }
    }
  }
}

function rebuildSpatialHash(engine: Engine): void {
  engine.spatialHash.clear();
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    engine.spatialHash.insert(enemy.id, enemy.x, enemy.z, 0.5);
  }
  if (engine.state.boss && engine.state.boss.hp > 0) {
    engine.spatialHash.insert(-1, engine.state.boss.x, engine.state.boss.z, 1.5);
  }
}

