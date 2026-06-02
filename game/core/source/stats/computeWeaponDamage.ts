/**
 * 武器伤害计算的 stat 管线封装。
 *
 * Phase 1：仅 `GameInstance.fireSword` 调用，作为 stat 管线的 smoke test。
 * Phase 3：6 把武器迁移到 ECS 武器路径时复用此函数。
 *
 * 数学等价于重构前的 `Math.round(weaponBase * dM * (isCrit ? cD : 1))`：
 *   `(weaponBase + 0) × (1 + (dM - 1)) × Π[isCrit ? cD : 1] = weaponBase × dM × ...`
 */
import { StatBlock } from './StatBlock.ts';
import { finalize } from './Stat.ts';
import type { PlayerState } from '../types.ts';

/**
 * 计算单次攻击的最终伤害。
 *
 * @param weaponBase  武器配置里的 base damage（来自 WEAPON_STATS[level].damage）
 * @param player      玩家状态（读 damageMultiplier 与 critDamage）
 * @param weaponTags  武器 tag（如 sword: ['sword','melee','physical']）—— 决定哪些 tag-限定的修饰符生效
 * @param isCrit      是否暴击（caller 决定，通常 Math.random() < player.critChance）
 */
export function computeWeaponDamage(
  weaponBase: number,
  player: PlayerState,
  weaponTags: readonly string[],
  isCrit: boolean,
): number {
  const block = new StatBlock();
  block.setBase('damage', weaponBase);

  // damageMultiplier 是"乘数倍率"（megachad=1.2 / roberto=1.0），折算为 increased
  if (player.damageMultiplier !== 1) {
    block.applyModifier({
      kind: 'increased',
      stat: 'damage',
      value: player.damageMultiplier - 1,
    });
  }

  const stat = block.getStat('damage', weaponTags);
  if (isCrit) stat.more.push(player.critDamage);
  return Math.round(finalize(stat));
}
