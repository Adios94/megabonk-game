/**
 * terrain.getTerrainHeight 单元测试。
 *
 * 验证 4 层平台几何 + 斜坡过渡 + max 取代叠加。
 */
import { describe, it, expect } from 'vitest';
import { getTerrainHeightAt, NEON_CRUCIBLE_GEOMETRY } from '../collision.ts';

// 旧 terrain.getTerrainHeight 已删除（deprecated shim）；改用 collision 的显式几何查询，
// 固定查询内置 Neon Crucible，保留原有地形高度覆盖。
const getTerrainHeight = (x: number, z: number): number =>
  getTerrainHeightAt(NEON_CRUCIBLE_GEOMETRY, x, z);

describe('getTerrainHeight', () => {
  it('中央竞技场 (0, 0) 是地面 y=0', () => {
    expect(getTerrainHeight(0, 0)).toBe(0);
  });

  it('地图远点 (100, 100) 也是 y=0 (无平台 → 默认地面)', () => {
    expect(getTerrainHeight(100, 100)).toBe(0);
  });

  it('对角线 nest (38, 38) y=6', () => {
    expect(getTerrainHeight(38, 38)).toBe(6);
  });

  it('Watchtower (0, -40) y=4', () => {
    expect(getTerrainHeight(0, -40)).toBe(4);
  });

  it('Mid catwalk (0, -25) y=2', () => {
    expect(getTerrainHeight(0, -25)).toBe(2);
  });

  it('斜坡过渡: 平台外 +2 单位高度线性下降', () => {
    // (0, -25) 平台 hd=4, 中心 z=-25, 平台边缘到 z=-29
    // z=-30 距边缘 1 单位, 应在斜坡上, 高度 ≈ 2 * (1 - 1/3) ≈ 1.33
    const h = getTerrainHeight(0, -30.1);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThan(2);
  });

  it('斜坡外 (>3 单位) 完全降为下一层平台', () => {
    // 远离 watchtower 5 单位
    const h = getTerrainHeight(0, -50);  // 距 (0,-40) 10 单位, 但 (0, -50) 自己是 corridor pad y=0
    expect(h).toBe(0);
  });

  it('重叠平台取 max (中央 + watchtower 区域)', () => {
    // 中央竞技场 y=0 和 watchtower y=4 不重叠, 但 watchtower 边缘斜坡覆盖到 ground
    // 验证更靠近 nest 一侧高度大
    const center = getTerrainHeight(0, 0);
    const tower = getTerrainHeight(0, -40);
    const nest = getTerrainHeight(38, 38);
    expect(tower).toBeGreaterThan(center);
    expect(nest).toBeGreaterThan(tower);
  });
});
