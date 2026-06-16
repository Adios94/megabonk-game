/**
 * dive 行为：gargoyle 的"飞行 → 俯冲咬击 → 起飞"状态机。
 *
 * - flying: y=地形+1.8 离地, 朝玩家移动；attackCooldown 到 → diving（timer 0.4），
 *           并锁定起跳那刻的玩家坐标作为俯冲落点。
 * - diving: 高速 (speed×3) 朝锁定点俯冲 + 下降到地形+BITE_HEIGHT（不落地）；
 *           抵达锁定点 / timer 到 → 咬一口（玩家在 BITE_RADIUS 内则受伤）→ rising。
 * - rising: 上升 (y += 6×dt) 回到地形+巡航高度；timer 到 / 到达巡航高度 → flying（attackCooldown 重置）。
 *
 * 咬击为单体近身判定（贴着玩家空中咬），不再砸地、不做范围伤害/击退。
 * 玩家伤害走 `ctx.effects.damagePlayer`（armor / shield_tome / invincible 减免在那里）。
 */
import { distanceBetween } from '../../physics.ts';
import type { EnemyBehaviorFn, AiContext } from '../types.ts';
import type { EnemyState } from '../../types.ts';
import { applyMovement } from './_move.ts';

const FLY_HEIGHT = 1.8;   // 飞行/巡航离地高度（米）
const BITE_HEIGHT = 1.0;  // 俯冲最低点（≈玩家躯干高度，不触地）
const BITE_RADIUS = 2.0;  // 咬击命中半径（贴身判定，略大于纯近战以补偿俯冲落差）
const BITE_MAX_Y_DELTA = 2.8; // 防止上下层隔空咬人

export const dive: EnemyBehaviorFn = (enemy, ctx, i) => {
  const dt = ctx.dt;
  const player = ctx.player;

  switch (enemy.diveState) {
    case 'flying': {
      enemy.y = cruiseY(enemy, ctx);
      // 错峰重算 target（只在对应 aiPhase 帧计算，节省 CPU）
      if (enemy.aiPhase === ctx.aiGroup) {
        enemy.targetX = player.x;
        enemy.targetZ = player.z;
      }
      applyMovement(enemy, ctx);
      enemy.y = cruiseY(enemy, ctx);
      // applyMovement 不会改 enemy.y（type==='gargoyle' 跳过地形 y）
      // speedMult dive=1.5 在 applyMovement 里生效, 等价 legacy moveEnemy

      // 起跳判定每帧检查（不可错峰，否则俯冲起手从 60Hz 降到 15Hz，节奏卡顿）
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
      // 下降到咬击高度即止，不再砸到地面
      enemy.y = Math.max(biteY(enemy, ctx), enemy.y - 8 * dt);
      // 抵达锁定落点或俯冲计时结束 → 咬一口 + 起飞
      if (dist <= 0.5 || enemy.diveTimer <= 0) {
        biteAttack(enemy, ctx);
        enemy.diveState = 'rising';
        enemy.diveTimer = 0.5;
      }
      break;
    }
    case 'rising': {
      enemy.diveTimer -= dt;
      const targetY = cruiseY(enemy, ctx);
      enemy.y = Math.min(targetY, enemy.y + 6 * dt);
      if (enemy.diveTimer <= 0 || enemy.y >= targetY) {
        enemy.y = targetY;
        enemy.diveState = 'flying';
        enemy.attackCooldown = enemy.attackCooldownMax;
      }
      break;
    }
  }
};

function terrainY(enemy: EnemyState, ctx: AiContext): number {
  const y = ctx.getTerrainHeight(enemy.x, enemy.z);
  return Number.isFinite(y) ? y : 0;
}

function cruiseY(enemy: EnemyState, ctx: AiContext): number {
  return terrainY(enemy, ctx) + FLY_HEIGHT;
}

function biteY(enemy: EnemyState, ctx: AiContext): number {
  return terrainY(enemy, ctx) + BITE_HEIGHT;
}

function biteAttack(enemy: EnemyState, ctx: AiContext): void {
  // 单体近身咬击：玩家在咬击半径内才受伤（俯冲已被横移/计时引导到落点）。
  // damagePlayer 内部处理 alive / invincible / armor / shield_tome / damageEvent。
  const dist = distanceBetween(enemy.x, enemy.z, ctx.player.x, ctx.player.z);
  if (dist <= BITE_RADIUS && Math.abs(enemy.y - ctx.player.y) <= BITE_MAX_Y_DELTA) {
    ctx.effects.damagePlayer(enemy.damage);
  }
}
