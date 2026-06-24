/**
 * altars.ts 单元测试 —— 飞碟 / 传送门状态机。
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
  ALTAR_BOSS_RESPAWN_COOLDOWN,
  ALTAR_INTERACT_RADIUS,
  ALTAR_INTERACT_MAX_Y_DELTA,
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

  it('每个 tier 都生成 teleporterCount 个飞碟（设计统一为 1）', () => {
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

  it('关卡 spawn_altar 标记随机抽取固定数量', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {
        altars: [
          { x: 10, z: 0 },
          { x: -10, z: 0 },
          { x: 0, z: 10 },
        ],
      },
      chestSpawns: [],
    };
    const altars = generateAltars({ ...config, tier: 1 });
    expect(altars).toHaveLength(1);
    expect(altars[0].phase).toBe('ready');
  });

  it('关卡 spawn_altar 会排除离玩家出生点最近的候选', () => {
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {
        altars: [
          { x: 1, z: 0 },
          { x: 10, z: 0 },
          { x: 20, z: 0 },
          { x: 30, z: 0 },
          { x: 40, z: 0 },
        ],
      },
      chestSpawns: [],
    };
    const altars = generateAltars({ ...config, tier: 1 }, { x: 0, z: 0 });
    expect(altars).toHaveLength(1);
    expect(altars[0]).not.toMatchObject({ x: 1, z: 0 });
  });
});

describe('tickAltars — 状态机', () => {
  it('ready + 玩家进入范围 → 自动 summoning（无需按键）', () => {
    const engine = makeEngine();
    engine.state.altars = [altar()];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.input.interact = false;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('summoning');
  });

  it('ready 但玩家在范围外 → 保持 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar()];
    engine.state.player.x = ALTAR_INTERACT_RADIUS + 1;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
  });

  it('ready + 玩家在水平范围内但高度差过大 → 保持 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ y: 0 })];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.y = ALTAR_INTERACT_MAX_Y_DELTA + 1;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('ready');
  });

  it('summoning 时玩家高度差过大 → 进度回落', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'summoning', summonTimer: 0.5, y: 0 })];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.y = ALTAR_INTERACT_MAX_Y_DELTA + 1;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('summoning');
    expect(engine.state.altars[0].summonTimer).toBeLessThan(0.5);
  });

  it('portal_ready + 水平范围内但高度差过大 + 按 E → 保持 portal_ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'portal_ready', y: 0 })];
    engine.state.player.x = 0;
    engine.state.player.z = 0;
    engine.state.player.y = ALTAR_INTERACT_MAX_Y_DELTA + 1;
    engine.input.interact = true;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('portal_ready');
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

  it('summoning 时玩家走出范围 → 进度缓慢回落，未归零前保持 summoning', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'summoning', summonTimer: 0.5 })];
    engine.state.player.x = ALTAR_INTERACT_RADIUS + 5;
    tickAltars(engine, 0.05);
    expect(engine.state.altars[0].phase).toBe('summoning');
    expect(engine.state.altars[0].summonTimer).toBeLessThan(0.5);
    expect(engine.state.altars[0].summonTimer).toBeGreaterThan(0);
  });

  it('summoning 时玩家走出范围且进度回落到 0 → 回到 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({ phase: 'summoning', summonTimer: 0.01 })];
    engine.state.player.x = ALTAR_INTERACT_RADIUS + 5;
    tickAltars(engine, 0.5);
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

  it('cooldown 结束后恢复 ready', () => {
    const engine = makeEngine();
    engine.state.altars = [altar({
      phase: 'cooldown',
      cooldownTimer: 0.05,
      cooldownDuration: ALTAR_BOSS_RESPAWN_COOLDOWN,
    })];
    tickAltars(engine, 0.1);
    expect(engine.state.altars[0].phase).toBe('ready');
    expect(engine.state.altars[0].cooldownTimer).toBe(0);
  });
});

describe('onBossDefeated', () => {
  it('第一关 boss_active → portal_ready；其它 phase 不动', () => {
    const engine = makeEngine();
    engine.config.tier = 2;
    engine.state.tier = 2;
    engine.state.stage = 1;
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

  it('第二关 boss_active → cooldown，不生成进入下一关的传送门', () => {
    const engine = makeEngine();
    engine.state.stage = 2;
    engine.state.altars = [altar({ phase: 'boss_active', summonTimer: ALTAR_SUMMON_DURATION })];
    onBossDefeated(engine);
    expect(engine.state.altars[0].phase).toBe('cooldown');
    expect(engine.state.altars[0].summonTimer).toBe(0);
    expect(engine.state.altars[0].cooldownTimer).toBe(ALTAR_BOSS_RESPAWN_COOLDOWN);
  });
});

describe('hasReadyBossTrigger', () => {
  it('任意飞碟 boss_active → true', () => {
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
