/**
 * dive 行为：gargoyle 的"飞行 → 俯冲 → 落地 AOE → 起飞"状态机。
 *
 * 等价于原 `updateGargoyleEnemy` + `gargoyleLandingAOE`：
 * - flying: y=3 高空, 朝玩家移动；attackCooldown 到 → diving（timer 0.4）
 * - diving: 高速 (speed×3) 直扑锁定地点 + 下降 (y -= 8×dt)；
 *           y<=0 / timer 到 → landing + 落地 AOE 伤害（半径 3）
 * - landing: 短暂停留（timer 0.3）→ rising
 * - rising: 上升 (y += 6×dt)；timer 到 / y>=3 → flying（attackCooldown 重置）
 *
 * 落地 AOE 通过 `ctx.effects.damagePlayer` 处理玩家伤害（armor / shield_tome 减免在那里），
 * 通过 `ctx.effects.applyKnockback` 推飞旁边的小怪（原代码副作用保留）。
 */
import { distanceBetween } from '../../physics.ts';
import type { EnemyBehaviorFn, AiContext } from '../types.ts';
import type { EnemyState } from '../../types.ts';
import { applyMovement } from './_move.ts';

const LANDING_AOE_RADIUS = 3;

export const dive: EnemyBehaviorFn = (enemy, ctx) => {
  const dt = ctx.dt;
  const player = ctx.player;

  switch (enemy.diveState) {
    case 'flying': {
      enemy.y = 3;
      enemy.targetX = player.x;
      enemy.targetZ = player.z;
      applyMovement(enemy, ctx);
      // applyMovement 不会改 enemy.y（type==='gargoyle' 跳过地形 y）
      // speedMult dive=1.5 在 applyMovement 里生效, 等价 legacy moveEnemy

      if (enemy.attackCooldown <= 0) {
        enemy.diveState = 'diving';
        enemy.diveTimer = 0.4;
        enemy.chargeTargetX = player.x;
        enemy.chargeTargetZ = player.z;
      }
      break;
    }
    case 'diving': {
      enemy.diveTimer -= dt;
      const dx = enemy.chargeTargetX - enemy.x;
      const dz = enemy.chargeTargetZ - enemy.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.3) {
        const diveSpeed = enemy.speed * 3.0 * dt;
        const nx = dx / dist;
        const nz = dz / dist;
        const halfMap = (ctx.mapSize + 10) * 0.5;
        enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * diveSpeed));
        enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * diveSpeed));
      }
      enemy.y = Math.max(0, enemy.y - 8 * dt);
      if (enemy.y <= 0 || enemy.diveTimer <= 0) {
        enemy.y = 0;
        enemy.diveState = 'landing';
        enemy.diveTimer = 0.3;
        landingAOE(enemy, ctx);
      }
      break;
    }
    case 'landing': {
      enemy.diveTimer -= dt;
      if (enemy.diveTimer <= 0) {
        enemy.diveState = 'rising';
        enemy.diveTimer = 0.5;
      }
      break;
    }
    case 'rising': {
      enemy.diveTimer -= dt;
      enemy.y = Math.min(3, enemy.y + 6 * dt);
      if (enemy.diveTimer <= 0 || enemy.y >= 3) {
        enemy.y = 3;
        enemy.diveState = 'flying';
        enemy.attackCooldown = enemy.attackCooldownMax;
      }
      break;
    }
  }
};

function landingAOE(enemy: EnemyState, ctx: AiContext): void {
  // 玩家受伤（damagePlayer 内部处理 alive / invincible / armor / shield_tome / damageEvent）
  const dist = distanceBetween(enemy.x, enemy.z, ctx.player.x, ctx.player.z);
  if (dist <= LANDING_AOE_RADIUS) {
    ctx.effects.damagePlayer(enemy.damage);
  }

  // 推飞旁边小怪（环境冲击, 不造成伤害）
  for (const other of ctx.enemies) {
    if (other.id === enemy.id || other.hp <= 0) continue;
    const odist = distanceBetween(enemy.x, enemy.z, other.x, other.z);
    if (odist <= LANDING_AOE_RADIUS) {
      ctx.effects.applyKnockback(other, enemy.x, enemy.z);
    }
  }
}
