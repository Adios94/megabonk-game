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
import { TICK_INTERVAL_MS, PLAYER_INVINCIBLE_DURATION } from '../config.ts';
import { getBossMeleeDamage } from '../ai/bosses/skeletonKing.ts';
import {
  addDamageEvent,
  applyKnockback,
  checkPlayerDeath,
  findEnemyById,
  findNearestEnemyExcluding,
} from './helpers.ts';
import type { Engine } from './types.ts';

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
        engine.state.boss.hp -= proj.damage;
        engine.state.boss.hitFlashTimer = 0.15;
        engine.state.stats.damageDealt += proj.damage;
        addDamageEvent(engine, engine.state.boss.x, 2, engine.state.boss.z, proj.damage, false, false, proj.weaponType);
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

      // enemy 命中
      const enemy = findEnemyById(engine, id);
      if (!enemy || enemy.hp <= 0) continue;

      enemy.hp -= proj.damage;
      enemy.hitFlashTimer = 0.15;
      engine.state.stats.damageDealt += proj.damage;
      addDamageEvent(engine, enemy.x, 1.0, enemy.z, proj.damage, false, false, proj.weaponType);
      proj.hitEnemyIds.push(id);

      applyKnockback(engine, enemy, proj.x, proj.z);

      // bone_bouncer 弹跳 — 找下一个最近敌人
      if (proj.weaponType === 'bone_bouncer' && proj.bouncesLeft > 0) {
        proj.bouncesLeft--;
        const nextTarget = findNearestEnemyExcluding(engine, proj.x, proj.z, proj.hitEnemyIds);
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

      const dist = distanceBetween(player.x, player.z, enemy.x, enemy.z);
      if (dist < 1.2) {
        const damage = computePlayerHitDamage(engine, enemy.damage);
        player.hp -= damage;
        player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
        enemy.attackCooldown = enemy.attackCooldownMax;
        engine.state.stats.damageTaken += damage;
        addDamageEvent(engine, player.x, 1.5, player.z, damage, false, true);
        if (player.hp <= 0) checkPlayerDeath(engine);
        break;
      }
    }
  }

  // 3. boss 近战 vs player
  if (player.alive && player.invincibleTimer <= 0 && engine.state.boss && engine.state.boss.hp > 0) {
    const dist = distanceBetween(player.x, player.z, engine.state.boss.x, engine.state.boss.z);
    if (dist < 2.0 && engine.state.boss.attackCooldown <= 0) {
      const bossDmg = getBossMeleeDamage(engine.state.boss);
      const damage = computePlayerHitDamage(engine, bossDmg);
      player.hp -= damage;
      player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
      engine.state.boss.attackCooldown = 2.0;
      engine.state.stats.damageTaken += damage;
      addDamageEvent(engine, player.x, 1.5, player.z, damage, false, true);
      if (player.hp <= 0) checkPlayerDeath(engine);
    }
  }

  // 4. enemy 投射物 vs player
  if (player.alive && player.invincibleTimer <= 0) {
    for (let i = engine.state.projectiles.length - 1; i >= 0; i--) {
      const proj = engine.state.projectiles[i];
      if (proj.fromPlayer) continue;

      const dist = distanceBetween(proj.x, proj.z, player.x, player.z);
      const yDist = Math.abs(proj.y - 0.5);
      if (dist < proj.radius + 0.5 && yDist < 1.5) {
        const damage = computePlayerHitDamage(engine, proj.damage);
        player.hp -= damage;
        player.invincibleTimer = PLAYER_INVINCIBLE_DURATION;
        engine.state.stats.damageTaken += damage;
        addDamageEvent(engine, player.x, 1.5, player.z, damage, false, true);
        engine.state.projectiles.splice(i, 1);
        if (player.hp <= 0) checkPlayerDeath(engine);
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

/** 应用 armor + shield_tome 减免，返回最终 player 受伤 (≥1). */
function computePlayerHitDamage(engine: Engine, raw: number): number {
  const player = engine.state.player;
  const shieldTome = player.tomes.find(t => t.type === 'shield_tome');
  const shieldReduction = shieldTome ? shieldTome.level * 0.05 : 0;
  const afterArmor = Math.max(1, raw - player.armor);
  return Math.max(1, Math.round(afterArmor * (1 - shieldReduction)));
}
