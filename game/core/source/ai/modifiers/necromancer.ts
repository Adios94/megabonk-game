/**
 * necromancer modifier：每 8 秒召唤 2-3 个 skeleton_soldier 围绕自身。
 *
 * 等价于原 `necromancerSummon` —— 在 ranged brain 之上叠加召唤逻辑：
 * - summonCooldown 倒计时
 * - 触发时调 spawnEnemyByType (mode='necromancerSummon') 创建小怪
 * - 受 150 enemies 上限保护（与原代码一致, 不同于 wave spawn 的 MAX_ENEMIES=100）
 *
 * 关键的 Math.random 消费顺序（parity 测试关心）：
 *   1. count = 2 + floor(random()*2)            → 1 random
 *   2. per summon: angle = ... + random()*0.5  → 1 random
 *   3. per summon: spawnDist = 2 + random()*1.5 → 1 random
 *   4. factory.spawnEnemy: orbitAngle = random()*2π → 1 random (in spawnEnemy)
 */
import type { EnemyModifierFn } from '../types.ts';

const SUMMON_COOLDOWN = 8.0;
const SUMMON_CAP = 150;

export const necromancer: EnemyModifierFn = (enemy, ctx) => {
  enemy.summonCooldown -= ctx.dt;
  if (enemy.summonCooldown > 0) return;

  enemy.summonCooldown = SUMMON_COOLDOWN;

  const count = 2 + Math.floor(Math.random() * 2);  // 2 or 3
  for (let i = 0; i < count; i++) {
    if (ctx.enemies.length >= SUMMON_CAP) break;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const spawnDist = 2 + Math.random() * 1.5;
    ctx.effects.spawnEnemyByType(
      'skeleton_soldier',
      enemy.x + Math.cos(angle) * spawnDist,
      enemy.z + Math.sin(angle) * spawnDist,
      { mode: 'necromancerSummon' },
    );
  }
};
