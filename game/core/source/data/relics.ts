import type { PlayerState, RelicId, RelicRarity } from '../types.ts';

export interface RelicDef {
  id: RelicId;
  code: string;
  name: string;
  rarity: RelicRarity;
  emoji: string;
  description: string;
}

export const RELICS: Record<RelicId, RelicDef> = {
  keen_lens: {
    id: 'keen_lens',
    code: 'R01',
    name: '锐眼透镜',
    rarity: 'common',
    emoji: '🔍',
    description: '暴击率 +3%',
  },
  small_shield_charm: {
    id: 'small_shield_charm',
    code: 'R02',
    name: '小盾护符',
    rarity: 'common',
    emoji: '🔰',
    description: '护盾值 +2，最大护盾值 +5',
  },
  blood_fang: {
    id: 'blood_fang',
    code: 'R03',
    name: '嗜血牙',
    rarity: 'uncommon',
    emoji: '🦷',
    description: '击杀回 2 HP（精英 +3）',
  },
  pact_coin: {
    id: 'pact_coin',
    code: 'R04',
    name: '契约硬币',
    rarity: 'common',
    emoji: '🪙',
    description: '击杀敌人额外 +1 金币',
  },
  arsenal_badge: {
    id: 'arsenal_badge',
    code: 'R05',
    name: '武库徽章',
    rarity: 'rare',
    emoji: '🎖️',
    description: '每把 Lv10 武器全局伤害 +4%',
  },
  elite_writ: {
    id: 'elite_writ',
    code: 'R06',
    name: '精英猎令',
    rarity: 'uncommon',
    emoji: '📜',
    description: '对精英伤害 +10%',
  },
  regen_core: {
    id: 'regen_core',
    code: 'R07',
    name: '再生核心',
    rarity: 'uncommon',
    emoji: '💚',
    description: 'hpRegen +0.5/s',
  },
  magazine_expander: {
    id: 'magazine_expander',
    code: 'R08',
    name: '弹匣扩槽',
    rarity: 'rare',
    emoji: '🧰',
    description: 'projectileBonus +1',
  },
  hourglass: {
    id: 'hourglass',
    code: 'R09',
    name: '时间沙漏',
    rarity: 'legendary',
    emoji: '⏳',
    description: 'overtime 内全伤 +0.12%/s（按层累加）',
  },
  iron_heart: {
    id: 'iron_heart',
    code: 'R10',
    name: '铁心',
    rarity: 'legendary',
    emoji: '🫀',
    description: 'maxHp +12%；护甲 +2',
  },
};

export const ALL_RELIC_IDS = Object.keys(RELICS) as RelicId[];

const RELIC_RARITY_WEIGHTS: Array<{
  maxLevel: number;
  weights: Record<RelicRarity, number>;
}> = [
  { maxLevel: 10, weights: { common: 68, uncommon: 26, rare: 6, legendary: 0 } },
  { maxLevel: 25, weights: { common: 50, uncommon: 34, rare: 14, legendary: 2 } },
  { maxLevel: 50, weights: { common: 32, uncommon: 38, rare: 24, legendary: 6 } },
  { maxLevel: 75, weights: { common: 20, uncommon: 32, rare: 35, legendary: 13 } },
  { maxLevel: Infinity, weights: { common: 12, uncommon: 28, rare: 38, legendary: 22 } },
];

export function getRelicStack(player: PlayerState, relicId: RelicId): number {
  return player.relicStacks?.[relicId] ?? 0;
}

type RelicStacks = Partial<Record<RelicId, number>>;

export function rollRelicRarity(playerLevel: number, luckBonus = 0, rng: () => number = Math.random): RelicRarity {
  const row = RELIC_RARITY_WEIGHTS.find(r => playerLevel <= r.maxLevel) ?? RELIC_RARITY_WEIGHTS[RELIC_RARITY_WEIGHTS.length - 1];
  const rareShift = Math.max(0, luckBonus) * 100;
  const weights = {
    common: Math.max(0, row.weights.common - rareShift * 0.55),
    uncommon: Math.max(0, row.weights.uncommon - rareShift * 0.25),
    rare: row.weights.rare + rareShift * 0.55,
    legendary: row.weights.legendary + rareShift * 0.25,
  };
  const total = weights.common + weights.uncommon + weights.rare + weights.legendary;
  let roll = rng() * total;
  for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) {
    roll -= weights[rarity];
    if (roll <= 0) return rarity;
  }
  return 'common';
}

export function rollRelic(
  playerLevel: number,
  luckBonus = 0,
  rng: () => number = Math.random,
  relicStacks: RelicStacks = {},
): RelicDef {
  const rarity = rollRelicRarity(playerLevel, luckBonus, rng);
  const pool = ALL_RELIC_IDS.map(id => RELICS[id]).filter(relic => relic.rarity === rarity);
  const choices = pool.length > 0 ? pool : ALL_RELIC_IDS.map(id => RELICS[id]).filter(relic => relic.rarity === 'common');
  const unowned = choices.filter(relic => (relicStacks[relic.id] ?? 0) <= 0);
  if (unowned.length > 0) {
    return unowned[Math.floor(rng() * unowned.length)] ?? RELICS.keen_lens;
  }

  const weighted = choices.map(relic => {
    const stacks = relicStacks[relic.id] ?? 0;
    return {
      relic,
      // Once a rarity bucket is fully discovered, repeats are still possible but
      // high-stack relics become much less likely than low-stack relics.
      weight: 1 / Math.pow(stacks + 1, 2),
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.relic;
  }
  return choices[choices.length - 1] ?? RELICS.keen_lens;
}
