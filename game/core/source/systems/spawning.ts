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
  BOSS_SPAWN_TIME,
  BOSS_HP,
  BOSS_INTRO_DURATION,
  TELEPORTER_APPEAR_TIME,
} from '../config.ts';
import { ENEMIES } from '../data/enemies.ts';
import { spawnEnemy } from '../factories/spawnEnemy.ts';
import type { EnemyType } from '../types.ts';
import type { Engine } from './types.ts';

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
  const isFinalSwarm = engine.state.gameTime >= 480 && engine.state.gameTime < BOSS_SPAWN_TIME;
  engine.state.finalSwarm = isFinalSwarm;

  const maxAlive = isFinalSwarm ? 150 : wave.maxAlive;
  const maxEnemiesLimit = isFinalSwarm ? 150 : engine.config.maxEnemies;

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
  const curseSpawnMult = curseTome ? (1 - curseTome.level * 0.1) : 1.0;
  let spawnInterval = wave.spawnInterval * Math.max(0.5, curseSpawnMult);
  if (isFinalSwarm) spawnInterval *= 0.5;
  engine.spawnTimer = spawnInterval;

  let groupSize = wave.groupSize[0] + Math.floor(Math.random() * (wave.groupSize[1] - wave.groupSize[0] + 1));
  if (curseTome) groupSize = Math.round(groupSize * (1 + curseTome.level * 0.15));
  if (isFinalSwarm) groupSize = Math.round(groupSize * 1.5);

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
      player: engine.state.player,
      nextId: () => engine.nextEnemyId++,
    },
    { mode: 'miniBoss' },
  );
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
      player: engine.state.player,
      nextId: () => engine.nextEnemyId++,
    },
    { mode: 'wave' },
  );
  engine.state.enemies.push(enemy);
}

function getSpawnPosition(engine: Engine): { x: number; z: number } {
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

/**
 * Boss 起场 —— tier 1 看时间, tier ≥2 等所有传送器激活。
 *
 * 起场后立刻进 'boss_intro' 阶段（spawnEnemies 和本函数都跳过此阶段）。
 */
export function checkBossSpawn(engine: Engine): void {
  if (engine.state.boss) return;
  if (engine.state.phase === 'victory' || engine.state.phase === 'defeat') return;

  const tierCfg = TIER_CONFIGS[engine.config.tier];

  if (tierCfg.teleporterCount === 0) {
    if (engine.state.gameTime < BOSS_SPAWN_TIME) return;
  } else {
    const allActivated = engine.state.teleporters.length >= tierCfg.teleporterCount &&
      engine.state.teleporters.every(t => t.phase === 'activated');
    if (!allActivated) return;
  }

  engine.state.boss = {
    x: 0,
    y: 0,
    z: -engine.config.mapSize * 0.3,
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
  void TELEPORTER_APPEAR_TIME; // 本文件不直接读, 由 teleporters.ts 用
}
