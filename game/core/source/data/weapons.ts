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
 * 武器注册表 (Phase 3a: 全部 7 把武器都已迁移到 ECS 行为路径)。
 *
 * 加一把武器 = 在 WEAPONS 加一行 +（如需新行为）在 behaviors/ 加一个 .ts。
 *
 * tag 划分是 Phase 5 的种子（升级如 "+10% 火焰伤害" 通过 tag superset-AND 过滤生效）。
 * Phase 3 还没有 tagged modifier，tag 此刻不影响数值；Phase 5 接入后零行为代码改动直接生效。
 */
export const WEAPONS: Partial<Record<WeaponType, WeaponDef>> = {
  sword:           { tags: ['sword', 'melee', 'physical'],                          behavior: 'sweepArc' },
  bone_bouncer:    { tags: ['bone_bouncer', 'projectile', 'bouncing'],              behavior: 'bouncingShot' },
  axe:             { tags: ['axe', 'projectile', 'orbiting', 'melee'],              behavior: 'orbitingAxe' },
  bow:             { tags: ['bow', 'projectile', 'physical', 'piercing'],           behavior: 'forwardArrow' },
  lightning_staff: { tags: ['lightning_staff', 'spell', 'lightning', 'chain'],      behavior: 'lightningChain' },
  flame_ring:      { tags: ['flame_ring', 'spell', 'fire', 'aoe'],                  behavior: 'flameAura' },
  shotgun:         { tags: ['shotgun', 'projectile', 'spread'],                     behavior: 'spreadShot' },
};
