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
import { bondConditionalDamageInc } from '../data/bonds.ts';
import type { BondDamageTarget } from '../data/bonds.ts';
import type { PlayerState, WeaponType } from '../types.ts';

// 复用的 scratch StatBlock：computeWeaponDamage 是同步、非重入的叶子函数，
// 每次命中都 new StatBlock（内部含 Map + 数组）会在高密度战斗里造成可观 GC 压力。
// 用单例 + reset() 复用，数学结果完全等价。
const scratchBlock = new StatBlock();

/**
 * 计算单次攻击的最终伤害。
 *
 * @param weaponBase  武器配置里的 base damage（来自 WEAPON_STATS[level].damage）
 * @param player      玩家状态（读 damageMultiplier 与 critDamage）
 * @param weaponTags  武器 tag（如 sword: ['sword','melee','physical']）—— 决定哪些 tag-限定的修饰符生效
 * @param isCrit      是否暴击（caller 决定，通常 Math.random() < player.critChance）
 * @param target      可选命中目标（敌人/boss）—— 用于羁绊的条件/机制增伤（贴身、高血量、易伤、烙印…）
 */
export function computeWeaponDamage(
  weaponBase: number,
  player: PlayerState,
  weaponTags: readonly string[],
  isCrit: boolean,
  target?: BondDamageTarget | null,
): number {
  const block = scratchBlock;
  block.reset();
  block.setBase('damage', weaponBase);

  // damageMultiplier 是"乘数倍率"（megachad=1.2 / roberto=1.0），折算为 increased
  if (player.damageMultiplier !== 1) {
    block.applyModifier({
      kind: 'increased',
      stat: 'damage',
      value: player.damageMultiplier - 1,
    });
  }

  // 羁绊无条件 T1 伤害（按武器 type 限定的 increased，已预算到 bondDamageMods）
  if (player.bondDamageMods) {
    for (const m of player.bondDamageMods) block.applyModifier(m);
  }

  // 羁绊条件/机制增伤（贴身、高血量、易伤、烙印、铁血叠层/暴怒…）
  // 约定 weaponTags[0] === 武器 type（见 data/weapons.ts）。
  const weaponType = weaponTags[0] as WeaponType;
  const condInc = bondConditionalDamageInc(player, weaponType, target);
  if (condInc !== 0) {
    block.applyModifier({ kind: 'increased', stat: 'damage', value: condInc });
  }

  const stat = block.getStat('damage', weaponTags);
  if (isCrit) stat.more.push(player.critDamage);
  return Math.round(finalize(stat));
}
