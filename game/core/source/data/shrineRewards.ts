/**
 * Charge Shrine 奖励池 —— 数据驱动配置。
 *
 * 直接对应 megabonk 充能神殿（Charge Shrine）的奖励列表。每条记录包含：
 *   - reward: 奖励类型（与 ShrineRewardType 对应）
 *   - rarity: 稀有度（影响 UI 颜色 + roll 权重）
 *   - value:  数值（含义随 reward 类型而变；详见 ShrineRewardType）
 *   - weight: 在 roll 时占的权重（同 rarity 内）
 *
 * 新增奖励：在此数组末尾追加一行即可，systems/shrines.ts 与 GameInstance 自动接管。
 */
import type { ShrineRewardType, UpgradeRarity, PlayerState, ShrineRewardOption } from '../types.ts';

export interface ShrineRewardDef {
  reward: ShrineRewardType;
  rarity: UpgradeRarity;
  /** 数值含义随 reward 类型而变。
   *  - damage / pickup_range / crit_damage / luck / knockback / attack_speed
   *    / lifesteal / powerup_multiplier / elite_damage / duration
   *    / jump_height / movement_speed / difficulty: 百分比小数（0.12 = +12%）
   *  - shield: 平加护盾上限
   *  - hp_regen: HP/秒
   *  - projectile_count: 平加投射物数量 */
  value: number;
  /** 权重（同 rarity 内 roll 用），默认 1。 */
  weight?: number;
}

/**
 * 奖励池 —— 直接对应 megabonk 截图描述的奖励列表。
 * 数值与原游戏一致；权重为同 rarity 内的相对采样几率。
 */
export const SHRINE_REWARDS: ShrineRewardDef[] = [
  // ─── Common ───
  { reward: 'damage',              rarity: 'common',   value: 0.12,  weight: 2 },
  { reward: 'damage',              rarity: 'common',   value: 0.10,  weight: 2 },
  { reward: 'shield',              rarity: 'common',   value: 5,     weight: 2 },
  { reward: 'pickup_range',        rarity: 'common',   value: 0.20,  weight: 1 },
  { reward: 'crit_damage',         rarity: 'common',   value: 0.10,  weight: 2 },
  { reward: 'luck',                rarity: 'common',   value: 0.05,  weight: 1 },
  { reward: 'projectile_count',    rarity: 'common',   value: 1,     weight: 1 },
  { reward: 'hp_regen',            rarity: 'common',   value: 20,    weight: 1 },
  { reward: 'knockback',           rarity: 'common',   value: 0.10,  weight: 1 },
  { reward: 'difficulty',          rarity: 'common',   value: 0.08,  weight: 1 },
  { reward: 'lifesteal',           rarity: 'common',   value: 0.06,  weight: 1 },
  { reward: 'powerup_multiplier',  rarity: 'common',   value: 0.10,  weight: 1 },
  { reward: 'elite_damage',        rarity: 'common',   value: 0.10,  weight: 1 },
  { reward: 'duration',            rarity: 'common',   value: 0.08,  weight: 1 },
  { reward: 'jump_height',         rarity: 'common',   value: 0.10,  weight: 1 },
  { reward: 'movement_speed',      rarity: 'common',   value: 0.08,  weight: 2 },

  // ─── Uncommon ───
  { reward: 'knockback',           rarity: 'uncommon', value: 0.12,  weight: 2 },
  { reward: 'attack_speed',        rarity: 'uncommon', value: 0.072, weight: 2 },
  { reward: 'damage',              rarity: 'uncommon', value: 0.16,  weight: 2 },
  { reward: 'shield',              rarity: 'uncommon', value: 8,     weight: 1 },
  { reward: 'lifesteal',           rarity: 'uncommon', value: 0.10,  weight: 1 },

  // ─── Rare ───
  { reward: 'attack_speed',        rarity: 'rare',     value: 0.084, weight: 2 },
  { reward: 'damage',              rarity: 'rare',     value: 0.22,  weight: 2 },
  { reward: 'projectile_count',    rarity: 'rare',     value: 1,     weight: 1 },
  { reward: 'shield',              rarity: 'rare',     value: 12,    weight: 1 },
];

const RARITY_PICK_WEIGHT: Record<UpgradeRarity, number> = {
  common: 60,
  uncommon: 28,
  rare: 10,
  legendary: 2,
};

/**
 * Roll N 个不重复（按 reward 类型）的 shrine 奖励选项。Luck 偏移到稀有度选取上。
 */
export function rollShrineOptions(
  player: PlayerState,
  count: number,
  rng: () => number = Math.random,
): ShrineRewardOption[] {
  const luckLevel =
    (player.tomes.find((t) => t.type === 'luck_tome')?.level ?? 0)
    + Math.floor((player.luckBonus ?? 0) * 100); // 5% 累计 → +1 luck 等级
  const luckBoost = luckLevel * 5;

  const adjusted: Record<UpgradeRarity, number> = {
    common: Math.max(20, RARITY_PICK_WEIGHT.common - luckBoost * 2),
    uncommon: RARITY_PICK_WEIGHT.uncommon,
    rare: RARITY_PICK_WEIGHT.rare + luckBoost,
    legendary: RARITY_PICK_WEIGHT.legendary + luckBoost,
  };

  const result: ShrineRewardOption[] = [];
  const usedRewards = new Set<ShrineRewardType>();
  let attempts = 0;
  while (result.length < count && attempts < 200) {
    attempts++;
    const rarity = rollRarity(adjusted, rng);
    const pool = SHRINE_REWARDS.filter((r) => r.rarity === rarity && !usedRewards.has(r.reward));
    let pickPool = pool;
    if (pool.length === 0) {
      // 当前 rarity 抽空 → 兜底到 common
      pickPool = SHRINE_REWARDS.filter((r) => r.rarity === 'common' && !usedRewards.has(r.reward));
    }
    if (pickPool.length === 0) break;
    const def = weightedPick(pickPool, rng);
    if (!def) break;
    usedRewards.add(def.reward);
    result.push({
      id: `shrine_${def.reward}_${result.length}_${Math.floor(rng() * 1e9)}`,
      reward: def.reward,
      rarity: def.rarity,
      value: def.value,
    });
  }
  return result;
}

function rollRarity(weights: Record<UpgradeRarity, number>, rng: () => number): UpgradeRarity {
  const total = weights.common + weights.uncommon + weights.rare + weights.legendary;
  let roll = rng() * total;
  if ((roll -= weights.common) < 0) return 'common';
  if ((roll -= weights.uncommon) < 0) return 'uncommon';
  if ((roll -= weights.rare) < 0) return 'rare';
  return 'legendary';
}

function weightedPick(defs: ShrineRewardDef[], rng: () => number): ShrineRewardDef | null {
  if (defs.length === 0) return null;
  const total = defs.reduce((s, d) => s + (d.weight ?? 1), 0);
  let roll = rng() * total;
  for (const d of defs) {
    roll -= d.weight ?? 1;
    if (roll <= 0) return d;
  }
  return defs[defs.length - 1];
}
