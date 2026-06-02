/**
 * 地形高度查询 —— Neon Crucible 平台几何。
 *
 * 纯函数, 无副作用。给定 (x, z) 返回该处地表 y 高度（玩家 / 投射物 / 非飞行敌人）。
 *
 * 4 层结构：
 *   y=0  Ground floor — 中央竞技场 + 4 条走廊 + 角落补丁
 *   y=2  Mid catwalks — 走廊上的 4 个站台 + 4 个对角线接驳点
 *   y=4  Watchtowers  — 4 个基本方向的塔
 *   y=6  Nests        — 4 个对角线尖塔
 *
 * 边缘 3 单位过渡为线性斜坡（max 取代叠加，避免重叠平台叠高）。
 */

const PLATFORMS: readonly [number, number, number, number, number][] = [
  // Ground floor
  [0, 0, 15, 15, 0],
  [0, -30, 6, 15, 0], [0, 30, 6, 15, 0],
  [30, 0, 15, 6, 0], [-30, 0, 15, 6, 0],
  [15, -15, 5, 5, 0], [-15, -15, 5, 5, 0],
  [15, 15, 5, 5, 0], [-15, 15, 5, 5, 0],
  [0, -50, 8, 5, 0], [0, 50, 8, 5, 0],
  [50, 0, 5, 8, 0], [-50, 0, 5, 8, 0],

  // Mid catwalks (y=2)
  [0, -25, 5, 4, 2], [0, 25, 5, 4, 2],
  [25, 0, 4, 5, 2], [-25, 0, 4, 5, 2],
  [20, -20, 5, 5, 2], [-20, -20, 5, 5, 2],
  [20, 20, 5, 5, 2], [-20, 20, 5, 5, 2],

  // Watchtowers (y=4)
  [0, -40, 5, 5, 4], [0, 40, 5, 5, 4],
  [40, 0, 5, 5, 4], [-40, 0, 5, 5, 4],

  // Nests (y=6)
  [38, -38, 3, 3, 6], [-38, -38, 3, 3, 6],
  [38, 38, 3, 3, 6], [-38, 38, 3, 3, 6],
];

const RAMP_WIDTH = 3;

export function getTerrainHeight(x: number, z: number): number {
  let height = 0;
  for (const [cx, cz, hw, hd, h] of PLATFORMS) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);

    if (dx <= hw && dz <= hd) {
      height = Math.max(height, h);
    } else if (dx <= hw + RAMP_WIDTH && dz <= hd + RAMP_WIDTH) {
      const edgeDist = Math.max(dx - hw, dz - hd, 0);
      if (edgeDist <= RAMP_WIDTH) {
        const rampHeight = h * (1 - edgeDist / RAMP_WIDTH);
        height = Math.max(height, rampHeight);
      }
    }
  }
  return height;
}
