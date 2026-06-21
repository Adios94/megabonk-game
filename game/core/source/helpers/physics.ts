/**
 * Simple 3D movement physics with boundary clamping.
 * Operates on the XZ plane (Y is up).
 */

/**
 * Apply movement on the XZ plane with boundary clamping.
 * Returns new position or null if no movement occurred.
 */
export function applyMovement3D(
  x: number,
  z: number,
  moveX: number,
  moveZ: number,
  speed: number,
  dt: number,
  mapSize: number,
): { x: number; z: number } | null {
  if (moveX === 0 && moveZ === 0) {
    return null;
  }

  // Normalize input direction
  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  const nx = moveX / len;
  const nz = moveZ / len;

  const halfMap = mapSize * 0.5;
  const newX = Math.max(-halfMap, Math.min(halfMap, x + nx * speed * dt));
  const newZ = Math.max(-halfMap, Math.min(halfMap, z + nz * speed * dt));

  return { x: newX, z: newZ };
}

/**
 * Euclidean distance between two points on XZ plane.
 */
export function distanceBetween(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Squared distance between two points on XZ plane.
 * 比较距离时（dist < r / dist > r）优先用此函数，省一次 Math.sqrt——
 * 在每帧成百上千次的索敌 / AOE / 碰撞判定里能显著降低 CPU。
 */
export function distanceSqBetween(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

/**
 * Normalize a 2D direction vector. Returns {x:0, z:0} if zero-length.
 */
export function normalizeDirection(x: number, z: number): { x: number; z: number } {
  const len = Math.sqrt(x * x + z * z);
  if (len < 0.0001) {
    return { x: 0, z: 0 };
  }
  return { x: x / len, z: z / len };
}
