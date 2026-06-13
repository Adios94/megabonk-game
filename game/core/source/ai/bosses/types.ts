/**
 * Boss phase script 的类型契约。
 *
 * 每个 boss（gunnerMech / siegeMech）导出一个 `BossScript`：
 *   - phases : 阶段表，按 hp/maxHp 比例从下往上找第一个 `<=` 命中的 phase
 *   - attacks: BossAttack tag → 攻击实现函数（每帧 attack window 调一次）
 *
 * `systems/bossAi.ts` 通过 `registry.ts` 按 `boss.bossType` 选脚本调度。
 */
import type { BossState, BossAttack, BossPhase } from '../../types.ts';
import type { AiContext } from '../types.ts';

export interface BossPhaseConfig {
  /** 触发该 phase 的 hp 阈值（hp/maxHp <= 这个值时进入）。 */
  hpRatio: number;
  phase: BossPhase;
  attacks: readonly BossAttack[];
  speed: number;
  enraged: boolean;
}

/** 单个攻击实现：(boss, ctx) => void，副作用走 ctx.effects。 */
export type BossAttackFn = (boss: BossState, ctx: AiContext) => void;

export interface BossScript {
  /** 阶段表（顺序：低 hpRatio → 高，resolvePhase 从上往下找）。 */
  readonly phases: readonly BossPhaseConfig[];
  /** 攻击注册表。可只实现该 boss 用到的 tag（dispatcher 对缺失 tag no-op）。 */
  readonly attacks: Partial<Record<BossAttack, BossAttackFn>>;
}
