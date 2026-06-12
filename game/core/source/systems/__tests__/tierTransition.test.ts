/**
 * tierTransition.ts 单元测试 —— portal_used → stage++ + 重置场景。
 */
import { describe, it, expect } from 'vitest';
import { tickTierTransition } from '../tierTransition.ts';
import { makeEngine } from './_fixtures.ts';
import { ALTAR_SUMMON_DURATION } from '../../config.ts';

describe('tickTierTransition', () => {
  it('没有 portal_used → 不动', () => {
    const engine = makeEngine();
    engine.state.altars = [{
      x: 0, z: 0, phase: 'ready', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    engine.state.gameTime = 100;
    const beforeTier = engine.config.tier;
    const beforeStage = engine.state.stage;
    tickTierTransition(engine);
    expect(engine.config.tier).toBe(beforeTier);
    expect(engine.state.stage).toBe(beforeStage);
    expect(engine.state.gameTime).toBe(100);
  });

  it('portal_used → stage++（最高 2），难度保持不变', () => {
    const engine = makeEngine();
    engine.config.tier = 2;
    engine.state.tier = 2;
    engine.state.stage = 1;
    engine.state.altars = [{
      x: 0, z: 0, phase: 'portal_used', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    tickTierTransition(engine);
    expect(engine.config.tier).toBe(2);
    expect(engine.state.tier).toBe(2);
    expect(engine.state.stage).toBe(2);
  });

  it('portal_used 时 stage 已是 2 → 保持 2', () => {
    const engine = makeEngine();
    engine.state.stage = 2;
    engine.state.altars = [{
      x: 0, z: 0, phase: 'portal_used', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    tickTierTransition(engine);
    expect(engine.state.stage).toBe(2);
  });

  it('portal_used → 重置 gameTime / overtimeSeconds / 清场', () => {
    const engine = makeEngine();
    engine.state.gameTime = 600;
    engine.state.overtimeSeconds = 60;
    engine.state.waveIndex = 5;
    engine.state.finalSwarm = true;
    engine.state.enemies = [{} as any, {} as any];
    engine.state.projectiles = [{} as any];
    engine.state.altars = [{
      x: 0, z: 0, phase: 'portal_used', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    tickTierTransition(engine);
    expect(engine.state.gameTime).toBe(0);
    expect(engine.state.overtimeSeconds).toBe(0);
    expect(engine.state.waveIndex).toBe(0);
    expect(engine.state.finalSwarm).toBe(false);
    expect(engine.state.enemies).toHaveLength(0);
    expect(engine.state.projectiles).toHaveLength(0);
  });

  it('portal_used → 玩家进度（hp/level/silver/武器）保留', () => {
    const engine = makeEngine();
    engine.state.player.hp = 42;
    engine.state.player.level = 7;
    engine.state.stats.silverEarned = 999;
    engine.state.altars = [{
      x: 0, z: 0, phase: 'portal_used', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    tickTierTransition(engine);
    expect(engine.state.player.hp).toBe(42);
    expect(engine.state.player.level).toBe(7);
    expect(engine.state.stats.silverEarned).toBe(999);
  });

  it('portal_used → 重新生成 altars + chests，phase 回到 playing', () => {
    const engine = makeEngine();
    engine.state.phase = 'portal_open';
    engine.state.altars = [{
      x: 0, z: 0, phase: 'portal_used', summonTimer: 0, summonDuration: ALTAR_SUMMON_DURATION,
    }];
    tickTierTransition(engine);
    expect(engine.state.altars.length).toBeGreaterThan(0);
    expect(engine.state.altars.every(a => a.phase === 'ready')).toBe(true);
    expect(engine.state.chests.length).toBeGreaterThan(0);
    expect(engine.state.phase).toBe('playing');
  });
});
