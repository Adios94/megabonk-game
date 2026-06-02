/**
 * Overtime 系统。
 *
 * 设计文档：docs/boss-loop-redesign.md (§6, §10)
 *
 * 触发条件：
 *   - `gameTime >= REGULAR_GAME_DURATION` (=540s)
 *   - 且 `phase` 仍处于可玩态（playing / portal_open / boss_intro / boss_fight）
 *   - 且玩家未主动进入传送门（state.altars 中没有 portal_used）
 *
 * 一旦满足，每帧给 `state.overtimeSeconds` 累加 dt。
 * 系数公式见 factories/spawnEnemy.ts —— 每 OVERTIME_STEP_SECONDS 一档。
 *
 * 退出条件：
 *   - 玩家进入传送门（tier 推进流程会重置 overtimeSeconds = 0）
 *   - 玩家死亡（phase 变 'defeat'，本系统跳过；结算时仍读 overtimeSeconds 区分死法）
 */
import { REGULAR_GAME_DURATION } from '../config.ts';
import type { Engine } from './types.ts';

export function tickOvertime(engine: Engine, dt: number): void {
  const state = engine.state;
  if (!state.player.alive) return;
  if (state.phase === 'defeat' || state.phase === 'menu' || state.phase === 'paused') return;
  if (state.gameTime < REGULAR_GAME_DURATION) return;
  state.overtimeSeconds += dt;
}
