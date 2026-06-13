/**
 * 敌人数据驱动定义。
 *
 * Phase 4a 将原 `config.ts` 的 `ENEMY_CONFIGS` 迁移到此处，
 * 以 `data/enemies.ts` 作为敌人数据的**单一 source of truth**。
 *
 * 加一个敌人 = 在 ENEMIES 加一行 +（如需新行为）在 ai/behaviors/ 加一个 .ts。
 *
 * - `behavior`: 主 brain 标签，对应 `ai/behaviors/{chase,ranged,charge,dive}.ts`
 * - `modifier`: 可选叠加行为（必如 necromancer 召唤），对应 `ai/modifiers/*.ts`
 * - `tags`: Phase 5 升级用（"+10% 火焰伤害" 等通过 tag superset-AND 过滤）
 */
import type { EnemyType, EnemyBehavior } from '../types.ts';

export type EnemyModifierId = 'necromancer';

export interface EnemyDef {
  hp: number;
  damage: number;
  speed: number;
  /** 主 brain 标签，决定 ai/behaviors/ 里哪个函数 tick 它 */
  behavior: EnemyBehavior;
  /** 叠加行为，每帧 brain tick 之后调用（可选） */
  modifier?: EnemyModifierId;
  xpReward: number;
  attackCooldown: number;
  isElite: boolean;
  firstAppear: number;
  spawnWeight: number;
  preferredRange?: number;
  tags?: readonly string[];
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  skeleton_soldier: { hp: 15,  damage: 5,  speed: 3.0, behavior: 'chase',  xpReward: 1,  attackCooldown: 1.5, isElite: false, firstAppear: 0,   spawnWeight: 40, tags: ['undead', 'physical'] },
  zombie:           { hp: 30,  damage: 10, speed: 1.5, behavior: 'chase',  xpReward: 3,  attackCooldown: 2.5, isElite: false, firstAppear: 60,  spawnWeight: 25, tags: ['undead', 'physical'] },
  skeleton_archer:  { hp: 12,  damage: 7,  speed: 2.5, behavior: 'ranged', xpReward: 3,  attackCooldown: 3.0, isElite: false, firstAppear: 120, spawnWeight: 15, preferredRange: 8,  tags: ['undead', 'ranged'] },
  skeleton_knight:  { hp: 120, damage: 20, speed: 3.5, behavior: 'charge', xpReward: 25, attackCooldown: 2.0, isElite: true,  firstAppear: 180, spawnWeight: 5,                       tags: ['undead', 'physical', 'elite'] },
  necromancer:      { hp: 80,  damage: 15, speed: 2.0, behavior: 'ranged', modifier: 'necromancer', xpReward: 30, attackCooldown: 4.0, isElite: true, firstAppear: 240, spawnWeight: 3, preferredRange: 10, tags: ['undead', 'spell', 'elite'] },
  gargoyle:         { hp: 200, damage: 25, speed: 4.0, behavior: 'dive',   xpReward: 40, attackCooldown: 3.0, isElite: true,  firstAppear: 300, spawnWeight: 6,                       tags: ['flying', 'elite'] },
};

// ─────────────────────────────────────────────────────────────────────────
// Legacy alias —— 保持外部 API 不变（@minigame/core 公开导出）。
// Phase 4 完成 + Phase 5/6 评估后可考虑废弃。
// ─────────────────────────────────────────────────────────────────────────

/** @deprecated use ENEMIES + EnemyDef */
export const ENEMY_CONFIGS = ENEMIES;

/** @deprecated use EnemyDef */
export type EnemyConfig = EnemyDef;
