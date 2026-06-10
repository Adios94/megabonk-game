/**
 * charge 行为：skeleton_knight 的"蓄力 → 冲撞 → 冷却"状态机。
 *
 * 等价于原 `updateChargeEnemy`：
 * - idle: dist<15 + 冷却到 → windup（timer 0.8）；否则正常 chase + 移动
 * - windup: 减 timer, 持续 hitFlashTimer=0.1（红色蓄力提示）, 不移动；timer 到 → charging（timer 0.5）
 * - charging: 高速 (speed×3) 直冲锁定坐标, 不通过 applyMovement（避开速度倍率叠加）；
 *             timer 到 / 抵达 → cooldown（timer 3.0, attackCooldown 重置）
 * - cooldown: 慢速 chase + 移动；timer 到 → idle
 *
 * 注：charging 不调用 applyMovement，y 不跟随地形（保留原行为，可能略飘但视觉上短暂）
 */
import type { EnemyBehaviorFn } from '../types.ts';
import { applyMovement } from './_move.ts';

export const charge: EnemyBehaviorFn = (enemy, ctx, i) => {
  const dt = ctx.dt;
  const player = ctx.player;

  switch (enemy.chargeState) {
    case 'idle': {
      // 蓄力起手判定每帧检查（不可错峰，否则起手从 60Hz 降到 15Hz）。
      const dx = enemy.x - player.x;
      const dz = enemy.z - player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 15 && enemy.attackCooldown <= 0) {
        // 进入蓄力的当帧不移动（等价 legacy：windup 起手前最后一帧站定）
        enemy.chargeState = 'windup';
        enemy.chargeTimer = 0.8;
        enemy.chargeTargetX = player.x;
        enemy.chargeTargetZ = player.z;
      } else {
        // 错峰重算 target（只在对应 aiPhase 帧计算），但每帧都朝 target 移动。
        if (enemy.aiPhase === ctx.aiGroup) {
          enemy.targetX = player.x;
          enemy.targetZ = player.z;
        }
        applyMovement(enemy, ctx);
      }
      break;
    }
    case 'windup': {
      enemy.chargeTimer -= dt;
      enemy.hitFlashTimer = 0.1;  // 红色脉冲蓄力 VFX
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = 'charging';
        enemy.chargeTimer = 0.5;
        // 锁定目标（player 此刻位置）
        enemy.chargeTargetX = player.x;
        enemy.chargeTargetZ = player.z;
      }
      break;
    }
    case 'charging': {
      enemy.chargeTimer -= dt;
      enemy.targetX = enemy.chargeTargetX;
      enemy.targetZ = enemy.chargeTargetZ;
      const dx = enemy.targetX - enemy.x;
      const dz = enemy.targetZ - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.5) {
        const chargeSpeed = enemy.speed * 3.0 * dt;
        const actualMove = Math.min(chargeSpeed, dist);
        const nx = dx / dist;
        const nz = dz / dist;
        const halfMap = (ctx.mapSize + 10) * 0.5;
        enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
        enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));
      }
      if (enemy.chargeTimer <= 0 || dist <= 0.5) {
        enemy.chargeState = 'cooldown';
        enemy.chargeTimer = 3.0;
        enemy.attackCooldown = enemy.attackCooldownMax;
      }
      break;
    }
    case 'cooldown': {
      enemy.chargeTimer -= dt;
      if (enemy.chargeTimer <= 0) {
        enemy.chargeState = 'idle';
      }
      enemy.targetX = player.x;
      enemy.targetZ = player.z;
      applyMovement(enemy, ctx);
      break;
    }
  }
};
