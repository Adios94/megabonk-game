import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG } from '../config.ts';
import { GameInstance } from '../GameInstance.ts';
import { loadSave } from '../services/save.ts';

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
});
