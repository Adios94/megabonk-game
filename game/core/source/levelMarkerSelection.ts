export interface LevelMarkerPoint {
  x: number;
  y?: number;
  z: number;
}

/** 充能神殿固定占用：左上 / 左下 / 右上 / 右下 / 中心。 */
export function selectShrineMarkerPoints(
  points: readonly LevelMarkerPoint[],
  count = 5,
): LevelMarkerPoint[] {
  if (count <= 0 || points.length === 0) return [];
  const bounds = getBounds(points);
  const anchors = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.minX, z: bounds.maxZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
  ];

  const selected: LevelMarkerPoint[] = [];
  const used = new Set<string>();
  for (const anchor of anchors.slice(0, count)) {
    const picked = pickNearestUnused(points, anchor, used);
    if (!picked) break;
    selected.push(picked);
    used.add(markerPointKey(picked));
  }
  return selected;
}

export function excludeMarkerPoints<T extends LevelMarkerPoint>(
  points: readonly T[],
  excluded: readonly LevelMarkerPoint[],
): T[] {
  const excludedKeys = new Set(excluded.map(markerPointKey));
  return points.filter(point => !excludedKeys.has(markerPointKey(point)));
}

export function markerPointKey(point: LevelMarkerPoint): string {
  return `${roundCoord(point.x)}:${roundCoord(point.y ?? 0)}:${roundCoord(point.z)}`;
}

function getBounds(points: readonly LevelMarkerPoint[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function pickNearestUnused(
  points: readonly LevelMarkerPoint[],
  anchor: { x: number; z: number },
  used: ReadonlySet<string>,
): LevelMarkerPoint | undefined {
  let best: LevelMarkerPoint | undefined;
  let bestDistSq = Infinity;
  for (const point of points) {
    if (used.has(markerPointKey(point))) continue;
    const dx = point.x - anchor.x;
    const dz = point.z - anchor.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      best = point;
      bestDistSq = distSq;
    }
  }
  return best;
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}
