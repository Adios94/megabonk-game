/**
 * MegaBonk Quest System - 30 quests that unlock content and reward silver.
 * Progress tracked across runs via save system.
 */

import { loadSave, saveSave } from '../services/save.ts';
import type { BondId, WeaponType } from '../types.ts';
import type { SaveData } from '../services/save.ts';

export type WeaponMasteryMetric = 'mvp_count' | 'solo_victory_count' | 'best_run_damage';

export interface Quest {
  id: string;
  description: string;
  type: 'kill' | 'survive' | 'collect' | 'bond' | 'level' | 'no_damage' | 'boss' | 'weapons_used' | 'weapon_mastery' | 'bond_t3';
  target: number;
  reward: QuestReward;
  weaponType?: WeaponType;
  bondId?: BondId;
  metric?: WeaponMasteryMetric;
}

export interface QuestReward {
  type: 'weapon_unlock' | 'character_unlock' | 'weapon_slot' | 'silver' | 'tome_unlock';
  value: string | number;
}

export interface QuestProgress {
  questId: string;
  current: number;
  completed: boolean;
  claimed: boolean;
}

export const QUESTS: Quest[] = [
  // Kill quests
  { id: 'q1', description: 'quest.kill_100', type: 'kill', target: 100, reward: { type: 'silver', value: 50 } },
  { id: 'q2', description: 'quest.kill_500', type: 'kill', target: 500, reward: { type: 'silver', value: 150 } },
  { id: 'q3', description: 'quest.kill_1000', type: 'kill', target: 1000, reward: { type: 'silver', value: 200 } },
  { id: 'q4', description: 'quest.kill_2500', type: 'kill', target: 2500, reward: { type: 'silver', value: 300 } },
  { id: 'q5', description: 'quest.kill_5000', type: 'kill', target: 5000, reward: { type: 'silver', value: 400 } },
  { id: 'q6', description: 'quest.kill_10000', type: 'kill', target: 10000, reward: { type: 'silver', value: 500 } },

  // Survival quests
  { id: 'q7', description: 'quest.survive_2min', type: 'survive', target: 120, reward: { type: 'silver', value: 100 } },
  { id: 'q8', description: 'quest.survive_5min', type: 'survive', target: 300, reward: { type: 'silver', value: 200 } },
  { id: 'q9', description: 'quest.survive_7min', type: 'survive', target: 420, reward: { type: 'silver', value: 200 } },

  // Level quests
  { id: 'q11', description: 'quest.reach_level_10', type: 'level', target: 10, reward: { type: 'silver', value: 100 } },
  { id: 'q12', description: 'quest.reach_level_20', type: 'level', target: 20, reward: { type: 'silver', value: 200 } },
  { id: 'q13', description: 'quest.reach_level_30', type: 'level', target: 30, reward: { type: 'silver', value: 300 } },
  { id: 'q14', description: 'quest.reach_level_40', type: 'level', target: 40, reward: { type: 'silver', value: 500 } },

  // Bond quests（替代旧武器进化任务）
  { id: 'q15', description: 'quest.first_bond', type: 'bond', target: 1, reward: { type: 'silver', value: 200 } },
  { id: 'q16', description: 'quest.bond_3', type: 'bond', target: 3, reward: { type: 'silver', value: 350 } },
  { id: 'q17', description: 'quest.bond_5', type: 'bond', target: 5, reward: { type: 'silver', value: 500 } },
  { id: 'q18', description: 'quest.bond_8', type: 'bond', target: 8, reward: { type: 'character_unlock', value: 'skateboard_skeleton' } },

  // Boss quests
  { id: 'q19', description: 'quest.defeat_boss', type: 'boss', target: 1, reward: { type: 'silver', value: 200 } },
  { id: 'q20', description: 'quest.defeat_boss_3', type: 'boss', target: 3, reward: { type: 'character_unlock', value: 'roberto' } },
  { id: 'q21', description: 'quest.defeat_boss_5', type: 'boss', target: 5, reward: { type: 'silver', value: 500 } },
  { id: 'q22', description: 'quest.defeat_boss_10', type: 'boss', target: 10, reward: { type: 'silver', value: 600 } },

  // No damage quests
  { id: 'q23', description: 'quest.no_damage_1min', type: 'no_damage', target: 1, reward: { type: 'silver', value: 150 } },
  { id: 'q24', description: 'quest.no_damage_3', type: 'no_damage', target: 3, reward: { type: 'silver', value: 300 } },
  { id: 'q25', description: 'quest.no_damage_5', type: 'no_damage', target: 5, reward: { type: 'silver', value: 500 } },

  // Silver collection quests
  { id: 'q26', description: 'quest.collect_500_silver', type: 'collect', target: 500, reward: { type: 'silver', value: 100 } },
  { id: 'q27', description: 'quest.collect_2000_silver', type: 'collect', target: 2000, reward: { type: 'silver', value: 250 } },
  { id: 'q28', description: 'quest.collect_5000_silver', type: 'collect', target: 5000, reward: { type: 'silver', value: 500 } },
  { id: 'q29', description: 'quest.collect_10000_silver', type: 'collect', target: 10000, reward: { type: 'silver', value: 1000 } },
  { id: 'q30', description: 'quest.collect_25000_silver', type: 'collect', target: 25000, reward: { type: 'silver', value: 1500 } },

  // 唯一局外 +1 武器槽任务：累计装备过 7 把不同武器
  { id: 'q31', description: 'quest.use_7_weapons', type: 'weapons_used', target: 7, reward: { type: 'weapon_slot', value: 1 } },

  // Weapon mastery quests（精选武器挑战）
  { id: 'q32', description: 'quest.sword_mvp_3', type: 'weapon_mastery', weaponType: 'sword', metric: 'mvp_count', target: 3, reward: { type: 'silver', value: 250 } },
  { id: 'q33', description: 'quest.sword_solo_victory', type: 'weapon_mastery', weaponType: 'sword', metric: 'solo_victory_count', target: 1, reward: { type: 'silver', value: 500 } },
  { id: 'q34', description: 'quest.axe_damage_10000000', type: 'weapon_mastery', weaponType: 'axe', metric: 'best_run_damage', target: 10000000, reward: { type: 'silver', value: 300 } },
  { id: 'q35', description: 'quest.bone_bouncer_mvp_3', type: 'weapon_mastery', weaponType: 'bone_bouncer', metric: 'mvp_count', target: 3, reward: { type: 'silver', value: 300 } },
  { id: 'q36', description: 'quest.bone_bouncer_damage_10000000', type: 'weapon_mastery', weaponType: 'bone_bouncer', metric: 'best_run_damage', target: 10000000, reward: { type: 'silver', value: 300 } },
  { id: 'q37', description: 'quest.lightning_staff_mvp_3', type: 'weapon_mastery', weaponType: 'lightning_staff', metric: 'mvp_count', target: 3, reward: { type: 'silver', value: 350 } },
  { id: 'q38', description: 'quest.lightning_staff_damage_10000000', type: 'weapon_mastery', weaponType: 'lightning_staff', metric: 'best_run_damage', target: 10000000, reward: { type: 'silver', value: 450 } },
  { id: 'q39', description: 'quest.flame_ring_solo_victory', type: 'weapon_mastery', weaponType: 'flame_ring', metric: 'solo_victory_count', target: 1, reward: { type: 'silver', value: 600 } },
  { id: 'q40', description: 'quest.flame_ring_damage_10000000', type: 'weapon_mastery', weaponType: 'flame_ring', metric: 'best_run_damage', target: 10000000, reward: { type: 'silver', value: 450 } },

  // Bond mastery quests（全部羁绊 T3 挑战）
  { id: 'q41', description: 'quest.iron_blood_t3', type: 'bond_t3', bondId: 'iron_blood', target: 1, reward: { type: 'silver', value: 450 } },
  { id: 'q42', description: 'quest.arcane_t3', type: 'bond_t3', bondId: 'arcane', target: 1, reward: { type: 'silver', value: 600 } },
  { id: 'q43', description: 'quest.zero_range_t3', type: 'bond_t3', bondId: 'zero_range', target: 1, reward: { type: 'silver', value: 600 } },
  { id: 'q44', description: 'quest.ember_trail_t3', type: 'bond_t3', bondId: 'ember_trail', target: 1, reward: { type: 'silver', value: 450 } },
  { id: 'q45', description: 'quest.volley_t3', type: 'bond_t3', bondId: 'volley', target: 1, reward: { type: 'silver', value: 600 } },
  { id: 'q46', description: 'quest.bone_crush_t3', type: 'bond_t3', bondId: 'bone_crush', target: 1, reward: { type: 'silver', value: 450 } },
  { id: 'q47', description: 'quest.arc_conductor_t3', type: 'bond_t3', bondId: 'arc_conductor', target: 1, reward: { type: 'silver', value: 550 } },
  { id: 'q48', description: 'quest.poison_master_t3', type: 'bond_t3', bondId: 'poison_master', target: 1, reward: { type: 'silver', value: 500 } },
  { id: 'q49', description: 'quest.hunter_mark_t3', type: 'bond_t3', bondId: 'hunter_mark', target: 1, reward: { type: 'silver', value: 550 } },
];

function getQuestStatProgress(save: SaveData, quest: Quest): number {
  switch (quest.type) {
    case 'kill':
      return save.stats.totalKills;
    case 'survive':
      return save.stats.bestSurvivalTime;
    case 'level':
      return save.stats.highestLevel;
    case 'bond':
      return save.stats.bondsActivated;
    case 'boss':
      return save.stats.bossesDefeated;
    case 'no_damage':
      return save.stats.noDamageRuns;
    case 'collect':
      return save.totalSilverEarned;
    case 'weapons_used':
      return save.stats.uniqueWeaponsUsed.length;
    case 'weapon_mastery': {
      if (!quest.weaponType || !quest.metric) return 0;
      const mastery = save.stats.weaponMastery[quest.weaponType];
      if (!mastery) return 0;
      switch (quest.metric) {
        case 'mvp_count':
          return mastery.mvpCount;
        case 'solo_victory_count':
          return mastery.soloVictoryCount;
        case 'best_run_damage':
          return mastery.bestRunDamage;
      }
    }
    case 'bond_t3':
      return quest.bondId ? (save.stats.bondT3Activations[quest.bondId] ?? 0) : 0;
    default:
      return 0;
  }
}

function isQuestClaimed(save: SaveData, questId: string): boolean {
  return save.questsCompleted.includes(questId);
}

function isQuestCompleted(save: SaveData, quest: Quest): boolean {
  return getQuestStatProgress(save, quest) >= quest.target;
}

/**
 * Detect quests that reached completion since the previous snapshot.
 * Does not apply rewards — players must claim manually in the quest panel.
 */
export function checkQuestCompletion(previousCompleteIds?: ReadonlySet<string>): string[] {
  const save = loadSave();
  const newlyCompleted: string[] = [];

  for (const quest of QUESTS) {
    if (!isQuestCompleted(save, quest)) continue;
    if (previousCompleteIds?.has(quest.id)) continue;
    newlyCompleted.push(quest.id);
  }

  return newlyCompleted;
}

/**
 * Claim a completed quest reward. Returns true if the reward was applied.
 */
export function claimQuest(questId: string): boolean {
  const save = loadSave();
  if (isQuestClaimed(save, questId)) return false;

  const quest = QUESTS.find(q => q.id === questId);
  if (!quest || !isQuestCompleted(save, quest)) return false;

  applyQuestReward(save, quest.reward);
  save.questsCompleted.push(questId);
  saveSave(save);
  return true;
}

function applyQuestReward(save: SaveData, reward: QuestReward): void {
  switch (reward.type) {
    case 'silver':
      save.silver += reward.value as number;
      save.totalSilverEarned += reward.value as number;
      break;
    case 'weapon_unlock':
      if (!save.weaponsUnlocked.includes(reward.value as string)) {
        save.weaponsUnlocked.push(reward.value as string);
      }
      break;
    case 'character_unlock':
      if (!save.charactersUnlocked.includes(reward.value as string)) {
        save.charactersUnlocked.push(reward.value as string);
      }
      break;
    case 'weapon_slot':
      save.extraWeaponSlots = 1; // 局外最多 +1 槽
      break;
    case 'tome_unlock':
      // Tomes are always available; this is for future use
      break;
  }
}

/**
 * Get progress info for all quests.
 */
export function getQuestProgress(): QuestProgress[] {
  const save = loadSave();
  const result: QuestProgress[] = [];

  for (const quest of QUESTS) {
    const claimed = isQuestClaimed(save, quest.id);
    const raw = getQuestStatProgress(save, quest);
    const completed = raw >= quest.target;

    result.push({
      questId: quest.id,
      current: completed ? quest.target : Math.min(raw, quest.target),
      completed,
      claimed,
    });
  }

  return result;
}

/**
 * Get the count of completed quests (claimed or ready to claim).
 */
export function getCompletedQuestCount(): number {
  const save = loadSave();
  let count = 0;
  for (const quest of QUESTS) {
    if (isQuestCompleted(save, quest)) count += 1;
  }
  return count;
}
