/**
 * altars.ts 单元测试 —— 祭坛 / 传送门状态机。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tickAltars,
  generateAltars,
  onBossDefeated,
  hasReadyBossTrigger,
  consumePortalUsed,
} from '../altars.ts';
import { makeEngine } from './_fixtures.ts';
import {
  ALTAR_INTERACT_RADIUS,
  ALTAR_SUMMON_DURATION,
  TIER_CONFIGS,
} from '../../config.ts';
import type { AltarState } from '../../types.ts';

function altar(over: Partial<AltarState> = {}): AltarState {
  return {
    x: 0,
    z: 0,
    phase: 'ready',
    summonTimer: 0,
    summonDuration: ALTAR_SUMMON_DURATION,
    ...over,
  };
}

describe('generateAltars', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5));
  afterEach(() => vi.restoreAllMocks());

  it('每个 tier 都生成 teleporterCount 个祭坛（设计统一为 1）', () => {
    const config = makeEngine().config;
    for (const tier of [1, 2, 3] as const) {
      const altars = generateAltars({ ...config, tier });
      expect(altars).toHaveLength(TIER_CONFIGS[tier].teleporterCount);
      for (const a of altars) {
        expect(a.phase).toBe('ready');
        expect(a.summonTimer).toBe(0);
        expect(a.summonDuration).toBe(ALTAR_SUMMON_DURATION);
      }
    }
  });
});

describe('tickAltars — 状态机', () => {
  it('ready + 玩家在范围内 + 按 E → summoning（边缘触发）', () => {
    const engine = makeEngine();
    engine.state.altars = [altar()];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('summoning');
  });

  it('ready 但玩家不按 E → 保持 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar()];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.input.interact = false;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
  });

  it('ready 但玩家在范围外 + 按 E → 保持 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar()];
    engine.state.player.x = ALTAR_INTERACT_RADIUS + 1;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
  });

  it('summoning 倒计时满 → boss_active', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({
      phase: 'summoning',
      summonTimer: ALTAR_SUMMON_DURATION - 0.01,
    })];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('boss_active');
  });

  it('summoning 时玩家走出范围 → 重置 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'summoning', summonTimer: 0.5 })];
    engine.state.player.x = ALTAR_INTERACT_RADIUS + 5;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
    expect(engine.state.altars[0].summonTimer).toBe(0);
  });

  it('boss_active 阶段不响应玩家 / 按键', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'boss_active' })];
    engine.state.player.x = 0;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('boss_active');
  });

  it('portal_ready + 范围内 + 按 E → portal_used', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'portal_ready' })];
    engine.state.player.x = 0;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('portal_used');
  });

  it('player.alive=false 时整个 system 跳过', () => {
    const engine = makeEngine();
    engine.state.player.alive = false;
    engine.state.altars = [altar()];
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
  });
});

describe('onBossDefeated', () => {
  it('boss_active → portal_ready；其它 phase 不动', () => {
    const engine = makeEngine();
    engine.state.altars = [
      altar({ phase: 'boss_active' }),
      altar({ phase: 'ready' }),
      altar({ phase: 'portal_ready' }),
    ];
    onBossDefeated(engine);
    expect(engine.state.altars[0].phase).toBe('portal_ready');
    expect(engine.state.altars[1].phase).toBe('ready');
    expect(engine.state.altars[2].phase).toBe('portal_ready');
  });
});

describe('hasReadyBossTrigger', () => {
  it('任意祭坛 boss_active → true', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'boss_active' })];
    expect(hasReadyBossTrigger(engine)).toBe(true);
  });
  it('全是 ready / summoning → false', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'summoning' }), altar()];
    expect(hasReadyBossTrigger(engine)).toBe(false);
  });
});

describe('consumePortalUsed', () => {
  it('有 portal_used → 返回 true 并清空 altars', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'portal_used' })];
    expect(consumePortalUsed(engine)).toBe(true);
    expect(engine.state.altars).toHaveLength(0);
  });
  it('没有 portal_used → 返回 false 并保留 altars', () => {
    const engine = makeEngine();
    engine.state.altars = [altar(), altar({ phase: 'boss_active' })];
    expect(consumePortalUsed(engine)).toBe(false);
    expect(engine.state.altars).toHaveLength(2);
  });
});
