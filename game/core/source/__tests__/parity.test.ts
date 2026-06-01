/**
 * Phase 2-3a 关键 parity 测试 —— 全部 7 把武器在新旧路径下产生相同输出。
 *
 * 方法：
 *   1. mock Math.random 喂 NEVER_CRIT 序列（隔离 isCrit 噪音）
 *   2. 构造两个 GameInstance, 分别 useEcsWeapons = false / true
 *   3. 注入相同 state.enemies / boss / player 坐标 + 替换 player.weapons[0] 为目标武器
 *   4. 把武器 cooldownTimer 设 0 强制开火
 *   5. 直接调 (instance as any).fireWeapons(dt) 跳过 AI/spawn 等
 *   6. 断言：damageEvents 一致 + 每个 enemy.hp 一致 + boss.hp 一致 + projectiles 一致 (id 除外) + damageDealt 一致
 *
 * 任意一项失败 = 新旧路径行为漂移 = Phase 3a 没达标，禁止 commit。
 *
 * Phase 3b 完成后这个文件删除（旧 fireXxx switch 也删了，无 parity 可言）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GameInstance, DEFAULT_GAME_CONFIG } from '../index.ts';
import type { GameState, EnemyState, BossState, DamageEvent, ProjectileState, WeaponType } from '../index.ts';
import { makeEnemy, makeBoss } from '../behaviors/__tests__/_helpers.ts';

// ---------- 工具 ----------
function setupInstance(useEcsWeapons: boolean, weaponType: WeaponType, enemies: EnemyState[], boss: BossState | null = null) {
  const g = new GameInstance(DEFAULT_GAME_CONFIG);
  g.start();
  (g as unknown as { useEcsWeapons: boolean }).useEcsWeapons = useEcsWeapons;

  const state = g.getState() as GameState;
  state.enemies.length = 0;
  state.enemies.push(...enemies);
  state.boss = boss;
  state.player.x = 0;
  state.player.y = 0;
  state.player.z = 0;
  state.player.rotation = 0;
  // 替换默认 sword 为目标武器, level 1
  state.player.weapons[0] = { type: weaponType, level: 1, cooldownTimer: 0, evolved: false };
  state.damageEvents.length = 0;
  state.projectiles.length = 0;
  state.stats.damageDealt = 0;

  return { g, state };
}

function callFireWeapons(g: GameInstance, dt: number) {
  (g as unknown as { fireWeapons(dt: number): void }).fireWeapons(dt);
}

function stripId<T extends { id: number }>(p: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = p;
  return rest;
}

function assertParity(a: GameState, b: GameState) {
  // damageEvents
  expect(a.damageEvents.length).toBe(b.damageEvents.length);
  a.damageEvents.forEach((ea: DamageEvent, i: number) => {
    const eb = b.damageEvents[i];
    expect(ea.damage).toBe(eb.damage);
    expect(ea.isCrit).toBe(eb.isCrit);
    expect(ea.isPlayerDamage).toBe(eb.isPlayerDamage);
    expect(ea.weaponType).toBe(eb.weaponType);
    expect(ea.x).toBeCloseTo(eb.x, 6);
    expect(ea.y).toBeCloseTo(eb.y, 6);
    expect(ea.z).toBeCloseTo(eb.z, 6);
  });
  // enemies
  expect(a.enemies.length).toBe(b.enemies.length);
  a.enemies.forEach((ea, i) => {
    const eb = b.enemies[i];
    expect(ea.hp).toBe(eb.hp);
    expect(ea.hitFlashTimer).toBe(eb.hitFlashTimer);
    expect(ea.x).toBeCloseTo(eb.x, 6);
    expect(ea.z).toBeCloseTo(eb.z, 6);
  });
  // boss
  if (a.boss && b.boss) {
    expect(a.boss.hp).toBe(b.boss.hp);
    expect(a.boss.hitFlashTimer).toBe(b.boss.hitFlashTimer);
  } else {
    expect(a.boss).toBe(b.boss);
  }
  // projectiles (忽略 id, 因为 id 是 sequential 分配可能匹配也可能不匹配)
  expect(a.projectiles.length).toBe(b.projectiles.length);
  expect(a.projectiles.map(stripId)).toEqual(b.projectiles.map(stripId));
  // damageDealt
  expect(a.stats.damageDealt).toBe(b.stats.damageDealt);
}

interface ParityScenario {
  weapon: WeaponType;
  enemies: EnemyState[];
  boss: BossState | null;
}

const NEVER_CRIT = Array(20).fill(0.99);

const SCENARIOS: ParityScenario[] = [
  // sword: 1 enemy in arc + boss
  { weapon: 'sword', enemies: [makeEnemy(1, 0, 1.5)], boss: makeBoss(0, 2.0) },
  // bone_bouncer: 1 enemy as aim target
  { weapon: 'bone_bouncer', enemies: [makeEnemy(1, 0, 5)], boss: null },
  // axe: spawn 不依赖 enemy, count=1 placeholder
  { weapon: 'axe', enemies: [], boss: null },
  // bow: 1 enemy in range to trigger auto-aim
  { weapon: 'bow', enemies: [makeEnemy(1, 0, 5)], boss: null },
  // shotgun: spread 不依赖 enemy
  { weapon: 'shotgun', enemies: [], boss: null },
  // lightning_staff: 3 敌人在 chain 范围内 + boss
  {
    weapon: 'lightning_staff',
    enemies: [
      makeEnemy(1, 0, 3),                     // 主目标 (range 8 内最近)
      makeEnemy(2, 0, 6),                     // 在 e1 chain 半径 (8×0.6=4.8) 内吗? dist=3, yes
      makeEnemy(3, 0, 9),                     // 在 e2 chain 半径内吗? dist=3, yes
    ],
    boss: makeBoss(0, 12),                    // 远超 range, 不命中
  },
  // flame_ring: 玩家周围 aoeRadius=3.5
  { weapon: 'flame_ring', enemies: [makeEnemy(1, 0, 2), makeEnemy(2, 2.5, 0)], boss: makeBoss(0, 3) },
];

describe('Parity: 全部 7 把武器新旧路径', () => {
  let mathRandomSpy: ReturnType<typeof vi.spyOn>;
  let randSeq: number[];
  let randIdx: number;

  function freshMockRandom(seq: number[]) {
    randSeq = seq;
    randIdx = 0;
    mathRandomSpy?.mockRestore();
    mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = randSeq[randIdx % randSeq.length];
      randIdx++;
      return v;
    });
  }

  afterEach(() => { mathRandomSpy?.mockRestore(); });

  it.each(SCENARIOS)('parity: $weapon', ({ weapon, enemies, boss }) => {
    // 旧路径
    freshMockRandom(NEVER_CRIT);
    const a = setupInstance(false, weapon, enemies.map(e => ({ ...e })), boss ? { ...boss } : null);
    callFireWeapons(a.g, 1 / 60);

    // 新路径
    freshMockRandom(NEVER_CRIT);
    const b = setupInstance(true, weapon, enemies.map(e => ({ ...e })), boss ? { ...boss } : null);
    callFireWeapons(b.g, 1 / 60);

    assertParity(a.state, b.state);
  });
});
