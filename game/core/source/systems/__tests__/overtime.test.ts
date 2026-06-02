/**
 * overtime.ts 单元测试。
 */
import { describe, it, expect } from 'vitest';
import { tickOvertime } from '../overtime.ts';
import { makeEngine } from './_fixtures.ts';
import { REGULAR_GAME_DURATION } from '../../config.ts';

describe('tickOvertime', () => {
  it('gameTime < REGULAR_GAME_DURATION → 不累加', () => {
    const engine = makeEngine();
    engine.state.gameTime = REGULAR_GAME_DURATION - 1;
    engine.state.overtimeSeconds = 0;
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBe(0);
  });

  it('gameTime >= REGULAR_GAME_DURATION → 按 dt 累加', () => {
    const engine = makeEngine();
    engine.state.gameTime = REGULAR_GAME_DURATION + 0.1;
    engine.state.overtimeSeconds = 0;
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBeCloseTo(0.5);
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBeCloseTo(1.0);
  });

  it('player.alive=false → 不累加', () => {
    const engine = makeEngine();
    engine.state.gameTime = REGULAR_GAME_DURATION + 10;
    engine.state.overtimeSeconds = 0;
    engine.state.player.alive = false;
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBe(0);
  });

  it('phase=defeat → 不累加', () => {
    const engine = makeEngine();
    engine.state.gameTime = REGULAR_GAME_DURATION + 10;
    engine.state.overtimeSeconds = 0;
    engine.state.phase = 'defeat';
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBe(0);
  });

  it('phase=portal_open（玩家在传送门前犹豫）→ 仍累加', () => {
    const engine = makeEngine();
    engine.state.gameTime = REGULAR_GAME_DURATION + 10;
    engine.state.overtimeSeconds = 0;
    engine.state.phase = 'portal_open';
    tickOvertime(engine, 0.5);
    expect(engine.state.overtimeSeconds).toBeCloseTo(0.5);
  });
});
