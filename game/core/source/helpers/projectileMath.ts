/**
 * Weapon fire logic — determines projectiles/effects created when each weapon fires.
 * Implements MegaBonk-style weapon behaviors:
 * - Sword: melee damage arc in front of player
 * - Bone Bouncer: bouncing projectile
 * - Axe: orbiting projectiles around player (Vampire Survivors style)
 * - Pistol: forward bullet (high speed, single target)
 * - Lightning Staff: chain lightning (instant)
 * - Flame Ring: constant AOE around player
 * - Shotgun: spread shot forward
 */

import type { EnemyState, PlayerState, ProjectileState, WeaponType, DamageEvent } from '../types.ts';
import { AOE_MAX_Y_DELTA, WEAPON_STATS } from '../config.ts';
import { enemyDamageEventY, playerProjectileY, PLAYER_PROJECTILE_OFFSET_Y, targetHitCenterY } from './combatHeight.ts';
import { distanceBetween, normalizeDirection } from './physics.ts';

/**
 * Fire a weapon, returning new projectiles to add.
 * For instant-hit weapons (lightning_staff, sword, flame_ring), damage events are pushed directly.
 */
export function fireWeapon(
  weaponType: WeaponType,
  level: number,
  playerState: PlayerState,
  enemies: EnemyState[],
  nextProjectileId: number,
  damageEvents: DamageEvent[],
  damageMultiplier: number,
  critChance: number,
  critDamage: number,
): { projectiles: ProjectileState[]; nextId: number } {
  const stats = WEAPON_STATS[weaponType]?.[level];
  if (!stats) return { projectiles: [], nextId: nextProjectileId };

  const projectiles: ProjectileState[] = [];
  let currentId = nextProjectileId;

  switch (weaponType) {
    case 'sword': {
      // Sword qi projectile: wide arc slash wave
      const count = stats.projectileCount;
      for (let i = 0; i < count; i++) {
        let angle = playerState.rotation;
        if (count > 1) {
          angle += ((i - (count - 1) / 2) * 0.4);
        }

        const target = findNearestEnemyInRange(playerState.x, playerState.z, enemies, stats.range, playerState.y);
        let vx: number, vz: number;
        if (target) {
          const dir = normalizeDirection(target.x - playerState.x, target.z - playerState.z);
          vx = dir.x * stats.speed;
          vz = dir.z * stats.speed;
        } else {
          vx = Math.sin(angle) * stats.speed;
          vz = Math.cos(angle) * stats.speed;
        }

        const { finalDamage } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        projectiles.push({
          id: currentId++,
          weaponType: 'sword',
          x: playerState.x, y: playerProjectileY(playerState), z: playerState.z,
          vx, vy: 0, vz,
          damage: finalDamage,
          bouncesLeft: 0,
          pierceLeft: stats.pierce,
          lifetime: 0.6,
          radius: 0.8,
          fromPlayer: true,
          hitEnemyIds: [],
        });
      }
      break;
    }

    case 'bone_bouncer': {
      const count = stats.projectileCount;
      for (let i = 0; i < count; i++) {
        const target = findNearestEnemy(playerState.x, playerState.z, enemies, -1, playerState.y);
        let vx: number;
        let vz: number;

        if (target) {
          const dir = normalizeDirection(target.x - playerState.x, target.z - playerState.z);
          vx = dir.x * stats.speed;
          vz = dir.z * stats.speed;
        } else {
          vx = Math.sin(playerState.rotation + i * 0.3) * stats.speed;
          vz = Math.cos(playerState.rotation + i * 0.3) * stats.speed;
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

        const { finalDamage } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        projectiles.push({
          id: currentId++,
          weaponType: 'bone_bouncer',
          x: playerState.x, y: playerProjectileY(playerState), z: playerState.z,
          vx, vy: 0, vz,
          damage: finalDamage,
          bouncesLeft: stats.bounces,
          pierceLeft: 0,
          lifetime: 4.0,
          radius: 0.4,
          fromPlayer: true,
          hitEnemyIds: [],
        });
      }
      break;
    }

    case 'axe': {
      // Orbiting axes around player (like Vampire Survivors garlic/axe)
      const count = stats.projectileCount;
      for (let i = 0; i < count; i++) {
        const startAngle = (i / count) * Math.PI * 2;
        const { finalDamage } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        projectiles.push({
          id: currentId++,
          weaponType: 'axe',
          x: playerState.x + Math.cos(startAngle) * stats.range,
          y: playerProjectileY(playerState),
          z: playerState.z + Math.sin(startAngle) * stats.range,
          vx: 0, vy: 0, vz: 0,
          damage: finalDamage,
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
      break;
    }

    case 'pistol': {
      // Forward arrow (high speed, single target, long range)
      const count = stats.projectileCount;
      for (let i = 0; i < count; i++) {
        let angle = playerState.rotation;
        if (count > 1) {
          angle += ((i - (count - 1) / 2) * 0.15);
        }

        // Aim at nearest enemy if possible
        const target = findNearestEnemyInRange(playerState.x, playerState.z, enemies, stats.range, playerState.y);
        let vx: number, vz: number;
        if (target && i === 0) {
          const dir = normalizeDirection(target.x - playerState.x, target.z - playerState.z);
          vx = dir.x * stats.speed;
          vz = dir.z * stats.speed;
        } else {
          vx = Math.sin(angle) * stats.speed;
          vz = Math.cos(angle) * stats.speed;
        }

        const { finalDamage } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        projectiles.push({
          id: currentId++,
          weaponType: 'pistol',
          x: playerState.x, y: playerProjectileY(playerState), z: playerState.z,
          vx, vy: 0, vz,
          damage: finalDamage,
          bouncesLeft: 0,
          pierceLeft: stats.pierce,
          lifetime: 3.0,
          radius: 0.25,
          fromPlayer: true,
          hitEnemyIds: [],
        });
      }
      break;
    }

    case 'lightning_staff': {
      // Strike random enemies within range (instant hit, no projectile movement)
      const hitCount = stats.projectileCount + (stats.chains ?? 0);
      const inRange: typeof enemies = [];
      for (const enemy of enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.abs(enemy.y - playerState.y) > AOE_MAX_Y_DELTA) continue;
        const dist = distanceBetween(playerState.x, playerState.z, enemy.x, enemy.z);
        if (dist <= stats.range) inRange.push(enemy);
      }
      // Shuffle and pick up to hitCount
      for (let i = inRange.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [inRange[i], inRange[j]] = [inRange[j], inRange[i]];
      }
      const targets = inRange.slice(0, hitCount);
      for (const target of targets) {
        const { finalDamage, isCrit } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        target.hp -= finalDamage;
        target.hitFlashTimer = 0.15;
        damageEvents.push({
          x: target.x, y: enemyDamageEventY(target), z: target.z,
          damage: finalDamage, isCrit, isPlayerDamage: false,
          weaponType: 'lightning_staff',
        });
      }
      break;
    }

    case 'flame_ring': {
      // Handled directly in game tick as AOE — returns nothing
      break;
    }

    case 'shotgun': {
      // Spread shot in facing direction
      const count = stats.projectileCount;
      const spreadAngle = Math.PI * 0.35; // Total spread
      for (let i = 0; i < count; i++) {
        const angleOffset = count > 1
          ? ((i / (count - 1)) - 0.5) * spreadAngle
          : 0;
        const angle = playerState.rotation + angleOffset;
        const vx = Math.sin(angle) * stats.speed;
        const vz = Math.cos(angle) * stats.speed;

        const { finalDamage } = computeDamage(stats.damage, damageMultiplier, critChance, critDamage);
        projectiles.push({
          id: currentId++,
          weaponType: 'shotgun',
          x: playerState.x, y: playerProjectileY(playerState), z: playerState.z,
          vx, vy: 0, vz,
          damage: finalDamage,
          bouncesLeft: 0,
          pierceLeft: stats.pierce,
          lifetime: 1.5,
          radius: 0.2,
          fromPlayer: true,
          hitEnemyIds: [],
        });
      }
      break;
    }

  }

  return { projectiles, nextId: currentId };
}

/**
 * Apply bounce logic: find next bounce target for a bone_bouncer projectile.
 */
export function applyBounce(
  projectile: ProjectileState,
  enemies: EnemyState[],
  bounceRange: number = 8,
): EnemyState | null {
  if (projectile.bouncesLeft <= 0) return null;

  let nearest: EnemyState | null = null;
  let nearestDist = bounceRange;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;
    if (projectile.hitEnemyIds.indexOf(enemy.id) !== -1) continue;
    if (Math.abs(projectile.y - targetHitCenterY(enemy)) > AOE_MAX_Y_DELTA) continue;

    const dist = distanceBetween(projectile.x, projectile.z, enemy.x, enemy.z);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }

  return nearest;
}

/**
 * Update orbiting projectiles (axe) around player position.
 */
export function updateOrbitingProjectile(
  proj: ProjectileState,
  playerX: number,
  playerZ: number,
  dt: number,
  playerY?: number,
): void {
  if (!proj.orbiting || proj.orbitAngle === undefined || proj.orbitRadius === undefined || proj.orbitSpeed === undefined) return;
  proj.orbitAngle += proj.orbitSpeed * dt;
  proj.x = playerX + Math.cos(proj.orbitAngle) * proj.orbitRadius;
  if (playerY !== undefined) proj.y = playerY + PLAYER_PROJECTILE_OFFSET_Y;
  proj.z = playerZ + Math.sin(proj.orbitAngle) * proj.orbitRadius;
}

/**
 * Apply gravitational pull from black_hole projectiles to enemies.
 */
export function applyGravitationalPull(
  proj: ProjectileState,
  enemies: EnemyState[],
  dt: number,
): void {
  if (!proj.gravitational || !proj.gravityStrength) return;
  const pullRadius = proj.radius * 1.5;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const dist = distanceBetween(proj.x, proj.z, enemy.x, enemy.z);
    if (dist < pullRadius && dist > 0.5) {
      const dir = normalizeDirection(proj.x - enemy.x, proj.z - enemy.z);
      const pullForce = proj.gravityStrength * (1 - dist / pullRadius);
      enemy.x += dir.x * pullForce * dt;
      enemy.z += dir.z * pullForce * dt;
    }
  }
}

// --- Helper functions ---

function findNearestEnemy(
  x: number,
  z: number,
  enemies: EnemyState[],
  excludeId: number,
  sourceY?: number,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDist = Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0 || enemy.id === excludeId) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > AOE_MAX_Y_DELTA) continue;

    const dist = distanceBetween(x, z, enemy.x, enemy.z);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }

  return nearest;
}

function findNearestEnemyInRange(
  x: number,
  z: number,
  enemies: EnemyState[],
  range: number,
  sourceY?: number,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDist = range;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;
    if (sourceY !== undefined && Math.abs(enemy.y - sourceY) > AOE_MAX_Y_DELTA) continue;

    const dist = distanceBetween(x, z, enemy.x, enemy.z);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }

  return nearest;
}

function findChainTargets(
  primary: EnemyState,
  enemies: EnemyState[],
  maxChains: number,
  chainRange: number,
): EnemyState[] {
  const targets: EnemyState[] = [];
  const hitIds = new Set<number>([primary.id]);
  let lastX = primary.x;
  let lastZ = primary.z;

  for (let c = 0; c < maxChains; c++) {
    let nearest: EnemyState | null = null;
    let nearestDist = chainRange;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.hp <= 0 || hitIds.has(enemy.id)) continue;

      const dist = distanceBetween(lastX, lastZ, enemy.x, enemy.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    if (!nearest) break;

    targets.push(nearest);
    hitIds.add(nearest.id);
    lastX = nearest.x;
    lastZ = nearest.z;
  }

  return targets;
}

function computeDamage(
  baseDamage: number,
  damageMultiplier: number,
  critChance: number,
  critDamage: number,
): { finalDamage: number; isCrit: boolean } {
  const isCrit = Math.random() < critChance;
  let finalDamage = baseDamage * damageMultiplier;
  if (isCrit) {
    finalDamage *= critDamage;
  }
  return { finalDamage: Math.round(finalDamage), isCrit };
}
