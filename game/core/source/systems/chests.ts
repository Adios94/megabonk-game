/**
 * 宝箱系统：开局生成 N 个，玩家靠近并交互时消耗金币开启，roll 遗物。
 * （从 systems/teleporters.ts 拆出来；旧文件已变成 deprecated 兼容 shim。）
 */
import { distanceBetween } from '../physics.ts';
import {
  CHEST_COUNT,
  CHEST_MAX_ACTIVE,
  CHEST_INTERACT_RADIUS,
  CHEST_RESPAWN_MIN_SECONDS,
  CHEST_RESPAWN_MAX_SECONDS,
  CHEST_PLAYER_MIN_DISTANCE,
  CHEST_PLAYER_MAX_DISTANCE,
  CHEST_SURFACE_GRID_SIZE,
  CHEST_LEVEL_MAX,
  CHEST_MIN_SEPARATION,
} from '../config.ts';
import type { ChestState, GameConfig, LevelData, RampVolume } from '../types.ts';
import type { Engine } from './types.ts';
import { getChestGoldCost, rollRelicForPlayer } from './relics.ts';

interface ChestSpawnPoint {
  x: number;
  y: number;
  z: number;
}

export function nextChestRespawnDelay(): number {
  return CHEST_RESPAWN_MIN_SECONDS
    + Math.random() * (CHEST_RESPAWN_MAX_SECONDS - CHEST_RESPAWN_MIN_SECONDS);
}

export function nextChestId(chests: readonly ChestState[]): number {
  return chests.reduce((max, chest) => Math.max(max, chest.id), 0) + 1;
}

export function generateChests(config: GameConfig): ChestState[] {
  if (config.level) {
    // 优先使用关卡数据中显式标注的 chest 出生点（chest_ marker 解析得到）。
    const placed = config.level.chestSpawns ?? [];
    if (placed.length > 0) {
      return placed.slice(0, CHEST_LEVEL_MAX).map((p, i) => ({
        id: i + 1,
        x: p.x,
        y: 0,
        z: p.z,
        opened: false,
      }));
    }

    // 否则按可站立表面采样生成。
    const points = generateLevelSurfaceChestPoints(config.level).slice(0, CHEST_LEVEL_MAX);
    if (points.length > 0) {
      return points.map((p, i) => ({
        id: i + 1,
        x: p.x,
        y: p.y,
        z: p.z,
        opened: false,
      }));
    }
  }

  const chests: ChestState[] = [];
  while (chests.length < CHEST_COUNT) {
    const p = randomChestPosition(config);
    chests.push({
      id: chests.length + 1,
      x: p.x,
      y: p.y,
      z: p.z,
      opened: false,
    });
  }
  return chests;
}

function randomChestPosition(config: GameConfig): ChestSpawnPoint {
  const halfMap = config.mapSize * 0.4;
  const angle = Math.random() * Math.PI * 2;
  const dist = 15 + Math.random() * halfMap * 0.5;
  return {
    x: Math.cos(angle) * dist,
    y: 0,
    z: Math.sin(angle) * dist,
  };
}

function generateLevelSurfaceChestPoints(level: LevelData): ChestSpawnPoint[] {
  const points: ChestSpawnPoint[] = [];
  const occupied = new Set<string>();

  const pushPoint = (x: number, y: number, z: number) => {
    // 同一 X/Z 可能有多层平台；高度层也纳入 key，避免漏掉上下层宝箱。
    const key = `${Math.floor(x / CHEST_SURFACE_GRID_SIZE)}:${Math.floor(z / CHEST_SURFACE_GRID_SIZE)}:${Math.round(y * 2)}`;
    if (occupied.has(key)) return;
    occupied.add(key);
    points.push({ x, y, z });
  };

  for (const rect of level.collisionRects ?? []) {
    sampleRectSurface(rect.cx, rect.cz, rect.halfW, rect.halfD, rect.height, pushPoint);
  }
  for (const ramp of level.ramps ?? []) {
    sampleRampSurface(ramp, pushPoint);
  }

  shuffleInPlace(points);
  return points;
}

function sampleRectSurface(
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  height: number,
  pushPoint: (x: number, y: number, z: number) => void,
): void {
  const minX = cx - halfW;
  const maxX = cx + halfW;
  const minZ = cz - halfD;
  const maxZ = cz + halfD;
  for (const x of sampleAxis(minX, maxX)) {
    for (const z of sampleAxis(minZ, maxZ)) {
      pushPoint(x, height, z);
    }
  }
}

function sampleRampSurface(
  ramp: RampVolume,
  pushPoint: (x: number, y: number, z: number) => void,
): void {
  const perpX = -ramp.slopeDirZ;
  const perpZ = ramp.slopeDirX;
  for (const s of sampleAxis(-ramp.halfSlope, ramp.halfSlope)) {
    for (const p of sampleAxis(-ramp.halfPerp, ramp.halfPerp)) {
      const x = ramp.cx + ramp.slopeDirX * s + perpX * p;
      const z = ramp.cz + ramp.slopeDirZ * s + perpZ * p;
      const t = ramp.halfSlope > 0 ? (s + ramp.halfSlope) / (ramp.halfSlope * 2) : 0;
      const y = ramp.lowY + (ramp.highY - ramp.lowY) * t;
      pushPoint(x, y, z);
    }
  }
}

function sampleAxis(min: number, max: number): number[] {
  const width = max - min;
  if (width <= 0) return [];
  const samples: number[] = [];
  const count = Math.max(1, Math.ceil(width / CHEST_SURFACE_GRID_SIZE));
  for (let i = 0; i < count; i++) {
    samples.push(min + (i + Math.random()) * width / count);
  }
  return samples;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function tickChests(engine: Engine, dt = 0): void {
  const player = engine.state.player;
  if (!player.alive) return;

  tickChestRespawn(engine, dt);
  if (!engine.input.interact) return;

  const openedChestCount = engine.state.chests.filter(c => c.opened).length;
  for (const chest of engine.state.chests) {
    if (chest.opened) continue;
    const dist = distanceBetween(player.x, player.z, chest.x, chest.z);
    if (dist >= CHEST_INTERACT_RADIUS) continue;

    const cost = getChestGoldCost(player.level, openedChestCount);
    if (player.gold < cost) return;
    player.gold -= cost;
    const relic = rollRelicForPlayer(engine);
    chest.opened = true;
    chest.relicId = relic.id;
    chest.relicRarity = relic.rarity;
    const reward = {
      chestId: chest.id,
      x: chest.x,
      y: (chest.y ?? 0) + 0.6,
      z: chest.z,
      cost,
      relicId: relic.id,
      rarity: relic.rarity,
      returnPhase: engine.state.phase,
    };
    engine.state.pendingChestReward = reward;
    engine.state.chestOpenEvents.push(reward);
    engine.state.phase = 'chest_reward';
    return;
  }
}

function tickChestRespawn(engine: Engine, dt: number): void {
  const activeCount = engine.state.chests.filter(c => !c.opened).length;
  const maxActive = engine.config.level ? CHEST_LEVEL_MAX : CHEST_MAX_ACTIVE;
  if (activeCount >= maxActive) {
    engine.chestRespawnTimer = nextChestRespawnDelay();
    return;
  }

  engine.chestRespawnTimer -= dt;
  if (engine.chestRespawnTimer > 0) return;

  const spawn = chooseChestSpawn(engine);
  engine.state.chests.push({
    id: engine.nextChestId++,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    opened: false,
  });
  engine.chestRespawnTimer = nextChestRespawnDelay();
}

function chooseChestSpawn(engine: Engine): ChestSpawnPoint {
  if (engine.config.level) {
    // 优先使用关卡显式标注的 chest 出生点。
    const placed = engine.config.level.chestSpawns ?? [];
    if (placed.length > 0) {
      const candidates = placed.filter(p => isGoodChestSpawn(engine, p.x, p.z));
      if (candidates.length > 0) {
        const p = candidates[Math.floor(Math.random() * candidates.length)];
        return { x: p.x, y: 0, z: p.z };
      }
    }

    // 回退：可站立表面采样。
    const surface = generateLevelSurfaceChestPoints(engine.config.level)
      .filter(p => isGoodChestSpawn(engine, p.x, p.z));
    if (surface.length > 0) return surface[Math.floor(Math.random() * surface.length)];
  }

  const player = engine.state.player;
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = CHEST_PLAYER_MIN_DISTANCE + Math.random() * (CHEST_PLAYER_MAX_DISTANCE - CHEST_PLAYER_MIN_DISTANCE);
    const x = clamp(player.x + Math.cos(angle) * dist, engine.config.mapSize);
    const z = clamp(player.z + Math.sin(angle) * dist, engine.config.mapSize);
    if (isGoodChestSpawn(engine, x, z)) return { x, y: 0, z };
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = CHEST_PLAYER_MIN_DISTANCE + Math.random() * (CHEST_PLAYER_MAX_DISTANCE - CHEST_PLAYER_MIN_DISTANCE);
  return {
    x: clamp(player.x + Math.cos(angle) * dist, engine.config.mapSize),
    y: 0,
    z: clamp(player.z + Math.sin(angle) * dist, engine.config.mapSize),
  };
}

function isGoodChestSpawn(engine: Engine, x: number, z: number): boolean {
  const player = engine.state.player;
  const playerDist = distanceBetween(player.x, player.z, x, z);
  if (playerDist < CHEST_PLAYER_MIN_DISTANCE) return false;
  for (const chest of engine.state.chests) {
    if (chest.opened) continue;
    if (distanceBetween(chest.x, chest.z, x, z) < CHEST_MIN_SEPARATION) return false;
  }
  return true;
}

function clamp(value: number, mapSize: number): number {
  const half = mapSize * 0.48;
  return Math.max(-half, Math.min(half, value));
}
