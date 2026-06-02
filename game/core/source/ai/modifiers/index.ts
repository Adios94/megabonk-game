/**
 * Modifier 注册表：EnemyModifierId → modifier 函数。
 *
 * Modifier 在 brain tick 之后执行（叠加行为，例如召唤）。
 * 加新 modifier = 写一个 .ts，在这里 import + 加一行注册。
 */
import { necromancer } from './necromancer.ts';
import type { EnemyModifierFn } from '../types.ts';
import type { EnemyModifierId } from '../../data/enemies.ts';

export const MODIFIERS: Record<EnemyModifierId, EnemyModifierFn> = {
  necromancer,
};
