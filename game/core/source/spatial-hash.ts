/**
 * Spatial hash grid for efficient broad-phase collision detection.
 * Uses prime number hashing on cell coordinates.
 */

interface SpatialEntry {
  id: number;
  x: number;
  z: number;
  radius: number;
}

export class SpatialHash {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly buckets: Map<number, SpatialEntry[]>;
  // Pre-allocated array for query results to avoid allocations during tick
  private readonly queryResults: number[];
  // 复用的去重集合，避免每次 query 都 new Set（每帧可被调用数十次）。
  private readonly seen: Set<number>;
  // SpatialEntry 对象池：clear 只把游标归零，insert 复用旧对象，消除每帧大量 GC。
  private readonly entryPool: SpatialEntry[];
  private entryCount: number;

  constructor(cellSize: number = 4) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.buckets = new Map();
    this.queryResults = [];
    this.seen = new Set();
    this.entryPool = [];
    this.entryCount = 0;
  }

  clear(): void {
    // 保留 bucket 数组对象，仅清空其内容，避免 Map 反复增删 + 数组重建。
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
    }
    this.entryCount = 0;
  }

  private acquireEntry(id: number, x: number, z: number, radius: number): SpatialEntry {
    let entry = this.entryPool[this.entryCount];
    if (entry === undefined) {
      entry = { id, x, z, radius };
      this.entryPool[this.entryCount] = entry;
    } else {
      entry.id = id;
      entry.x = x;
      entry.z = z;
      entry.radius = radius;
    }
    this.entryCount++;
    return entry;
  }

  insert(id: number, x: number, z: number, radius: number): void {
    const minCellX = Math.floor((x - radius) * this.invCellSize);
    const maxCellX = Math.floor((x + radius) * this.invCellSize);
    const minCellZ = Math.floor((z - radius) * this.invCellSize);
    const maxCellZ = Math.floor((z + radius) * this.invCellSize);

    const entry = this.acquireEntry(id, x, z, radius);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const hash = this.hashCell(cx, cz);
        let bucket = this.buckets.get(hash);
        if (!bucket) {
          bucket = [];
          this.buckets.set(hash, bucket);
        }
        bucket.push(entry);
      }
    }
  }

  /**
   * 查询命中 (x,z,radius) 圆的所有 entry id，返回**内部复用 buffer**（不拷贝）。
   *
   * 零分配版：返回值仅在下一次 query / queryRef 调用前有效，调用方必须同步遍历完、
   * 不可缓存或跨调用持有。命中逻辑与 query() 完全一致。
   * 每帧被每个投射物各调一次的热路径用它，省掉 query() 的 .slice()（每帧大量小数组 GC）。
   */
  queryRef(x: number, z: number, radius: number): readonly number[] {
    this.runQuery(x, z, radius);
    return this.queryResults;
  }

  query(x: number, z: number, radius: number): number[] {
    this.runQuery(x, z, radius);
    return this.queryResults.slice();
  }

  private runQuery(x: number, z: number, radius: number): void {
    this.queryResults.length = 0;

    const minCellX = Math.floor((x - radius) * this.invCellSize);
    const maxCellX = Math.floor((x + radius) * this.invCellSize);
    const minCellZ = Math.floor((z - radius) * this.invCellSize);
    const maxCellZ = Math.floor((z + radius) * this.invCellSize);

    const seen = this.seen;
    seen.clear();

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const hash = this.hashCell(cx, cz);
        const bucket = this.buckets.get(hash);
        if (!bucket) continue;

        for (let i = 0; i < bucket.length; i++) {
          const entry = bucket[i];
          if (seen.has(entry.id)) continue;
          seen.add(entry.id);

          // Check actual distance (circle vs circle)
          const dx = entry.x - x;
          const dz = entry.z - z;
          const distSq = dx * dx + dz * dz;
          const combinedRadius = radius + entry.radius;

          if (distSq <= combinedRadius * combinedRadius) {
            this.queryResults.push(entry.id);
          }
        }
      }
    }
  }

  private hashCell(cx: number, cz: number): number {
    // Use prime number hashing for good distribution
    return ((cx * 73856093) ^ (cz * 19349663)) | 0;
  }
}
