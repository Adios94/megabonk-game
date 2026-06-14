/**
 * 宝箱系统：开局生成 N 个，玩家靠近并交互时消耗金币开启，roll 遗物。
 */
import { distanceBetween } from '../physics.ts';
import { pickRandomSubset } from '../spawnPick.ts';
import {
  CHEST_COUNT,
  CHEST_MAX_ACTIVE,
  CHEST_INTERACT_RADIUS,
  CHEST_INTERACT_MAX_Y_DELTA,
  CHEST_RESPAWN_MIN_SECONDS,
  CHEST_RESPAWN_MAX_SECONDS,
  CHEST_PLAYER_MIN_DISTANCE,
  CHEST_PLAYER_MAX_DISTANCE,
  CHEST_MIN_SEPARATION,
} from '../config.ts';
import type { BossState, ChestState, GameConfig } from '../types.ts';
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

export function spawnBossChest(engine: Engine, boss: BossState): ChestState {
  const chest: ChestState = {
    id: engine.nextChestId++,
    x: boss.x,
    y: boss.y,
    z: boss.z,
    opened: false,
    bossDrop: true,
  };
  engine.state.chests.push(chest);
  return chest;
}

export function generateChests(config: GameConfig): ChestState[] {
  if (config.level) {
    const placed = (config.level.chestSpawns ?? []).map(normalizeChestSpawnPoint);
    return selectLevelChestSpawns(placed, CHEST_COUNT).map((p, i) => ({
      id: i + 1,
      x: p.x,
      y: p.y,
      z: p.z,
      opened: false,
    }));
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

export function tickChests(engine: Engine, dt = 0): void {
  const player = engine.state.player;
  if (!player.alive) return;

  tickChestRespawn(engine, dt);
  if (!engine.input.interact) return;

  const openedChestCount = engine.state.chests.filter(c => c.opened && !c.bossDrop).length;
  for (const chest of engine.state.chests) {
    if (chest.opened) continue;
    const dist = distanceBetween(player.x, player.z, chest.x, chest.z);
    if (dist >= CHEST_INTERACT_RADIUS) continue;
    if (Math.abs((player.y ?? 0) - (chest.y ?? 0)) > CHEST_INTERACT_MAX_Y_DELTA) continue;

    const cost = chest.bossDrop ? 0 : getChestGoldCost(player.level, openedChestCount);
    if (player.gold < cost) return;
    player.gold -= cost;
    const relic = rollRelicForPlayer(engine);
    chest.opened = true;
    chest.relicId = relic.id;
    chest.relicRarity = relic.rarity;
    recordOpenedChestSpawn(engine, chest);
    const reward = {
      chestId: chest.id,
      x: chest.x,
      y: (chest.y ?? 0) + 0.6,
      z: chest.z,
      cost,
      bossDrop: chest.bossDrop,
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
  if (engine.config.level) {
    while (engine.state.chests.filter(c => !c.opened && !c.bossDrop).length < CHEST_MAX_ACTIVE) {
      const spawn = chooseChestSpawn(engine);
      if (!spawn) return;
      engine.state.chests.push({
        id: engine.nextChestId++,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        opened: false,
      });
    }
    return;
  }

  const activeCount = engine.state.chests.filter(c => !c.opened && !c.bossDrop).length;
  const maxActive = CHEST_MAX_ACTIVE;
  if (activeCount >= maxActive) {
    engine.chestRespawnTimer = nextChestRespawnDelay();
    return;
  }

  engine.chestRespawnTimer -= dt;
  if (engine.chestRespawnTimer > 0) return;

  const spawn = chooseChestSpawn(engine);
  if (!spawn) {
    engine.chestRespawnTimer = nextChestRespawnDelay();
    return;
  }
  engine.state.chests.push({
    id: engine.nextChestId++,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    opened: false,
  });
  engine.chestRespawnTimer = nextChestRespawnDelay();
}

function chooseChestSpawn(engine: Engine): ChestSpawnPoint | undefined {
  if (engine.config.level) {
    const placed = (engine.config.level.chestSpawns ?? []).map(normalizeChestSpawnPoint);
    const candidates = placed.filter(p => isAvailableLevelChestSpawn(engine, p));
    const active = engine.state.chests
      .filter(c => !c.opened && !c.bossDrop)
      .map(c => normalizeChestSpawnPoint(c));
    const picked = selectLevelChestSpawns(candidates, 1, active)[0];
    if (picked) return picked;
    return undefined;
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

function recordOpenedChestSpawn(engine: Engine, chest: ChestState): void {
  if (!engine.config.level) return;
  if (chest.bossDrop) return;
  const key = chestSpawnKey(chest);
  if (engine.chestPendingSpawnKeys.includes(key)) return;
  engine.chestPendingSpawnKeys.push(key);
  if (engine.chestPendingSpawnKeys.length < 3) return;
  engine.chestLockedSpawnKeys = engine.chestPendingSpawnKeys.splice(0, 3);
}

function isAvailableLevelChestSpawn(engine: Engine, point: ChestSpawnPoint): boolean {
  const key = chestSpawnKey(point);
  if (engine.chestLockedSpawnKeys.includes(key)) return false;
  if (engine.chestPendingSpawnKeys.includes(key)) return false;
  for (const chest of engine.state.chests) {
    if (chest.opened) continue;
    if (chest.bossDrop) continue;
    if (chestSpawnKey(chest) === key) return false;
  }
  return true;
}

function selectLevelChestSpawns(
  points: readonly ChestSpawnPoint[],
  count: number,
  existing: readonly ChestSpawnPoint[] = [],
): ChestSpawnPoint[] {
  const pool = pickRandomSubset(points, points.length);
  const selected: ChestSpawnPoint[] = [];
  const layerCount = new Map<string, number>();
  for (const point of existing) {
    const layer = heightLayerKey(point);
    layerCount.set(layer, (layerCount.get(layer) ?? 0) + 1);
  }

  const layerTotal = new Set(pool.map(heightLayerKey)).size;
  const layerCap = layerTotal > 1 ? Math.ceil(count / Math.min(layerTotal, count)) : count;

  while (selected.length < count && pool.length > 0) {
    const picked =
      pickBestLevelChestSpawn(pool, selected, existing, layerCount, layerCap, true, true) ??
      pickBestLevelChestSpawn(pool, selected, existing, layerCount, layerCap, false, true) ??
      pickBestLevelChestSpawn(pool, selected, existing, layerCount, layerCap, false, false);
    if (!picked) break;
    pool.splice(pool.indexOf(picked), 1);
    selected.push(picked);
    const layer = heightLayerKey(picked);
    layerCount.set(layer, (layerCount.get(layer) ?? 0) + 1);
  }

  return selected;
}

function pickBestLevelChestSpawn(
  pool: readonly ChestSpawnPoint[],
  selected: readonly ChestSpawnPoint[],
  existing: readonly ChestSpawnPoint[],
  layerCount: ReadonlyMap<string, number>,
  layerCap: number,
  enforceLayerCap: boolean,
  enforceDistance: boolean,
): ChestSpawnPoint | undefined {
  const refs = [...existing, ...selected];
  let best: ChestSpawnPoint | undefined;
  let bestScore = -Infinity;

  for (const point of pool) {
    const layer = heightLayerKey(point);
    const countOnLayer = layerCount.get(layer) ?? 0;
    if (enforceLayerCap && countOnLayer >= layerCap) continue;

    const minDist = minPlanarDistance(point, refs);
    if (enforceDistance && minDist < CHEST_MIN_SEPARATION) continue;

    const score = minDist + (countOnLayer === 0 ? CHEST_MIN_SEPARATION * 2 : 0) - countOnLayer;
    if (score > bestScore) {
      best = point;
      bestScore = score;
    }
  }

  return best;
}

function minPlanarDistance(point: ChestSpawnPoint, refs: readonly ChestSpawnPoint[]): number {
  if (refs.length === 0) return Number.MAX_SAFE_INTEGER;
  return refs.reduce(
    (best, ref) => Math.min(best, distanceBetween(point.x, point.z, ref.x, ref.z)),
    Infinity,
  );
}

function normalizeChestSpawnPoint(point: { x: number; y?: number; z: number }): ChestSpawnPoint {
  return { x: point.x, y: point.y ?? 0, z: point.z };
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

function chestSpawnKey(point: { x: number; y?: number; z: number }): string {
  return `${roundCoord(point.x)}:${roundCoord(point.y ?? 0)}:${roundCoord(point.z)}`;
}

function heightLayerKey(point: { y?: number }): string {
  return `${roundCoord(point.y ?? 0)}`;
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, mapSize: number): number {
  const half = mapSize * 0.48;
  return Math.max(-half, Math.min(half, value));
}
