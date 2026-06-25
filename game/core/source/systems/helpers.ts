/**
 * 共享 helpers —— systems 间的公共工具函数（taking engine）。
 *
 * 这些函数原本是 GameInstance 私有方法，Phase 6 抽到独立模块以打破循环依赖：
 *   - findNearest*: 武器 / 投射物碰撞 / lightning chain 共用
 *   - addDamageEvent: 各 damage 路径都要 push 事件
 *   - applyKnockback: 子弹击退 + gargoyle landing AOE 共用
 *   - checkPlayerDeath / checkGameOver: 多个 damage / phase 路径触发
 */
import { distanceSqBetween, normalizeDirection } from '../helpers/physics.ts';
import { getTomePower } from '../data/tomeProgression.ts';
import { AOE_MAX_Y_DELTA, MAX_PICKUPS, PICKUP_LIFETIME } from '../config.ts';
import { targetHitCenterY } from '../helpers/combatHeight.ts';
import { recordBossDefeated } from '../services/save.ts';
import type { BossState, EnemyState, WeaponType } from '../types.ts';
import type { Engine } from './types.ts';
import { onBossDefeated } from './altars.ts';
import { spawnBossChests } from './chests.ts';
import { tryMoveHorizontally } from './horizontalMove.ts';

/** 敌人横向碰撞半径（与 _move.ts 一致）。 */
const ENEMY_RADIUS = 0.4;
const BOSS_XP_REWARD = 100;
const BOSS_XP_PICKUP_OFFSET_Y = 0.2;

export function findNearestEnemy(
  engine: Engine,
  x: number,
  z: number,
  maxRange?: number,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistSq = maxRange !== undefined ? maxRange * maxRange : Infinity;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

export function findNearestEnemyExcluding(
  engine: Engine,
  x: number,
  z: number,
  excludeIds: readonly number[],
  sourceY?: number,
  maxYDelta: number = AOE_MAX_Y_DELTA,
): EnemyState | null {
  let nearest: EnemyState | null = null;
  let nearestDistSq = 20 * 20;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    if (excludeIds.includes(enemy.id)) continue;
    if (sourceY !== undefined && Math.abs(sourceY - targetHitCenterY(enemy)) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  return nearest;
}

/**
 * `findNearestEnemyExcluding` 的"含 boss"变体：boss 不在 `state.enemies[]` 里，
 * 但 bone_bouncer 弹跳、追踪型投射物等"挑下一目标"的场景应一视同仁地考虑它。
 *
 * `excludeIds` 用 `-1` 表示 boss 已被命中（与 spatial hash / proj.hitEnemyIds 的约定一致）。
 */
export function findNearestTargetExcluding(
  engine: Engine,
  x: number,
  z: number,
  excludeIds: readonly number[],
  sourceY?: number,
  maxYDelta: number = AOE_MAX_Y_DELTA,
): EnemyState | BossState | null {
  let nearest: EnemyState | BossState | null = null;
  let nearestDistSq = 20 * 20;
  for (const enemy of engine.state.enemies) {
    if (enemy.hp <= 0) continue;
    if (excludeIds.includes(enemy.id)) continue;
    if (sourceY !== undefined && Math.abs(sourceY - targetHitCenterY(enemy)) > maxYDelta) continue;
    const distSq = distanceSqBetween(x, z, enemy.x, enemy.z);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = enemy;
    }
  }
  const boss = engine.state.boss;
  if (boss && boss.hp > 0 && !excludeIds.includes(-1)) {
    if (sourceY === undefined || Math.abs(sourceY - targetHitCenterY(boss)) <= maxYDelta) {
      const distSq = distanceSqBetween(x, z, boss.x, boss.z);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = boss;
      }
    }
  }
  return nearest;
}

export function findEnemyById(engine: Engine, id: number): EnemyState | null {
  for (let i = 0; i < engine.state.enemies.length; i++) {
    if (engine.state.enemies[i].id === id) return engine.state.enemies[i];
  }
  return null;
}

// ─── DamageEvent 对象池 ─────────────────────────────────────────────────
// 战斗密集时每秒可达数百次命中，每次原本 push({...9 props}) 都新建对象。
// 池化后所有事件对象在第一次使用后被永久复用；tick 末尾不释放（事件数组本身被
// `state.damageEvents.length = 0` 清空，但池索引由 `resetDamageEventPool` 单独重置）。
//
// 安全前提：client 在 RAF 内同步遍历 state.damageEvents 后即不再持有引用。
// 跨 tick 复用是安全的，因为下一次 tick 开始前 RAF 已读完。
//
// 内存上限：池只增不减，长度等于"游戏运行过程中单 tick 命中数的历史峰值"。
// 实际游戏中最大值约 50-200，每对象 ≈ 80 字节 → 永久占用 < 16 KB，可忽略。
const damageEventPool: DamageEventPoolEntry[] = [];
let damageEventCursor = 0;

interface DamageEventPoolEntry {
  x: number;
  y: number;
  z: number;
  damage: number;
  isCrit: boolean;
  isPlayerDamage: boolean;
  weaponType: WeaponType | undefined;
  isShield: boolean | undefined;
  hitFlashColor: number | undefined;
}

/** 在每 tick 开始时调用一次：清空逻辑数组并重置池游标。 */
export function resetDamageEventPool(engine: Engine): void {
  engine.state.damageEvents.length = 0;
  damageEventCursor = 0;
}

export function addDamageEvent(
  engine: Engine,
  x: number, y: number, z: number,
  damage: number,
  isCrit: boolean,
  isPlayerDamage: boolean,
  weaponType?: WeaponType,
  isShield?: boolean,
  hitFlashColor?: number,
): void {
  let evt: DamageEventPoolEntry;
  if (damageEventCursor < damageEventPool.length) {
    evt = damageEventPool[damageEventCursor];
  } else {
    evt = {
      x: 0, y: 0, z: 0, damage: 0,
      isCrit: false, isPlayerDamage: false,
      weaponType: undefined, isShield: undefined, hitFlashColor: undefined,
    };
    damageEventPool.push(evt);
  }
  damageEventCursor++;
  evt.x = x; evt.y = y; evt.z = z;
  evt.damage = damage;
  evt.isCrit = isCrit;
  evt.isPlayerDamage = isPlayerDamage;
  evt.weaponType = weaponType;
  evt.isShield = isShield;
  evt.hitFlashColor = hitFlashColor;
  engine.state.damageEvents.push(evt);
}

/**
 * 击退 enemy。基础力 1.5，knockback_tome 每级 +30%。
 *
 * 玩家撞 enemy / 子弹击中 / gargoyle landing AOE 都用同一函数。
 * `strengthMult` 给特定来源额外加成（如近战 sword 推得更远），默认 1。
 */
export function applyKnockback(
  engine: Engine,
  enemy: EnemyState,
  fromX: number,
  fromZ: number,
  strengthMult = 1,
): void {
  const knockbackTome = engine.state.player.tomes.find(t => t.type === 'knockback_tome');
  const baseForce = 1.5;
  const tomeMultiplier = 1 + getTomePower(knockbackTome) * 0.3;
  const shrineMultiplier = engine.state.player.knockbackMult ?? 1;
  const force = baseForce * tomeMultiplier * shrineMultiplier * strengthMult;

  const dir = normalizeDirection(enemy.x - fromX, enemy.z - fromZ);
  const halfMap = (engine.config.mapSize + 10) * 0.5;
  const targetX = Math.max(-halfMap, Math.min(halfMap, enemy.x + dir.x * force));
  const targetZ = Math.max(-halfMap, Math.min(halfMap, enemy.z + dir.z * force));
  // 击退尊重墙体：撞墙停 / 沿墙滑，不再把怪塞进墙里（gargoyle 飞行也按此，影响可忽略）。
  const moved = tryMoveHorizontally(engine.geo, enemy.x, enemy.z, targetX, targetZ, enemy.y, {
    radius: ENEMY_RADIUS,
    includeClimb: true,
  });
  enemy.x = moved.x;
  enemy.z = moved.z;
}

export function checkPlayerDeath(engine: Engine): void {
  const player = engine.state.player;
  if (player.hp <= 0) {
    player.alive = false;
  }
}

export function checkGameOver(engine: Engine): void {
  if (!engine.state.player.alive) {
    engine.state.phase = 'defeat';
    engine.state.finished = true;
    engine.state.running = false;
    return;
  }
  // Boss 死亡：第一关开传送门进入下一关；第二关及以后只恢复飞碟召唤能力。
  if (engine.state.boss && engine.state.boss.hp <= 0) {
    const defeatedBoss = engine.state.boss;
    spawnBossChests(engine, defeatedBoss);
    spawnBossXpPickup(engine, defeatedBoss);
    engine.state.boss = null;
    engine.state.stats.silverEarned += 50;
    recordBossDefeated();
    onBossDefeated(engine);
    if (engine.state.phase === 'boss_fight' || engine.state.phase === 'boss_intro') {
      engine.state.phase = (engine.state.stage ?? 1) === 1 ? 'portal_open' : 'playing';
    }
  }
}

function spawnBossXpPickup(engine: Engine, boss: NonNullable<Engine['state']['boss']>): void {
  if (engine.state.pickups.length >= MAX_PICKUPS) return;

  let xpReward = BOSS_XP_REWARD;
  const curseTome = engine.state.player.tomes.find(t => t.type === 'curse_tome');
  if (curseTome) xpReward = Math.round(xpReward * (1 + getTomePower(curseTome) * 0.2));

  engine.state.pickups.push({
    id: engine.nextPickupId++,
    type: 'xp_orange',
    x: boss.x,
    y: boss.y + BOSS_XP_PICKUP_OFFSET_Y,
    z: boss.z,
    value: xpReward,
    lifetime: PICKUP_LIFETIME,
    attracted: false,
  });
}
