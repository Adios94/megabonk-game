/**
 * AI 系统主循环。
 *
 * 每帧调用 `tickEnemyAi(enemies, ctx)` 派发：
 *   1. 如果 def.modifier 不为空 → 调用 modifier(enemy, ctx)
 *   2. 每个 enemy 按 def.behavior 找到 brain 函数 → 调用 brain(enemy, ctx, i)
 *
 * dispatch 顺序（per enemy）：modifier → brain。
 *
 * 这与 legacy `updateEnemiesAI` 一致 —— 原代码在 necromancer 上先调 summon
 * （召唤位置基于 enemy 当前坐标），然后才 computeEnemyTarget + moveEnemy。
 * 颠倒会让召唤位置漂移到本帧 move 之后的坐标，破坏 parity。
 *
 * Boss AI 由独立的 `bossAi.ts` 处理，不在本系统内（boss 不在 enemies 数组）。
 */
import type { EnemyState } from '../types.ts';
import type { AiContext } from '../ai/types.ts';
import { ENEMIES } from '../data/enemies.ts';
import { BRAINS } from '../ai/behaviors/index.ts';
import { MODIFIERS } from '../ai/modifiers/index.ts';

export function tickEnemyAi(enemies: EnemyState[], ctx: AiContext): void {
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    const def = ENEMIES[enemy.type];
    if (!def) continue;

    if (def.modifier) {
      const mod = MODIFIERS[def.modifier];
      if (mod) mod(enemy, ctx);
    }

    const brain = BRAINS[def.behavior];
    if (brain) brain(enemy, ctx, i);
  }
}
