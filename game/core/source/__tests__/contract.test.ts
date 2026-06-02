/**
 * Framework Contract — Runtime Tests
 *
 * 这些测试验证 @minigame/core 的公开 API 在运行时仍然按契约工作。
 * 配合 .claude/skills/check-contract（静态检查），形成完整重构兜底。
 *
 * 重构期间这些测试必须始终通过。失败 = 公开 API 漂移 = 框架契约被破坏。
 *
 * 静态检查：bash .claude/skills/check-contract/check.sh
 * 运行检查：pnpm --filter @minigame/core exec vitest run
 *
 * 详见 docs/contract.md 第二章 "锁定签名"。
 */

import { describe, it, expect } from 'vitest';
import {
  GameInstance,
  DEFAULT_GAME_CONFIG,
  TICK_INTERVAL_MS,
} from '../index.ts';
import type { InputState } from '../index.ts';

const NEUTRAL_INPUT: InputState = {
  moveX: 0,
  moveY: 0,
  dash: false,
  skill1: false,
  skill2: false,
  jump: false,
  slide: false,
};

describe('Framework Contract — exported constants', () => {
  it('TICK_INTERVAL_MS is a positive number', () => {
    expect(typeof TICK_INTERVAL_MS).toBe('number');
    expect(TICK_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('DEFAULT_GAME_CONFIG has required GameConfig fields', () => {
    expect(DEFAULT_GAME_CONFIG).toBeTypeOf('object');
    expect(typeof DEFAULT_GAME_CONFIG.tickIntervalMs).toBe('number');
    // The other GameConfig fields are project-specific (mapSize, character, tier)
    // but tickIntervalMs is required by the framework client to drive the loop.
  });
});

describe('Framework Contract — GameInstance class', () => {
  it('is constructable with DEFAULT_GAME_CONFIG without throwing', () => {
    expect(() => new GameInstance(DEFAULT_GAME_CONFIG)).not.toThrow();
  });

  it('start() runs without throwing', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    expect(() => g.start()).not.toThrow();
  });

  it('tick() returns a boolean', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    const finished = g.tick();
    expect(typeof finished).toBe('boolean');
  });

  it('applyAction(input) accepts a valid InputState', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    expect(() => g.applyAction(NEUTRAL_INPUT)).not.toThrow();
  });

  it('getResult() returns an object', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    const result = g.getResult();
    expect(result).toBeTypeOf('object');
    expect(result).not.toBeNull();
  });
});

describe('Framework Contract — GameState shape', () => {
  it('getState() returns object with framework-required keys', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    const state = g.getState();
    expect(state).toBeTypeOf('object');
    expect(typeof state.tick).toBe('number');
    expect(typeof state.running).toBe('boolean');
    expect(typeof state.finished).toBe('boolean');
  });

  it('GameState contains project-locked fields (player, enemies, projectiles)', () => {
    // These keys are part of the project's own contract between core and client.
    // Renaming requires updating both producer and consumer in lockstep.
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    const state = g.getState();
    expect(state).toHaveProperty('player');
    expect(state).toHaveProperty('enemies');
    expect(state).toHaveProperty('projectiles');
    expect(Array.isArray(state.enemies)).toBe(true);
    expect(Array.isArray(state.projectiles)).toBe(true);
  });

  it('tick number monotonically increases after tick()', () => {
    const g = new GameInstance(DEFAULT_GAME_CONFIG);
    g.start();
    const before = g.getState().tick;
    g.tick();
    const after = g.getState().tick;
    expect(after).toBeGreaterThan(before);
  });
});
