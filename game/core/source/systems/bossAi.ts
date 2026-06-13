/**
 * Boss AI 主循环（数据驱动，按 bossType 选 phase script）。
 *
 * 每帧 `tickBossAi(boss, ctx)` 做五件事：
 *   1. 按 boss.bossType 取脚本（registry）
 *   2. 阶段切换：以 hp/maxHp 比例查脚本 phases 更新 boss.phase / speed / enraged
 *   3. 计时器倒计时：attackTimer / attackCooldown / attackAnimTimer
 *   4. attackTimer<=0 时：chooseAttack(pool) → 重置 attackTimer (随机 + base) →
 *      置 attackAnimTimer（客户端播放攻击 clip 窗口）→ executeAttack
 *   5. 朝玩家移动：dist > 2 时按 boss.speed * dt 移动 + halfMap clamp + 贴地
 *
 * Math.random 消费顺序：
 *   - chooseAttack: 1 random（pool 选）
 *   - 重置 attackTimer: 1 random
 *   - attack 内部消费见各 BossScript.attacks
 */
import { distanceBetween, normalizeDirection } from '../physics.ts';
import type { BossState } from '../types.ts';
import type { AiContext } from '../ai/types.ts';
import { chooseAttack, resolvePhase } from '../ai/bosses/common.ts';
import { BOSS_SCRIPTS } from '../ai/bosses/registry.ts';
import { getSupportHeightAt } from './collision.ts';
import { tryMoveHorizontally } from './horizontalMove.ts';

/** 攻击 clip 播放窗口（秒），与客户端 renderBoss 动画切换共用语义。 */
const ATTACK_ANIM_WINDOW = 0.8;

export function tickBossAi(boss: BossState, ctx: AiContext): void {
  // 1. 选脚本（缺失 bossType 兜底 gunner_mech）
  const script = BOSS_SCRIPTS[boss.bossType] ?? BOSS_SCRIPTS.gunner_mech;

  // 2. 阶段切换
  const phaseCfg = resolvePhase(boss, script.phases);
  boss.phase = phaseCfg.phase;
  boss.speed = phaseCfg.speed;
  boss.enraged = phaseCfg.enraged;

  // 3. 计时器
  boss.attackTimer -= ctx.dt;
  if (boss.attackCooldown > 0) {
    boss.attackCooldown -= ctx.dt;
  }
  if (boss.attackAnimTimer > 0) {
    boss.attackAnimTimer -= ctx.dt;
  }

  // 4. attack 调度
  if (boss.attackTimer <= 0) {
    boss.currentAttack = chooseAttack(phaseCfg);
    boss.attackTimer = (boss.enraged ? 1.5 : 2.5) + Math.random() * 1.0;
    boss.attackAnimTimer = ATTACK_ANIM_WINDOW;
    const fn = script.attacks[boss.currentAttack];
    if (fn) fn(boss, ctx);
  }

  // 5. 移动（追玩家） + 横向阻挡（boss 也尊重 col_/wall_）。
  const dist = distanceBetween(boss.x, boss.z, ctx.player.x, ctx.player.z);
  if (dist > 2.0) {
    const dir = normalizeDirection(ctx.player.x - boss.x, ctx.player.z - boss.z);
    const halfMap = ctx.mapSize * 0.5;
    const desiredX = Math.max(-halfMap, Math.min(halfMap, boss.x + dir.x * boss.speed * ctx.dt));
    const desiredZ = Math.max(-halfMap, Math.min(halfMap, boss.z + dir.z * boss.speed * ctx.dt));
    // boss 体型大，给一个稍宽的碰撞半径（默认 0.45 是玩家用的，boss 视觉直径 ≥ 5 → 取 1.0）。
    const moved = tryMoveHorizontally(
      ctx.geo,
      boss.x, boss.z,
      desiredX, desiredZ,
      boss.y,
      { radius: 1.0, includeClimb: true },
    );
    boss.x = moved.x;
    boss.z = moved.z;
  }

  // 6. y 跟随当前可达支撑面，避免叠层/头顶平台把 boss 直接吸到最高点。
  const supportY = getSupportHeightAt(ctx.geo, boss.x, boss.z, boss.y);
  boss.y = Number.isFinite(supportY) ? supportY : 0;
}
