/**
 * tryMoveHorizontally 单元测试。
 *
 * 验证 4 种 path 的 fallback 顺序：full → slide-Z → slide-X → 原地。
 */
import { describe, it, expect } from 'vitest';
import { tryMoveHorizontally } from '../horizontalMove.ts';
import { makeLevelGeometry, type LevelGeometry } from '../levelGeometry.ts';
import type { LevelData } from '../../types.ts';

function levelWithWall(wall: { cx: number; cz: number; halfW: number; halfD: number; bottomY: number; topY: number }): LevelGeometry {
  return makeLevelGeometry({
    collisionRects: [],
    walls: [wall],
    climbVolumes: [],
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
  });
}

function levelWith(walls: LevelData['walls'], climbs: LevelData['climbVolumes'] = []): LevelGeometry {
  return makeLevelGeometry({
    collisionRects: [],
    walls,
    climbVolumes: climbs,
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
  });
}

describe('tryMoveHorizontally', () => {
  it('无关卡 / 无障碍 → 直接到目标', () => {
    const r = tryMoveHorizontally(makeLevelGeometry(), 0, 0, 5, 5, 0);
    // Neon Crucible 中央 col_ 在 (0,0,15,15,h=0)，h=0 在迈步范围内不挡
    expect(r.x).toBe(5);
    expect(r.z).toBe(5);
  });

  it('目标位置被墙挡，X 方向有空间 → 沿 Z 滑（保留新 X）', () => {
    // 在 (0, 5) 放一堵 z 方向薄墙（沿 x 长 6，沿 z 厚 0.5），玩家 (0, 0) 想去 (3, 5)：
    //  - 直走 (3, 5) → 撞墙
    //  - 沿 Z 滑 (3, 0) → 通
    const geo = levelWithWall({ cx: 0, cz: 5, halfW: 6, halfD: 0.5, bottomY: 0, topY: 3 });
    const r = tryMoveHorizontally(geo, 0, 0, 3, 5, 0);
    expect(r.x).toBe(3);
    expect(r.z).toBe(0); // 被挡回 oldZ
  });

  it('Z 方向也被挡，X 方向有空间 → 沿 X 滑（保留新 Z）', () => {
    // 玩家 (-3, 0) 在墙外左侧，墙在 (cx=0, cz=0, hw=2, hd=4)
    // 目标 (0, 3)：
    //   - 直走 (0, 3) → 在墙内（abs(z-0)=3 ≤ 4.45）→ 撞
    //   - 沿 Z (0, oldZ=0) → 在墙内 → 撞
    //   - 沿 X (-3, 3) → abs(x)=3, halfW+r=2.45, 3>2.45 → 不在 → 通 ← path 3 命中
    const geo = levelWithWall({ cx: 0, cz: 0, halfW: 2, halfD: 4, bottomY: 0, topY: 3 });
    const r = tryMoveHorizontally(geo, -3, 0, 0, 3, 0);
    expect(r.x).toBe(-3);
    expect(r.z).toBe(3);
  });

  it('全方向被挡 → 原地不动', () => {
    // 4 堵墙构造一个 + 形挡板：玩家 (0, 0) 想去 (1, 1)，但前方/侧方都堵住。
    const geo = levelWith([
      { cx: 1, cz: 0, halfW: 0.3, halfD: 5, bottomY: 0, topY: 3 }, // 东墙
      { cx: -1, cz: 0, halfW: 0.3, halfD: 5, bottomY: 0, topY: 3 }, // 西墙
      { cx: 0, cz: 1, halfW: 5, halfD: 0.3, bottomY: 0, topY: 3 }, // 北墙
      { cx: 0, cz: -1, halfW: 5, halfD: 0.3, bottomY: 0, topY: 3 }, // 南墙
    ]);
    const r = tryMoveHorizontally(geo, 0, 0, 1, 1, 0);
    expect(r.x).toBe(0);
    expect(r.z).toBe(0);
  });

  it('includeClimb=false 时 climb_ 不再阻挡', () => {
    const geo = levelWith([], [
      { cx: 0, cz: 5, halfW: 5, halfD: 0.5, bottomY: 0, topY: 4 },
    ]);
    // includeClimb=true → 撞 climb_ → 沿 Z 滑回 oldZ
    const r1 = tryMoveHorizontally(geo, 0, 0, 0, 5, 0, { includeClimb: true });
    expect(r1.z).toBe(0);

    // includeClimb=false → 直接穿过 climb_
    const r2 = tryMoveHorizontally(geo, 0, 0, 0, 5, 0, { includeClimb: false });
    expect(r2.z).toBe(5);
  });

  it('已嵌入墙体（起点就被挡）→ 朝空地脱困，不卡死（dash/击退 撞墙回归）', () => {
    // 墙在原点 (halfW/halfD 2)，mover 被 dash/击退 卡在墙心 (0,0)。
    const geo = levelWithWall({ cx: 0, cz: 0, halfW: 2, halfD: 2, bottomY: 0, topY: 3 });
    const r = tryMoveHorizontally(geo, 0, 0, 5, 0, 0); // 朝 +X 空地
    expect(r.x).toBe(5); // 脱困到空地，而非永久卡在 (0,0)
  });

  it('已嵌入墙体且 desired 朝墙体更深处 → 径向找最近出口，不越陷越深', () => {
    // 小墙 (halfW/halfD 1)，mover 卡在墙心 (0,0)，desired (0.3,0.3) 仍在墙内。
    // 旧逻辑会放行 desired 把玩家推得更深；新逻辑应径向脱困到墙外。
    const geo = levelWithWall({ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 3 });
    const r = tryMoveHorizontally(geo, 0, 0, 0.3, 0.3, 0);
    // 脱困点应落在墙外（离墙心距离 > halfW + 半径 ≈ 1.45），而不是被推进墙里。
    expect(Math.hypot(r.x, r.z)).toBeGreaterThan(1.45);
  });
});
