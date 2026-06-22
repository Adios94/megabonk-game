/**
 * charge 行为：skeleton_knight 的"蓄力 → 冲撞 → 冷却"状态机。
 *
 * 等价于原 `updateChargeEnemy`：
 * - idle: dist<15 + 冷却到 → windup（timer 0.8）；否则正常 chase + 移动
 * - windup: 减 timer, 持续 hitFlashTimer=0.1（红色蓄力提示）, 不移动；timer 到 → charging（timer 0.5）
 * - charging: 高速 (speed×3) 直冲锁定坐标, 不通过 applyMovement（避开速度倍率叠加）；
 *             timer 到 / 抵达 → cooldown（timer COOLDOWN_DURATION, attackCooldown 重置）
 * - cooldown: 前 STRIKE_RECOVERY 站定播攻击/收招动画；之后慢速 chase 追玩家；timer 到 → idle
 *
 * 注：charging 不调用 applyMovement，y 不跟随地形（保留原行为，可能略飘但视觉上短暂）
 */
import type { EnemyBehaviorFn } from '../types.ts';
import { applyMovement } from './_move.ts';
import { tryMoveHorizontally } from '../../systems/horizontalMove.ts';

const CHARGE_RADIUS = 0.4; // 与 _move.ts 的 ENEMY_RADIUS 一致
const COOLDOWN_DURATION = 3.0;
/**
 * 冷却起始的"收招/挥击"窗口：cooldown 进入后 STRIKE_RECOVERY 秒内 enemy 站定不动，
 * 让客户端的 Punch 攻击动画有完整的 fade-in→hold→fade-out 时间（之前直接进慢速追击，
 * 0.4s 的 attackCooldown 高位窗口被两次 0.2s crossfade 吃掉，看起来像没播）。
 * 客户端用 chargeState==='cooldown' && chargeTimer > COOLDOWN_DURATION-STRIKE_RECOVERY 判定。
 */
export const CHARGE_STRIKE_RECOVERY = 0.7;
export const CHARGE_COOLDOWN_DURATION = COOLDOWN_DURATION;

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
      enemy.hitFlashWeaponType = undefined;
      enemy.hitFlashColor = undefined;
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
        const targetX = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
        const targetZ = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));
        // 冲撞尊重墙体：撞墙停 / 沿墙滑，不再冲进墙里（仍由 chargeTimer 收尾进 cooldown）
        const moved = tryMoveHorizontally(ctx.geo, enemy.x, enemy.z, targetX, targetZ, enemy.y, {
          radius: CHARGE_RADIUS,
          includeClimb: true,
        });
        enemy.x = moved.x;
        enemy.z = moved.z;
      }
      if (enemy.chargeTimer <= 0 || dist <= 0.5) {
        enemy.chargeState = 'cooldown';
        enemy.chargeTimer = COOLDOWN_DURATION;
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
      // 前 STRIKE_RECOVERY 秒站定播攻击/收招动画，避免边跑边挥拳让攻击姿势看不出来。
      if (enemy.chargeTimer < COOLDOWN_DURATION - CHARGE_STRIKE_RECOVERY) {
        applyMovement(enemy, ctx);
      }
      break;
    }
  }
};
