/**
 * Boss AI 主循环。
 *
 * 每帧 `tickBossAi(boss, ctx, phaseScript)` 做四件事（顺序 = legacy `updateBossAI` 一致）：
 *   1. 阶段切换：以 hp/maxHp 比例查表更新 boss.phase / speed / enraged
 *   2. 计时器倒计时：attackTimer / attackCooldown
 *   3. attackTimer<=0 时：chooseAttack(pool) → 重置 attackTimer (随机 + base) → executeAttack
 *   4. 朝玩家移动：dist > 2 时按 boss.speed * dt 移动 + halfMap clamp
 *
 * Math.random 消费顺序（必须与 legacy 一致）：
 *   - chooseAttack: 1 random（pool 选）
 *   - 重置 attackTimer: 1 random
 *   - attack 内部消费见 SKELETON_KING_ATTACKS
 *
 * Phase 切换不消费 random（纯比较）。
 */
import { distanceBetween, normalizeDirection } from '../physics.ts';
import type { BossState } from '../types.ts';
import type { AiContext } from '../ai/types.ts';
import {
  SKELETON_KING_ATTACKS,
  chooseAttack,
  resolvePhase,
  type BossPhaseConfig,
} from '../ai/bosses/skeletonKing.ts';

export function tickBossAi(
  boss: BossState,
  ctx: AiContext,
  phaseScript: readonly BossPhaseConfig[] = [], // 预留：未来可换其他 boss 的 phase 表
): void {
  void phaseScript;  // SKELETON_KING_PHASES 当前是 skeletonKing 内部定义, 不从外部传

  // 1. 阶段切换
  const phaseCfg = resolvePhase(boss);
  boss.phase = phaseCfg.phase;
  boss.speed = phaseCfg.speed;
  boss.enraged = phaseCfg.enraged;

  // 2. 计时器
  boss.attackTimer -= ctx.dt;
  if (boss.attackCooldown > 0) {
    boss.attackCooldown -= ctx.dt;
  }

  // 3. attack 调度
  if (boss.attackTimer <= 0) {
    boss.currentAttack = chooseAttack(phaseCfg);
    boss.attackTimer = (boss.enraged ? 1.5 : 2.5) + Math.random() * 1.0;
    const fn = SKELETON_KING_ATTACKS[boss.currentAttack];
    if (fn) fn(boss, ctx);
  }

  // 4. 移动（追玩家）
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist > 2.0) {
    const dir = normalizeDirection(ctx.player.x - boss.x, ctx.player.z - boss.z);
    const halfMap = ctx.mapSize * 0.5;
    boss.x = Math.max(-halfMap, Math.min(halfMap, boss.x + dir.x * boss.speed * ctx.dt));
    boss.z = Math.max(-halfMap, Math.min(halfMap, boss.z + dir.z * boss.speed * ctx.dt));
  }
}
