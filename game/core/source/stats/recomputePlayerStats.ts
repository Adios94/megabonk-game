/**
 * 玩家 stat 重算 —— 纯函数版。
 *
 * Phase 5 把原 `GameInstance.recalculateTomeStats` 的逻辑抽到此处，走 stat pipeline:
 *   1. 把 charCfg + shopBonuses 设为各 stat 的 base
 *   2. 遍历 player.tomes, 把每个 tome 的 modifiers 喂进 StatBlock
 *   3. finalize 各 stat 写回 player 的单值字段（speed / damageMultiplier / ...）
 *
 * 数学等价于原 switch case (验证见 __tests__/recomputePlayerStats.test.ts)。
 *
 * **不计算 contextual tome 效果** —— thorns/knockback/luck/xp_gain/curse 在各自代码
 * 路径直接读 player.tomes，本函数不参与。
 */
import { StatBlock } from './StatBlock.ts';
import { applyCharacterTrait } from './applyCharacterTrait.ts';
import { TOMES } from '../data/tomes.ts';
import { getRelicStack } from '../data/relics.ts';
import { bondGlobalModifiers, bondWeaponDamageMods } from '../data/bonds.ts';
import { getTomePower } from '../tomeProgression.ts';
import {
  PLAYER_BASE_CRIT_DAMAGE,
  PLAYER_PICKUP_RADIUS,
  CHARACTER_CONFIGS,
  PLAYER_MOVE_SPEED_MULTIPLIER,
} from '../config.ts';
import type { PlayerState, CharacterType } from '../types.ts';

/** Shop 全局 bonus（getShopBonuses 输出）—— Phase 5 仅读这几个字段。 */
export interface ShopBonuses {
  damage?: number;
  speed?: number;
  critChance?: number;
  armor?: number;
  pickupRadius?: number;
  maxHp?: number;
  // 其它字段（hp / pickupRadiusFactor 等）由 GameInstance 自己读取，不在这里
}

/**
 * 用 stat pipeline 重算 player 的 7 个数值 stat 字段。直接 mutate player（与
 * 原 recalculateTomeStats 行为一致）。
 *
 * **副作用**：写 `player.speed / damageMultiplier / attackSpeedMultiplier /
 * critChance / critDamage / armor / pickupRadius / maxHp / consumableDropMult /
 * characterTraitXpBonus`.
 * 不写 level / xp / weapons / tomes，不治疗玩家。
 */
export function recomputePlayerStats(
  player: PlayerState,
  character: CharacterType,
  shop: ShopBonuses,
): void {
  const charCfg = CHARACTER_CONFIGS[character];
  const block = new StatBlock();

  // ─── 1. base ───
  block.setBase('moveSpeed',     (charCfg.speed      + (shop.speed       ?? 0)) * PLAYER_MOVE_SPEED_MULTIPLIER);
  block.setBase('damageMult',    charCfg.damage      + (shop.damage      ?? 0));
  block.setBase('maxHp',         charCfg.hp          + (shop.maxHp       ?? 0));
  block.setBase('attackSpeed',   1.0);
  block.setBase('critChance',    charCfg.critChance  + (shop.critChance  ?? 0));
  block.setBase('critDamage',    PLAYER_BASE_CRIT_DAMAGE);
  block.setBase('armor',         charCfg.armor       + (shop.armor       ?? 0));
  block.setBase('pickupRadius',  PLAYER_PICKUP_RADIUS + (shop.pickupRadius ?? 0));
  block.setBase('consumableDropMult', 1.0);

  // ─── 2. tomes ───
  for (const tome of player.tomes) {
    const def = TOMES[tome.type];
    if (!def) continue;
    for (const m of def.modifiers(getTomePower(tome))) {
      block.applyModifier(m);
    }
  }

  const keenLens = getRelicStack(player, 'keen_lens');
  if (keenLens > 0) {
    block.applyModifier({ kind: 'added', stat: 'critChance', value: 0.03 * keenLens });
  }

  const ironHeart = getRelicStack(player, 'iron_heart');
  if (ironHeart > 0) {
    block.applyModifier({ kind: 'increased', stat: 'maxHp', value: 0.12 * ironHeart });
    block.applyModifier({ kind: 'added', stat: 'armor', value: 2 * ironHeart });
  }

  // ─── 2b. 羁绊全局 stat 修饰符（护甲 / damageMult / 攻速 / 暴击）───
  for (const m of bondGlobalModifiers(player)) {
    block.applyModifier(m);
  }
  // 羁绊「按武器 type」的无条件伤害修饰符缓存到 player，供 computeWeaponDamage 读取。
  player.bondDamageMods = bondWeaponDamageMods(player);

  // ─── 3. finalize → 写回 player ───
  player.speed                 = block.getFinal('moveSpeed');
  player.damageMultiplier      = block.getFinal('damageMult');
  player.attackSpeedMultiplier = block.getFinal('attackSpeed');
  player.critChance            = block.getFinal('critChance');
  player.critDamage            = block.getFinal('critDamage');
  player.armor                 = block.getFinal('armor');
  player.pickupRadius          = block.getFinal('pickupRadius');
  player.maxHp                 = block.getFinal('maxHp');
  player.hp                    = Math.min(player.hp, player.maxHp);
  player.consumableDropMult    = block.getFinal('consumableDropMult');

  player.characterTraitXpBonus = 0;
  player.characterTraitCritChanceBonus = 0;
  player.characterTraitCritDamageBonus = 0;
  player.characterTraitAttackSpeedBonus = 0;
  applyCharacterTrait(player, character);
}
