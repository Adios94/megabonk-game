/**
 * 生成系统 —— 波次 / mini-boss / 单怪 / boss 进场。
 *
 * 入口：tickSpawning(engine, dt)
 *   - 检查 phase: boss_intro 时跳过；boss_fight 只把刷怪效率降半
 *   - 维护 finalSwarm 标志 (gameTime 480-540)
 *   - 推 spawnTimer + miniBossTimer
 *   - cooldown 到 → spawn 一组怪
 *   - 每帧调 checkBossSpawn 看是否到点起 boss
 *
 * 实际怪物构造由 factories/spawnEnemy 处理，本文件只负责"何时 / 多少 / 哪些"。
 */
import {
  WAVE_CONFIGS,
  TIER_CONFIGS,
  BOSS_HP,
  BOSS_INTRO_DURATION,
  REGULAR_GAME_DURATION,
  FINAL_SWARM_START_TIME,
  STEP_HEIGHT,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';
import { spawnEnemy } from '../factories/spawnEnemy.ts';
import { getTomePower } from '../data/tomeProgression.ts';
import type { EnemyType } from '../types.ts';
import type { Engine } from './types.ts';
import { hasReadyBossTrigger } from './altars.ts';
import { isBlockedHorizontallyAt, getTerrainHeightAt } from './levelGeometry.ts';

const SPAWN_MIN_RADIUS = 5;
const SPAWN_MAX_RADIUS = 10;
const SPAWN_ATTEMPTS = 24;
const ENEMY_SPAWN_RADIUS = 0.4;
const EDGE_CHECK_RING = ENEMY_SPAWN_RADIUS + 0.15;
const EDGE_MAX_HEIGHT_DELTA = STEP_HEIGHT + 0.25;
const STAGE_TWO_BOSS_HP_MULTIPLIER_PER_SUMMON = 1.3;
const STAGE_TWO_BOSS_DAMAGE_MULTIPLIER_PER_SUMMON = 1.2;
const STAGE_TWO_BOSS_CHEST_DROP_CHANCE_PER_SUMMON = 0.4;
const OVERTIME_ELITE_CHANCE_PER_SECOND = 1 / 300;
const OVERTIME_ELITE_CHANCE_CAP = 0.65;
const BOSS_ENEMY_SPAWN_RATE_MULTIPLIER = 0.5;
const BOSS_OVERTIME_GROWTH_MULTIPLIER = 0.1;
/** 刷怪面**高于**玩家的上限：基本不许在玩家头顶之上的台面刷（=空中刷出）。 */
const SPAWN_MAX_ABOVE_PLAYER = 1.0;
/** 刷怪面**低于**玩家的上限：允许怪从下方的地面/低层来（玩家在高台时怪在地面集结）。 */
const SPAWN_MAX_BELOW_PLAYER = 6.0;

export function tickSpawning(engine: Engine, dt: number): void {
  // boss 出场动画仍暂停；正式战斗期间只降低刷怪效率，不清场也不禁刷。
  if (engine.state.phase === 'boss_intro') return;

  const wave = getCurrentWave(engine);
  if (!wave) return;
  const bossSpawnRateMultiplier = getBossEnemySpawnRateMultiplier(engine);

  // 更新 waveIndex
  for (let i = 0; i < WAVE_CONFIGS.length; i++) {
    if (engine.state.gameTime >= WAVE_CONFIGS[i].timeStart && engine.state.gameTime < WAVE_CONFIGS[i].timeEnd) {
      engine.state.waveIndex = i;
      break;
    }
  }

  // Final Swarm 阶段（gameTime 480-540, 即 boss 来之前的 1 分钟）
  // 注：finalSwarm 作为刷怪/提示状态不延续到 overtime；属性成长在 spawnEnemy 中单独继承半速曲线。
  const isFinalSwarm = engine.state.gameTime >= FINAL_SWARM_START_TIME && engine.state.gameTime < REGULAR_GAME_DURATION;
  engine.state.finalSwarm = isFinalSwarm;

  const shrineDifficulty = engine.state.player.difficultyMult ?? 1;
  const effectiveOvertimeSeconds = getBossAdjustedOvertimeSeconds(engine);
  const overtimePressure = getOvertimePressure(effectiveOvertimeSeconds) * shrineDifficulty;
  const maxAlive = isFinalSwarm
    ? 150
    : Math.ceil(wave.maxAlive * overtimePressure);
  const maxEnemiesLimit = isFinalSwarm
    ? 150
    : Math.ceil(engine.config.maxEnemies * overtimePressure);

  if (engine.state.enemies.length >= maxAlive) return;
  if (engine.state.enemies.length >= maxEnemiesLimit) return;

  // Mini-boss spawning（gameTime ≥ 180 后每 120 秒一只）
  if (engine.state.gameTime >= 180) {
    engine.miniBossTimer += dt * bossSpawnRateMultiplier;
    if (engine.miniBossTimer >= 120) {
      engine.miniBossTimer = 0;
      spawnMiniBoss(engine);
    }
  }

  // 主 wave spawn cooldown
  engine.spawnTimer -= dt * bossSpawnRateMultiplier;
  if (engine.spawnTimer > 0) return;

  // Curse tome: 加快 spawn / 加大 group
  const curseTome = engine.state.player.tomes.find(t => t.type === 'curse_tome');
  const cursePower = getTomePower(curseTome);
  const curseSpawnMult = 1 - cursePower * 0.1;
  let spawnInterval = wave.spawnInterval * Math.max(0.5, curseSpawnMult);
  if (isFinalSwarm) spawnInterval *= 0.5;
  if (engine.state.overtimeSeconds > 0) {
    spawnInterval /= overtimePressure;
  }
  if (shrineDifficulty > 1 && engine.state.overtimeSeconds <= 0) spawnInterval /= shrineDifficulty;
  engine.spawnTimer = spawnInterval;

  let groupSize = wave.groupSize[0] + Math.floor(Math.random() * (wave.groupSize[1] - wave.groupSize[0] + 1));
  if (cursePower > 0) groupSize = Math.round(groupSize * (1 + cursePower * 0.15));
  if (isFinalSwarm) groupSize = Math.round(groupSize * 1.5);
  if (engine.state.overtimeSeconds > 0) groupSize = Math.ceil(groupSize * overtimePressure);

  const availableEnemies = isFinalSwarm
    ? Object.keys(ENEMIES)
    : wave.enemies;

  for (let i = 0; i < groupSize; i++) {
    if (engine.state.enemies.length >= maxAlive) break;
    if (engine.state.enemies.length >= maxEnemiesLimit) break;

    const eliteChance = getOvertimeEliteChance(wave.eliteChance, effectiveOvertimeSeconds);
    const isEliteRoll = Math.random() < eliteChance;
    let enemyType: string;

    if (isEliteRoll) {
      const eliteTypes = (Object.keys(ENEMIES) as EnemyType[]).filter(
        t => ENEMIES[t].isElite && ENEMIES[t].firstAppear <= engine.state.gameTime
      );
      if (eliteTypes.length > 0) {
        enemyType = eliteTypes[Math.floor(Math.random() * eliteTypes.length)];
      } else {
        enemyType = pickWeightedEnemy(engine, availableEnemies);
      }
    } else {
      enemyType = pickWeightedEnemy(engine, availableEnemies);
    }

    if (!enemyType) continue;
    spawnSingleEnemy(engine, enemyType);
  }
}

function isBossEnemyPressureActive(engine: Engine): boolean {
  return !!engine.state.boss && engine.state.boss.hp > 0;
}

function getBossEnemySpawnRateMultiplier(engine: Engine): number {
  return isBossEnemyPressureActive(engine) ? BOSS_ENEMY_SPAWN_RATE_MULTIPLIER : 1;
}

function getBossAdjustedOvertimeSeconds(engine: Engine): number {
  const raw = engine.state.overtimeSeconds;
  if (raw <= 0 || !isBossEnemyPressureActive(engine)) return raw;

  const anchor = Math.max(0, Math.min(raw, engine.state.boss?.spawnOvertimeSeconds ?? raw));
  return anchor + (raw - anchor) * BOSS_OVERTIME_GROWTH_MULTIPLIER;
}

export function getBossOvertimeGrowthContext(engine: Engine): Pick<
  Parameters<typeof spawnEnemy>[3],
  'overtimeGrowthAnchorSeconds' | 'overtimeGrowthMultiplier'
> {
  if (engine.state.overtimeSeconds <= 0 || !isBossEnemyPressureActive(engine)) return {};
  return {
    overtimeGrowthAnchorSeconds: engine.state.boss?.spawnOvertimeSeconds ?? engine.state.overtimeSeconds,
    overtimeGrowthMultiplier: BOSS_OVERTIME_GROWTH_MULTIPLIER,
  };
}

function getOvertimePressure(overtimeSeconds: number): number {
  if (overtimeSeconds <= 0) return 1;
  return 1 + overtimeSeconds / 45;
}

function getOvertimeEliteChance(baseChance: number, overtimeSeconds: number): number {
  if (overtimeSeconds <= 0) return baseChance;
  const overtimeBonus = overtimeSeconds * OVERTIME_ELITE_CHANCE_PER_SECOND;
  return Math.min(OVERTIME_ELITE_CHANCE_CAP, baseChance + overtimeBonus);
}

function spawnMiniBoss(engine: Engine): void {
  const allTypes = (Object.keys(ENEMIES) as EnemyType[]).filter(
    t => ENEMIES[t].firstAppear <= engine.state.gameTime
  );
  if (allTypes.length === 0) return;

  const baseType = allTypes[Math.floor(Math.random() * allTypes.length)];
  const spawnPos = getSpawnPosition(engine);
  const enemy = spawnEnemy(
    baseType,
    spawnPos.x, spawnPos.z,
    {
      gameTime: engine.state.gameTime,
      tier: engine.config.tier,
      overtimeSeconds: engine.state.overtimeSeconds,
      ...getBossOvertimeGrowthContext(engine),
      player: engine.state.player,
      nextId: () => engine.nextEnemyId++,
    },
    { mode: 'miniBoss' },
  );
  // 出生首帧直接贴地，避免 y=0 参与阻挡判定导致卡边/卡墙。
  const h = getCoverSurfaceHeight(engine, enemy.x, enemy.z, engine.state.player.y);
  if (h !== null) enemy.y = h;
  engine.state.enemies.push(enemy);
}

function getCurrentWave(engine: Engine): typeof WAVE_CONFIGS[number] | null {
  for (const wave of WAVE_CONFIGS) {
    if (engine.state.gameTime >= wave.timeStart && engine.state.gameTime < wave.timeEnd) {
      return wave;
    }
  }
  if (WAVE_CONFIGS.length > 0 && engine.state.gameTime >= WAVE_CONFIGS[WAVE_CONFIGS.length - 1].timeEnd) {
    return WAVE_CONFIGS[WAVE_CONFIGS.length - 1];
  }
  return null;
}

function pickWeightedEnemy(engine: Engine, types: string[]): string {
  const available = types.filter(
    t => ENEMIES[t as EnemyType] && ENEMIES[t as EnemyType].firstAppear <= engine.state.gameTime
  );
  if (available.length === 0) return types[0];

  let totalWeight = 0;
  for (const t of available) {
    totalWeight += ENEMIES[t as EnemyType]?.spawnWeight ?? 1;
  }

  let roll = Math.random() * totalWeight;
  for (const t of available) {
    roll -= ENEMIES[t as EnemyType]?.spawnWeight ?? 1;
    if (roll <= 0) return t;
  }
  return available[available.length - 1];
}

function spawnSingleEnemy(engine: Engine, type: string): void {
  if (!ENEMIES[type as EnemyType]) return;
  const spawnPos = getSpawnPosition(engine);
  const enemy = spawnEnemy(
    type as EnemyType,
    spawnPos.x, spawnPos.z,
    {
      gameTime: engine.state.gameTime,
      tier: engine.config.tier,
      overtimeSeconds: engine.state.overtimeSeconds,
      ...getBossOvertimeGrowthContext(engine),
      player: engine.state.player,
      nextId: () => engine.nextEnemyId++,
    },
    { mode: 'wave' },
  );
  // 出生首帧直接贴地，避免 y=0 参与阻挡判定导致卡边/卡墙。
  const h = getCoverSurfaceHeight(engine, enemy.x, enemy.z, engine.state.player.y);
  if (h !== null) enemy.y = h;
  engine.state.enemies.push(enemy);
}

function getSpawnPosition(engine: Engine): { x: number; z: number } {
  const aroundPlayer = getSpawnPositionAroundPlayer(engine);
  if (aroundPlayer) return aroundPlayer;
  // 极端情况下（玩家站在极小不可行走区域）回退旧边缘刷怪，避免刷怪系统卡死。
  // 正常关卡会命中 aroundPlayer 路径。
  const halfMap = engine.config.mapSize * 0.5;
  const offset = 5;
  const side = Math.floor(Math.random() * 4);
  const along = (Math.random() - 0.5) * engine.config.mapSize;
  switch (side) {
    case 0: return { x: along, z: -halfMap - offset };
    case 1: return { x: along, z: halfMap + offset };
    case 2: return { x: -halfMap - offset, z: along };
    default: return { x: halfMap + offset, z: along };
  }
}

function getSpawnPositionAroundPlayer(engine: Engine): { x: number; z: number } | null {
  const p = engine.state.player;
  const halfMap = engine.config.mapSize * 0.5;
  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const angle = Math.random() * Math.PI * 2;
    // 面积均匀采样环带 [5,10]
    const r2 = SPAWN_MIN_RADIUS * SPAWN_MIN_RADIUS +
      Math.random() * (SPAWN_MAX_RADIUS * SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS * SPAWN_MIN_RADIUS);
    const radius = Math.sqrt(r2);
    const x = p.x + Math.cos(angle) * radius;
    const z = p.z + Math.sin(angle) * radius;
    if (Math.abs(x) > halfMap || Math.abs(z) > halfMap) continue;

    // 只允许刷在关卡可走面（col_/ramp_）上：取最接近玩家高度的面。
    const y = getCoverSurfaceHeight(engine, x, z, p.y);
    if (y === null) continue;
    // 非对称高度门：头顶之上几乎不刷（空中刷出），脚下可以（怪从地面来）。
    if (y - p.y > SPAWN_MAX_ABOVE_PLAYER) continue;
    if (p.y - y > SPAWN_MAX_BELOW_PLAYER) continue;

    // 额外避开墙/攀爬体等阻挡体，半径与敌人体型一致，防止刷在墙里。
    if (isBlockedHorizontallyAt(engine.geo, x, z, y, true, ENEMY_SPAWN_RADIUS)) continue;
    // 边缘稳定性：周围一圈都应有可走面且高度变化不要过陡，避免出生在高差边卡住。
    if (!hasStableSpawnNeighborhood(engine, x, z, y)) continue;
    return { x, z };
  }
  return null;
}

function hasStableSpawnNeighborhood(engine: Engine, x: number, z: number, y: number): boolean {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = x + Math.cos(a) * EDGE_CHECK_RING;
    const sz = z + Math.sin(a) * EDGE_CHECK_RING;
    const h = getCoverSurfaceHeight(engine, sx, sz, y);
    if (h === null) return false;
    if (Math.abs(h - y) > EDGE_MAX_HEIGHT_DELTA) return false;
    if (isBlockedHorizontallyAt(engine.geo, sx, sz, h, true, ENEMY_SPAWN_RADIUS)) return false;
  }
  return true;
}

/**
 * (x,z) 处的可走面高度（col_ 顶面 / ramp_ 顶面）。
 * 传 referenceY 时返回**最接近该高度**的面（用玩家 y → 把怪刷在玩家所在的战斗平面，
 * 而非叠层几何里最高的塔顶/天台，避免"空中刷出"）；不传则返回最高面（旧行为）。
 *
 * wysiwyg 加载关卡：走 geo.grid 取 (x,z) 所在 cell 的候选；每次 spawn 在 hasStableSpawnNeighborhood
 * 里被调 8 次，外加 spawn-around-player 24 次 ≈ 192 次/wave。原本每次扫整个 rects/ramps/discs
 * 数组（whitebox 关数百形体）→ 单 wave 帧抖动来源之一。grid 路径单 cell ≈ 数个候选。
 */
function getCoverSurfaceHeight(engine: Engine, x: number, z: number, referenceY?: number): number | null {
  let best: number | null = null;
  const consider = (h: number): void => {
    if (best === null) { best = h; return; }
    if (referenceY === undefined) {
      if (h > best) best = h;
    } else if (Math.abs(h - referenceY) < Math.abs(best - referenceY)) {
      best = h;
    }
  };
  const grid = engine.geo.grid;
  const rects = grid ? grid.rectsAt(x, z) : engine.geo.rects;
  const ramps = grid ? grid.rampsAt(x, z) : engine.geo.ramps;
  const discs = grid ? grid.discsAt(x, z) : engine.geo.discs;
  // rects = col_ 顶面
  for (const rect of rects) {
    const [cx, cz, halfW, halfD, height] = rect;
    if (Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfD) consider(height);
  }
  // ramps = ramp_ 顶面
  for (const ramp of ramps) {
    const dx = x - ramp.cx;
    const dz = z - ramp.cz;
    const sCoord = dx * ramp.slopeDirX + dz * ramp.slopeDirZ;
    const pCoord = dx * (-ramp.slopeDirZ) + dz * ramp.slopeDirX;
    if (Math.abs(sCoord) > ramp.halfSlope || Math.abs(pCoord) > ramp.halfPerp) continue;
    const t = ramp.halfSlope > 0 ? (sCoord + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
    consider(ramp.lowY + (ramp.highY - ramp.lowY) * t);
  }
  // discs = colcyl_ 圆形平台顶面
  for (const disc of discs) {
    const dx = x - disc.cx;
    const dz = z - disc.cz;
    if (dx * dx + dz * dz <= disc.radius * disc.radius) consider(disc.topY);
  }
  return best;
}

/**
 * Boss 起场 —— 当玩家在飞碟完成召唤读条（altars.ts 把飞碟 phase 推到 `boss_active`）时触发。
 *
 * 不再依赖 `BOSS_SPAWN_TIME`：所有 tier 都需要主动召唤。
 *
 * 起场后立刻进 'boss_intro' 阶段（spawnEnemies 和本函数都跳过此阶段）。
 */
export function checkBossSpawn(engine: Engine): void {
  if (engine.state.boss) return;
  if (engine.state.phase === 'victory' || engine.state.phase === 'defeat') return;
  if (engine.state.phase === 'boss_intro' || engine.state.phase === 'boss_fight') return;

  // 必须有任何一个飞碟进入 boss_active 才触发
  if (!hasReadyBossTrigger(engine)) return;

  const tierCfg = TIER_CONFIGS[engine.config.tier];

  // Boss 与触发的 spawn_altar 绑定；关卡模式不再需要单独的 spawn_boss 标记。
  // boss.y 用竖直查询 getTerrainHeightAt 取出生点地表高度（飞碟常摆在高平台上）。
  // 之后每帧由 bossAi 的 getSupportHeightAt 跟地——但 support 只认“够得着的面”，
  // 若 spawn 时给 0，台顶（高出迈步范围）够不着，boss 会被钉在台底；故必须在此赋台顶高度。
  const triggerAltar = engine.state.altars.find(a => a.phase === 'boss_active');
  const bossX = triggerAltar ? triggerAltar.x : 0;
  const bossZ = triggerAltar ? triggerAltar.z : -engine.config.mapSize * 0.3;
  const bossY = getTerrainHeightAt(engine.geo, bossX, bossZ);

  // 关卡决定机甲种类：第 1 关游侠机甲，第 2 关攻城机甲（各走独立 phase script）。
  const bossType = engine.state.stage >= 2 ? 'siege_mech' : 'gunner_mech';
  const stageTwoSummonIndex = engine.state.stage >= 2 ? engine.stageTwoBossSummonCount++ : 0;
  const stageTwoHpMultiplier = engine.state.stage >= 2
    ? STAGE_TWO_BOSS_HP_MULTIPLIER_PER_SUMMON ** stageTwoSummonIndex
    : 1;
  const stageTwoDamageMultiplier = engine.state.stage >= 2
    ? STAGE_TWO_BOSS_DAMAGE_MULTIPLIER_PER_SUMMON ** stageTwoSummonIndex
    : 1;
  const chestDropChance = engine.state.stage >= 2
    ? 1 + stageTwoSummonIndex * STAGE_TWO_BOSS_CHEST_DROP_CHANCE_PER_SUMMON
    : 1;
  const bossHp = Math.round(BOSS_HP * tierCfg.bossHpMultiplier * stageTwoHpMultiplier);

  engine.state.boss = {
    x: bossX,
    y: Number.isFinite(bossY) ? bossY : 0,
    z: bossZ,
    hp: bossHp,
    maxHp: bossHp,
    bossType,
    phase: 1,
    currentAttack: 'idle',
    attackTimer: BOSS_INTRO_DURATION,
    attackAnimTimer: 0,
    attackCooldown: 3.0,
    hitFlashTimer: 0,
    speed: 3.0,
    enraged: false,
    spawnOvertimeSeconds: engine.state.overtimeSeconds,
    damageMultiplier: stageTwoDamageMultiplier,
    chestDropChance,
  };

  engine.state.phase = 'boss_intro';
  // 召唤 boss 时不清场：保留场上已有敌人，与 boss 同时存在。
  // boss_intro 短暂停刷；进入 boss_fight 后以半效率继续常规刷怪。
}
