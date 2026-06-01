/**
 * 武器数据驱动定义。
 *
 * 加一把武器 = 在 WEAPONS 加一行 +（如需新行为）在 behaviors/ 加一个 .ts。
 *
 * Phase 2: 仅 sword 在此（其它 6 把走旧 GameInstance.fireXxx switch）
 * Phase 3: 7 把武器全部迁移，GameInstance 旧 switch 删除
 */
import type { WeaponType } from '../types.ts';
import type { BehaviorId } from '../behaviors/index.ts';

export interface WeaponDef {
  /** 武器 tag（PoE 风格 stat 修饰符过滤用：sword=['sword','melee','physical']） */
  tags: readonly string[];
  /** 触发的行为 ID（注册在 behaviors/index.ts 的 BEHAVIORS 表里） */
  behavior: BehaviorId;
}

/**
 * 武器注册表（仅含已迁移到 ECS 路径的武器）。
 *
 * 不在表里的武器自动 fall back 到 `GameInstance.fireWeapon` 的旧 switch，
 * 直到 Phase 3 全部迁移完。
 */
export const WEAPONS: Partial<Record<WeaponType, WeaponDef>> = {
  sword: {
    tags: ['sword', 'melee', 'physical'],
    behavior: 'sweepArc',
  },
};
