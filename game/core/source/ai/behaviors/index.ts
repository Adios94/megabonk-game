/**
 * Brain 注册表：EnemyBehavior → 行为函数。
 *
 * 加新 brain = 写一个 .ts，在这里 import + 加一行注册。
 */
import { chase } from './chase.ts';
import { ranged } from './ranged.ts';
import { charge } from './charge.ts';
import { dive } from './dive.ts';
import type { EnemyBehavior } from '../../types.ts';
import type { EnemyBehaviorFn } from '../types.ts';

export const BRAINS: Record<EnemyBehavior, EnemyBehaviorFn> = {
  chase,
  ranged,
  charge,
  dive,
};
