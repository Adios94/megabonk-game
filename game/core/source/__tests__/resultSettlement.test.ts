import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../config.ts';
import { getQuestProgress } from '../data/quests.ts';
import { GameInstance } from '../GameInstance.ts';
import { loadSave } from '../services/save.ts';
import { applyBondUpgrade } from '../systems/bonds.ts';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe('GameInstance result settlement', () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('adds result silver to the persistent save only once per run', () => {
    const game = new GameInstance(DEFAULT_GAME_CONFIG);
    game.start();

    const state = game.getState();
    state.stats.killCount = 10;
    state.stats.silverEarned = 7;
    state.player.level = 3;

    const result = game.getResult();
    expect(result.silverEarned).toBe(27);
    expect(loadSave().silver).toBe(27);
    expect(loadSave().totalSilverEarned).toBe(27);

    game.getResult();
    expect(loadSave().silver).toBe(27);
    expect(loadSave().totalSilverEarned).toBe(27);
  });

  it('settles weapon mastery stats only once per run', () => {
    const game = new GameInstance(DEFAULT_GAME_CONFIG);
    game.start();

    const state = game.getState();
    state.phase = 'victory';
    state.gameTime = 360;
    state.player.weapons = [state.player.weapons[0]];
    state.weaponDamageStats = [
      { weaponType: 'sword', killCount: 12, totalDamage: 52000, dps: 0 },
    ];

    game.getResult();
    expect(loadSave().stats.weaponMastery.sword).toMatchObject({
      mvpCount: 1,
      soloVictoryCount: 1,
      bestRunDamage: 52000,
    });

    game.getResult();
    expect(loadSave().stats.weaponMastery.sword).toMatchObject({
      mvpCount: 1,
      soloVictoryCount: 1,
      bestRunDamage: 52000,
    });
  });

  it('uses weapon mastery stats for quest progress', () => {
    const game = new GameInstance(DEFAULT_GAME_CONFIG);
    game.start();

    const state = game.getState();
    state.phase = 'playing';
    state.gameTime = 300;
    state.player.weapons = [{ ...state.player.weapons[0], type: 'axe' }];
    state.weaponDamageStats = [
      { weaponType: 'axe', killCount: 8, totalDamage: 10000000, dps: 0 },
      { weaponType: 'sword', killCount: 2, totalDamage: 1000, dps: 0 },
    ];

    game.getResult();

    const progressById = new Map(getQuestProgress().map(progress => [progress.questId, progress]));
    expect(progressById.get('q34')).toMatchObject({
      current: 10000000,
      completed: true,
    });
  });

  it('records bond T3 activations for bond mastery quest progress', () => {
    const game = new GameInstance(DEFAULT_GAME_CONFIG);
    game.start();

    const state = game.getState();
    state.player.bonds = [{ bondId: 'arcane', tier: 2 }];

    expect(applyBondUpgrade(state.player, 'arcane', 3)).toBe(true);
    expect(loadSave().stats.bondT3Activations.arcane).toBe(1);

    expect(applyBondUpgrade(state.player, 'arcane', 3)).toBe(false);
    expect(loadSave().stats.bondT3Activations.arcane).toBe(1);

    const progressById = new Map(getQuestProgress().map(progress => [progress.questId, progress]));
    expect(progressById.get('q42')).toMatchObject({
      current: 1,
      completed: true,
    });
  });
});
