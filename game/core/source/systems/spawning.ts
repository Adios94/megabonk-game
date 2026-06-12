/**
 * 生成系统 —— 波次 / mini-boss / 单怪 / boss 进场。
 *
 * 入口：tickSpawning(engine, dt)
 *   - 检查 phase: boss_fight / boss_intro 时跳过
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
  STEP_HEIGHT,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';
import { spawnEnemy } from '../factories/spawnEnemy.ts';
import { getTomePower } from '../tomeProgression.ts';
import type { EnemyType } from '../types.ts';
import type { Engine } from './types.ts';
import { hasReadyBossTrigger } from './altars.ts';
import { isBlockedHorizontallyAt } from './collision.ts';

const SPAWN_MIN_RADIUS = 5;
const SPAWN_MAX_RADIUS = 10;
const SPAWN_ATTEMPTS = 24;
const ENEMY_SPAWN_RADIUS = 0.4;
const EDGE_CHECK_RING = ENEMY_SPAWN_RADIUS + 0.15;
const EDGE_MAX_HEIGHT_DELTA = STEP_HEIGHT + 0.25;
/** 刷怪面**高于**玩家的上限：基本不许在玩家头顶之上的台面刷（=空中刷出）。 */
const SPAWN_MAX_ABOVE_PLAYER = 1.0;
/** 刷怪面**低于**玩家的上限：允许怪从下方的地面/低层来（玩家在高台时怪在地面集结）。 */
const SPAWN_MAX_BELOW_PLAYER = 6.0;

export function tickSpawning(engine: Engine, dt: number): void {
  // boss 阶段不刷怪
  if (engine.state.phase === 'boss_fight' || engine.state.phase === 'boss_intro') return;

  const wave = getCurrentWave(engine);
  if (!wave) return;

  // 更新 waveIndex
  for (let i = 0; i < WAVE_CONFIGS.length; i++) {
    if (engine.state.gameTime >= WAVE_CONFIGS[i].timeStart && engine.state.gameTime < WAVE_CONFIGS[i].timeEnd) {
      engine.state.waveIndex = i;
      break;
    }
  }

  // Final Swarm 阶段（gameTime 480-540, 即 boss 来之前的 1 分钟）
  // 注：保留作为常规生存期收尾的怪潮提示；overtime 后由 overtime 系数接管，不再延续 finalSwarm。
  const isFinalSwarm = engine.state.gameTime >= 480 && engine.state.gameTime < REGULAR_GAME_DURATION;
  engine.state.finalSwarm = isFinalSwarm;

  const overtimePressure = getOvertimePressure(engine.state.overtimeSeconds);
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
    engine.miniBossTimer += dt;
    if (engine.miniBossTimer >= 120) {
      engine.miniBossTimer = 0;
      spawnMiniBoss(engine);
    }
  }

  // 主 wave spawn cooldown
  engine.spawnTimer -= dt;
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

    const isEliteRoll = Math.random() < wave.eliteChance;
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

function getOvertimePressure(overtimeSeconds: number): number {
  if (overtimeSeconds <= 0) return 1;
  return 1 + overtimeSeconds / 45;
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
  // rects = col_ 顶面
  for (const rect of engine.geo.rects) {
    const [cx, cz, halfW, halfD, height] = rect;
    if (Math.abs(x - cx) <= halfW && Math.abs(z - cz) <= halfD) consider(height);
  }
  // ramps = ramp_ 顶面
  for (const ramp of engine.geo.ramps) {
    const dx = x - ramp.cx;
    const dz = z - ramp.cz;
    const sCoord = dx * ramp.slopeDirX + dz * ramp.slopeDirZ;
    const pCoord = dx * (-ramp.slopeDirZ) + dz * ramp.slopeDirX;
    if (Math.abs(sCoord) > ramp.halfSlope || Math.abs(pCoord) > ramp.halfPerp) continue;
    const t = ramp.halfSlope > 0 ? (sCoord + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
    consider(ramp.lowY + (ramp.highY - ramp.lowY) * t);
  }
  // discs = colcyl_ 圆形平台顶面
  for (const disc of engine.geo.discs) {
    const dx = x - disc.cx;
    const dz = z - disc.cz;
    if (dx * dx + dz * dz <= disc.radius * disc.radius) consider(disc.topY);
  }
  return best;
}

/**
 * Boss 起场 —— 当玩家在祭坛完成召唤读条（altars.ts 把祭坛 phase 推到 `boss_active`）时触发。
 *
 * 不再依赖 `BOSS_SPAWN_TIME`：所有 tier 都需要主动召唤。
 *
 * 起场后立刻进 'boss_intro' 阶段（spawnEnemies 和本函数都跳过此阶段）。
 */
export function checkBossSpawn(engine: Engine): void {
  if (engine.state.boss) return;
  if (engine.state.phase === 'victory' || engine.state.phase === 'defeat') return;
  if (engine.state.phase === 'boss_intro' || engine.state.phase === 'boss_fight') return;

  // 必须有任何一个祭坛进入 boss_active 才触发
  if (!hasReadyBossTrigger(engine)) return;

  const tierCfg = TIER_CONFIGS[engine.config.tier];

  // Boss 与触发的 spawn_altar 绑定；关卡模式不再需要单独的 spawn_boss 标记。
  // 注：boss.y 始终为 0 —— Boss 没有重力 / 跟地循环（无任何 boss.y 重新赋值），
  // 用 getTerrainHeight 取出来的非 0 值会让 boss 卡在半空。需要 boss 站到高平台上时
  // 应在 client renderBoss 里基于 boss.x/z 即时贴地，而不是把高度写进逻辑状态。
  const triggerAltar = engine.state.altars.find(a => a.phase === 'boss_active');
  const bossX = triggerAltar ? triggerAltar.x : 0;
  const bossZ = triggerAltar ? triggerAltar.z : -engine.config.mapSize * 0.3;

  engine.state.boss = {
    x: bossX,
    y: 0,
    z: bossZ,
    hp: Math.round(BOSS_HP * tierCfg.bossHpMultiplier),
    maxHp: Math.round(BOSS_HP * tierCfg.bossHpMultiplier),
    phase: 1,
    currentAttack: 'idle',
    attackTimer: BOSS_INTRO_DURATION,
    attackCooldown: 3.0,
    hitFlashTimer: 0,
    speed: 3.0,
    enraged: false,
  };

  engine.state.phase = 'boss_intro';
  engine.state.enemies = [];
}
