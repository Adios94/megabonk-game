/**
 * MegaBonk Quest System - 30 quests that unlock content and reward silver.
 * Progress tracked across runs via save system.
 */

import { loadSave, saveSave } from './save.ts';

export interface Quest {
  id: string;
  description: string;
  type: 'kill' | 'survive' | 'collect' | 'evolve' | 'level' | 'no_damage' | 'boss';
  target: number;
  reward: QuestReward;
}

export interface QuestReward {
  type: 'weapon_unlock' | 'character_unlock' | 'weapon_slot' | 'silver' | 'tome_unlock';
  value: string | number;
}

export interface QuestProgress {
  questId: string;
  current: number;
  completed: boolean;
}

export const QUESTS: Quest[] = [
  // Kill quests
  { id: 'q1', description: 'quest.kill_100', type: 'kill', target: 100, reward: { type: 'silver', value: 50 } },
  { id: 'q2', description: 'quest.kill_500', type: 'kill', target: 500, reward: { type: 'silver', value: 150 } },
  { id: 'q3', description: 'quest.kill_1000', type: 'kill', target: 1000, reward: { type: 'weapon_slot', value: 1 } },
  { id: 'q4', description: 'quest.kill_2500', type: 'kill', target: 2500, reward: { type: 'silver', value: 300 } },
  { id: 'q5', description: 'quest.kill_5000', type: 'kill', target: 5000, reward: { type: 'weapon_slot', value: 1 } },
  { id: 'q6', description: 'quest.kill_10000', type: 'kill', target: 10000, reward: { type: 'silver', value: 500 } },

  // Survival quests
  { id: 'q7', description: 'quest.survive_2min', type: 'survive', target: 120, reward: { type: 'weapon_unlock', value: 'revolver' } },
  { id: 'q8', description: 'quest.survive_5min', type: 'survive', target: 300, reward: { type: 'weapon_unlock', value: 'lightning_staff' } },
  { id: 'q9', description: 'quest.survive_7min', type: 'survive', target: 420, reward: { type: 'silver', value: 200 } },

  // Level quests
  { id: 'q11', description: 'quest.reach_level_10', type: 'level', target: 10, reward: { type: 'silver', value: 100 } },
  { id: 'q12', description: 'quest.reach_level_20', type: 'level', target: 20, reward: { type: 'weapon_unlock', value: 'katana' } },
  { id: 'q13', description: 'quest.reach_level_30', type: 'level', target: 30, reward: { type: 'silver', value: 300 } },
  { id: 'q14', description: 'quest.reach_level_40', type: 'level', target: 40, reward: { type: 'silver', value: 500 } },

  // Evolution quests
  { id: 'q15', description: 'quest.first_evolution', type: 'evolve', target: 1, reward: { type: 'silver', value: 200 } },
  { id: 'q16', description: 'quest.evolve_3', type: 'evolve', target: 3, reward: { type: 'weapon_unlock', value: 'shotgun' } },
  { id: 'q17', description: 'quest.evolve_5', type: 'evolve', target: 5, reward: { type: 'silver', value: 500 } },
  { id: 'q18', description: 'quest.evolve_8', type: 'evolve', target: 8, reward: { type: 'character_unlock', value: 'skateboard_skeleton' } },

  // Boss quests
  { id: 'q19', description: 'quest.defeat_boss', type: 'boss', target: 1, reward: { type: 'silver', value: 200 } },
  { id: 'q20', description: 'quest.defeat_boss_3', type: 'boss', target: 3, reward: { type: 'character_unlock', value: 'roberto' } },
  { id: 'q21', description: 'quest.defeat_boss_5', type: 'boss', target: 5, reward: { type: 'silver', value: 500 } },
  { id: 'q22', description: 'quest.defeat_boss_10', type: 'boss', target: 10, reward: { type: 'weapon_slot', value: 1 } },

  // No damage quests
  { id: 'q23', description: 'quest.no_damage_1min', type: 'no_damage', target: 1, reward: { type: 'silver', value: 150 } },
  { id: 'q24', description: 'quest.no_damage_3', type: 'no_damage', target: 3, reward: { type: 'silver', value: 300 } },
  { id: 'q25', description: 'quest.no_damage_5', type: 'no_damage', target: 5, reward: { type: 'weapon_unlock', value: 'fire_staff' } },

  // Silver collection quests
  { id: 'q26', description: 'quest.collect_500_silver', type: 'collect', target: 500, reward: { type: 'silver', value: 100 } },
  { id: 'q27', description: 'quest.collect_2000_silver', type: 'collect', target: 2000, reward: { type: 'silver', value: 250 } },
  { id: 'q28', description: 'quest.collect_5000_silver', type: 'collect', target: 5000, reward: { type: 'weapon_unlock', value: 'tornado' } },
  { id: 'q29', description: 'quest.collect_10000_silver', type: 'collect', target: 10000, reward: { type: 'silver', value: 1000 } },
  { id: 'q30', description: 'quest.collect_25000_silver', type: 'collect', target: 25000, reward: { type: 'weapon_slot', value: 1 } },
];

/**
 * Check and award quests based on current save data stats.
 * Returns newly completed quest IDs this call.
 */
export function checkQuestCompletion(): string[] {
  const save = loadSave();
  const newlyCompleted: string[] = [];

  for (const quest of QUESTS) {
    if (save.questsCompleted.includes(quest.id)) continue;

    let progress = 0;
    switch (quest.type) {
      case 'kill':
        progress = save.stats.totalKills;
        break;
      case 'survive':
        progress = save.stats.bestSurvivalTime;
        break;
      case 'level':
        progress = save.stats.highestLevel;
        break;
      case 'evolve':
        progress = save.stats.totalEvolutions;
        break;
      case 'boss':
        progress = save.stats.bossesDefeated;
        break;
      case 'no_damage':
        progress = save.stats.noDamageRuns;
        break;
      case 'collect':
        progress = save.totalSilverEarned;
        break;
    }

    if (progress >= quest.target) {
      save.questsCompleted.push(quest.id);
      newlyCompleted.push(quest.id);
      applyQuestReward(save, quest.reward);
    }
  }

  if (newlyCompleted.length > 0) {
    saveSave(save);
  }

  return newlyCompleted;
}

function applyQuestReward(save: ReturnType<typeof loadSave>, reward: QuestReward): void {
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
      save.extraWeaponSlots += reward.value as number;
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
    const completed = save.questsCompleted.includes(quest.id);
    let current = 0;

    if (!completed) {
      switch (quest.type) {
        case 'kill':
          current = save.stats.totalKills;
          break;
        case 'survive':
          current = save.stats.bestSurvivalTime;
          break;
        case 'level':
          current = save.stats.highestLevel;
          break;
        case 'evolve':
          current = save.stats.totalEvolutions;
          break;
        case 'boss':
          current = save.stats.bossesDefeated;
          break;
        case 'no_damage':
          current = save.stats.noDamageRuns;
          break;
        case 'collect':
          current = save.totalSilverEarned;
          break;
      }
    } else {
      current = quest.target;
    }

    result.push({
      questId: quest.id,
      current: Math.min(current, quest.target),
      completed,
    });
  }

  return result;
}

/**
 * Get the count of completed quests.
 */
export function getCompletedQuestCount(): number {
  const save = loadSave();
  return save.questsCompleted.length;
}
