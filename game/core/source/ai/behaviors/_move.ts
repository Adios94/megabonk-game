/**
 * AI 行为共享的"按 target 移动"逻辑。
 *
 * 等价于原 `GameInstance.moveEnemy(enemy, dt)` —— 处理速度倍率（charge/dive
 * inherent 加成、curse_tome buff、final swarm boost）+ 边界 clamp + 地形 y 跟随。
 */
import type { EnemyState } from '../../types.ts';
import type { AiContext } from '../types.ts';

export function applyMovement(enemy: EnemyState, ctx: AiContext): void {
  const dx = enemy.targetX - enemy.x;
  const dz = enemy.targetZ - enemy.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;

  let speedMult = 1.0;
  if (enemy.behavior === 'charge') speedMult = 2.0;
  else if (enemy.behavior === 'dive') speedMult = 1.5;

  // Curse tome: 敌人移动加速
  const curseTome = ctx.player.tomes.find(t => t.type === 'curse_tome');
  if (curseTome) {
    speedMult *= (1 + curseTome.level * 0.1);
  }

  // Final Swarm: 全体 +20% speed
  if (ctx.finalSwarm) {
    speedMult *= 1.2;
  }

  const moveSpeed = enemy.speed * speedMult * ctx.dt;
  const actualMove = Math.min(moveSpeed, dist);
  const nx = dx / dist;
  const nz = dz / dist;

  const halfMap = (ctx.mapSize + 10) * 0.5;
  enemy.x = Math.max(-halfMap, Math.min(halfMap, enemy.x + nx * actualMove));
  enemy.z = Math.max(-halfMap, Math.min(halfMap, enemy.z + nz * actualMove));

  // 地形 y 跟随（gargoyle 飞行单位除外）
  if (enemy.type !== 'gargoyle') {
    enemy.y = ctx.getTerrainHeight(enemy.x, enemy.z);
  }
}
