/**
 * ranged 行为：保持 preferred range 距离 + 远程射击。
 *
 * 等价于原 `computeEnemyTarget` 的 'ranged' case + ranged attack 检查 + `moveEnemy`：
 * - 错峰重算 target：dist < range → 后撤 4m, dist > range×1.5 → 追, 中间 → 站定
 * - 每帧检查 attack cooldown：在 [range×0.5, range×1.5] 之间、垂直差不超过阈值且冷却到时, 推一个敌方投射物
 */
import { distanceSqBetween, normalizeDirection } from '../../physics.ts';
import { ENEMIES } from '../../data/enemies.ts';
import type { EnemyBehaviorFn } from '../types.ts';
import { applyMovement } from './_move.ts';

const MAX_RANGED_ATTACK_DISTANCE = 10;
const ENEMY_RANGED_MAX_Y_DELTA = 2.8;

export const ranged: EnemyBehaviorFn = (enemy, ctx, i) => {
  const def = ENEMIES[enemy.type];
  const preferredRange = def?.preferredRange ?? 8;
  const maxAttackRange = Math.min(preferredRange * 1.5, MAX_RANGED_ATTACK_DISTANCE);
  // 用平方距离比较，省掉每个远程敌人每帧一次 sqrt。
  const distSq = distanceSqBetween(enemy.x, enemy.z, ctx.player.x, ctx.player.z);

  // 错峰重算 target（每帧只有对应aiPhase的敌人重算，节省CPU）
  if (enemy.aiPhase === ctx.aiGroup) {
    if (distSq < preferredRange * preferredRange) {
      const dir = normalizeDirection(enemy.x - ctx.player.x, enemy.z - ctx.player.z);
      enemy.targetX = enemy.x + dir.x * 4;
      enemy.targetZ = enemy.z + dir.z * 4;
    } else if (distSq > (preferredRange * 1.5) * (preferredRange * 1.5)) {
      enemy.targetX = ctx.player.x;
      enemy.targetZ = ctx.player.z;
    } else {
      enemy.targetX = enemy.x;
      enemy.targetZ = enemy.z;
    }
  }

  // 远程攻击（每帧检查, 不只在 aiGroup 帧）
  if (
    enemy.attackCooldown <= 0
    && distSq <= maxAttackRange * maxAttackRange
    && distSq >= (preferredRange * 0.5) * (preferredRange * 0.5)
    && Math.abs(enemy.y - ctx.player.y) <= ENEMY_RANGED_MAX_Y_DELTA
  ) {
    const dir = normalizeDirection(ctx.player.x - enemy.x, ctx.player.z - enemy.z);
    const projSpeed = enemy.type === 'necromancer' ? 6 : 8;

    const id = ctx.effects.spawnProjectile({
      weaponType: 'pistol',
      x: enemy.x, y: enemy.y + 1.0, z: enemy.z,
      vx: dir.x * projSpeed, vy: 0, vz: dir.z * projSpeed,
      damage: enemy.damage,
      bouncesLeft: 0,
      pierceLeft: 0,
      lifetime: 4.0,
      radius: 0.4,
      fromPlayer: false,
    });
    if (id !== null) {
      enemy.attackCooldown = enemy.attackCooldownMax;
    }
  }

  applyMovement(enemy, ctx);
};
