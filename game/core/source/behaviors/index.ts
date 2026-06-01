/**
 * 行为 ID → 实现函数 注册表。
 *
 * 数据驱动者（data/weapons.ts）只能用 string ID 引用，这里做 ID → 函数 映射。
 * 加新行为：写一个 .ts，在这里 import + 加一行注册。
 */
import { sweepArc } from './sweepArc.ts';
import { forwardArrow } from './forwardArrow.ts';
import { bouncingShot } from './bouncingShot.ts';
import { orbitingAxe } from './orbitingAxe.ts';
import { spreadShot } from './spreadShot.ts';
import { lightningChain } from './lightningChain.ts';
import { flameAura } from './flameAura.ts';

export const BEHAVIORS = {
  sweepArc,
  forwardArrow,
  bouncingShot,
  orbitingAxe,
  spreadShot,
  lightningChain,
  flameAura,
} as const;

export type BehaviorId = keyof typeof BEHAVIORS;

export type { BehaviorContext, BehaviorEffects, BehaviorFn } from './types.ts';
