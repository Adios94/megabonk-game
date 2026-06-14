/**
 * collision.{getTerrainHeightAt, getSupportHeightAt, isBlockedHorizontallyAt,
 *           findClimbAt, makeLevelGeometry} 单元测试 (Phase 3 重构后).
 *
 * 锁定关卡碰撞 API 在以下场景的行为：
 *   - 内置 Neon Crucible（无关卡，NEON_CRUCIBLE_GEOMETRY）
 *   - 加载关卡（makeLevelGeometry(level) → wysiwyg 模式 + 阶段 1 软虚空保底）
 *   - col_ / wall_ / climb_ / ramp_ 各类几何
 *
 * 不再有 beforeEach(clearLevel) —— 每个用例显式构造 geo，无全局状态。
 */
import { describe, it, expect } from 'vitest';
import {
  getTerrainHeightAt,
  getSupportHeightAt,
  isBlockedHorizontallyAt,
  findClimbAt,
  makeLevelGeometry,
  NEON_CRUCIBLE_GEOMETRY,
  VOID_HEIGHT,
  type LevelGeometry,
} from '../collision.ts';
import type { LevelData } from '../../types.ts';

function geoFor(overrides: Partial<LevelData> = {}): LevelGeometry {
  return makeLevelGeometry({
    collisionRects: [],
    walls: [],
    climbVolumes: [],
    ramps: [],
    spawnPoints: {},
    chestSpawns: [],
    ...overrides,
  });
}

describe('collision', () => {
  // ─── getTerrainHeightAt ────────────────────────────────────────────

  describe('getTerrainHeightAt (内置 Neon Crucible)', () => {
    const geo = NEON_CRUCIBLE_GEOMETRY;

    it('原点 = y=0', () => {
      expect(getTerrainHeightAt(geo, 0, 0)).toBe(0);
    });

    it('远点 (100, 100) = y=0（默认地板）', () => {
      expect(getTerrainHeightAt(geo, 100, 100)).toBe(0);
    });

    it('Nest 角 (38, 38) = y=6', () => {
      expect(getTerrainHeightAt(geo, 38, 38)).toBe(6);
    });
  });

  describe('getTerrainHeightAt (加载关卡, 阶段 1 软虚空)', () => {
    it('col_ 内返回 col_ 的 height', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 }],
      });
      expect(getTerrainHeightAt(geo, 0, 0)).toBe(3);
      expect(getTerrainHeightAt(geo, 4.9, 4.9)).toBe(3);
    });

    it('col_ 外返回 0（软虚空）—— 不返回 -Infinity', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 }],
      });
      const h = getTerrainHeightAt(geo, 100, 100);
      expect(h).toBe(0);
      expect(Number.isFinite(h)).toBe(true);
    });

    it('多个 col_ 重叠取 max', () => {
      const geo = geoFor({
        collisionRects: [
          { cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 },
          { cx: 0, cz: 0, halfW: 3, halfD: 3, height: 7 },
        ],
      });
      expect(getTerrainHeightAt(geo, 0, 0)).toBe(7);
      expect(getTerrainHeightAt(geo, 4, 4)).toBe(3); // 外圈范围内但内圈外
    });

    it('ramp 顶面线性插值（沿 +X 上升）', () => {
      const geo = geoFor({
        ramps: [{
          cx: 0, cz: 0, halfSlope: 5, halfPerp: 5,
          slopeDirX: 1, slopeDirZ: 0,
          lowY: 0, highY: 4,
        }],
      });
      expect(getTerrainHeightAt(geo, -5, 0)).toBeCloseTo(0, 1); // 低端
      expect(getTerrainHeightAt(geo, 0, 0)).toBeCloseTo(2, 1);  // 中段
      expect(getTerrainHeightAt(geo, 5, 0)).toBeCloseTo(4, 1);  // 高端
    });

    it('ramp 反向（slopeDir = -X）→ 高度反向', () => {
      const geo = geoFor({
        ramps: [{
          cx: 0, cz: 0, halfSlope: 5, halfPerp: 5,
          slopeDirX: -1, slopeDirZ: 0,
          lowY: 0, highY: 4,
        }],
      });
      expect(getTerrainHeightAt(geo, -5, 0)).toBeCloseTo(4, 1);
      expect(getTerrainHeightAt(geo, 5, 0)).toBeCloseTo(0, 1);
    });

    it('ramp 旋转 45° → 沿对角线上升', () => {
      const k = Math.SQRT1_2; // = √2/2
      const geo = geoFor({
        ramps: [{
          cx: 0, cz: 0, halfSlope: 5, halfPerp: 2,
          slopeDirX: k, slopeDirZ: k, // 沿 (+X+Z) 对角
          lowY: 0, highY: 4,
        }],
      });
      // 对角终点 (5*k, 5*k) ≈ (3.54, 3.54) → 高端 → 4
      expect(getTerrainHeightAt(geo, 5 * k, 5 * k)).toBeCloseTo(4, 1);
      // 对角中点 → 2
      expect(getTerrainHeightAt(geo, 0, 0)).toBeCloseTo(2, 1);
      // 对角起点 → 0
      expect(getTerrainHeightAt(geo, -5 * k, -5 * k)).toBeCloseTo(0, 1);
      // 法向（perp 方向）超出 halfPerp → 不在 footprint
      expect(getTerrainHeightAt(geo, -3 * k, 3 * k)).toBe(0); // 软虚空保底
    });
  });

  // ─── getSupportHeightAt ────────────────────────────────────────────

  describe('getSupportHeightAt (反映 STEP_HEIGHT 可达性)', () => {
    it('脚下 y=0、目标 col_ 顶面 y=2 → 不可达 → 返回 0（默认地板）', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 2 }],
      });
      // limit = 0 + STEP_HEIGHT(0.5) = 0.5；col_ 顶面 2 > 0.5 → 忽略
      expect(getSupportHeightAt(geo, 0, 0, 0)).toBe(0);
    });

    it('脚下 y=2、col_ 顶面 y=2 → 可达 → 返回 2', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 2 }],
      });
      expect(getSupportHeightAt(geo, 0, 0, 2)).toBe(2);
    });

    it('脚下 y=1.6 (跳跃接近顶峰)、col_ 顶面 y=2 → 在迈步内 → 返回 2', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 2 }],
      });
      expect(getSupportHeightAt(geo, 0, 0, 1.6)).toBe(2);
    });

    it('脚下 y=-1（已经掉到地面下）→ 默认地板也不可达 → VOID_HEIGHT', () => {
      // limit = -1 + 0.5 = -0.5 < 0 → 默认 0 地板被排除
      expect(getSupportHeightAt(NEON_CRUCIBLE_GEOMETRY, 0, 0, -1)).toBe(VOID_HEIGHT);
    });

    it('多个可达面取 max', () => {
      const geo = geoFor({
        collisionRects: [
          { cx: 0, cz: 0, halfW: 5, halfD: 5, height: 1 },
          { cx: 0, cz: 0, halfW: 3, halfD: 3, height: 1.4 },
        ],
      });
      // limit = 1.5 + 0.5 = 2 → 两个都可达
      expect(getSupportHeightAt(geo, 0, 0, 1.5)).toBeCloseTo(1.4, 2);
    });
  });

  // ─── isBlockedHorizontallyAt ───────────────────────────────────────

  describe('isBlockedHorizontallyAt (col_ / wall_ / climb_)', () => {
    it('col_ 顶面在迈步范围内 → 不挡（可踩上去）', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 0.3 }],
      });
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0)).toBe(false);
    });

    it('col_ 顶面高于迈步 → 挡', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 }],
      });
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0)).toBe(true);
    });

    it('wall_ 整体在头顶之上 → 不挡（可从下方穿过）', () => {
      const geo = geoFor({
        walls: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, bottomY: 5, topY: 8 }],
      });
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0)).toBe(false);
    });

    it('wall_ 底部在身高内 → 挡', () => {
      const geo = geoFor({
        walls: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, bottomY: 0, topY: 3 }],
      });
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0)).toBe(true);
    });

    it('climb_ 默认挡（走不穿），includeClimb=false 时放行', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 }],
      });
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0, true)).toBe(true);
      expect(isBlockedHorizontallyAt(geo, 0, 0, 0, false)).toBe(false);
    });

    it('盒子之外 → 不挡', () => {
      const geo = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 }],
      });
      expect(isBlockedHorizontallyAt(geo, 20, 20, 0)).toBe(false);
    });

    it('radius 参数把碰撞半径外扩', () => {
      const geo = geoFor({
        walls: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 3 }],
      });
      // 在 (1.5, 0)：默认 radius 0.45 → 1 + 0.45 = 1.45 < 1.5 → 不挡
      expect(isBlockedHorizontallyAt(geo, 1.5, 0, 0)).toBe(false);
      // radius=1 → 1 + 1 = 2 ≥ 1.5 → 挡
      expect(isBlockedHorizontallyAt(geo, 1.5, 0, 0, true, 1)).toBe(true);
    });
  });

  // ─── isBlockedHorizontallyAt — ramp 楔形侧/端面阻挡（回归：曾可从侧/端钻入坡体）──
  describe('isBlockedHorizontallyAt (ramp 楔形)', () => {
    // 轴对齐 ramp：沿 +X 从 lowY=0 升到 highY=4，halfSlope=5、halfPerp=2。
    // pCoord = z（slopeDir=+X）；sCoord = x；surfaceY = 4·(x+5)/10。
    const rampGeo = () => geoFor({
      ramps: [{ cx: 0, cz: 0, halfSlope: 5, halfPerp: 2, slopeDirX: 1, slopeDirZ: 0, lowY: 0, highY: 4 }],
    });

    it('站在斜面上（脚≈斜面高）→ 不挡', () => {
      // 中点 x=0 斜面高 2，脚在 2 → 差 0 ≤ STEP
      expect(isBlockedHorizontallyAt(rampGeo(), 0, 0, 2)).toBe(false);
    });

    it('从低端走上斜坡（低端高≈0）→ 不挡', () => {
      expect(isBlockedHorizontallyAt(rampGeo(), -5, 0, 0)).toBe(false);
    });

    it('低处撞高端面 → 挡（端面，#6）', () => {
      // 高端 x=5 斜面高 4，脚在 0 → 差 4 > STEP
      expect(isBlockedHorizontallyAt(rampGeo(), 5, 0, 0)).toBe(true);
    });

    it('低处从侧面钻入斜坡高段 → 挡（侧面位置式，#7）', () => {
      // x=3 斜面高 3.2，z=2 在 footprint 内，脚在 0 → 挡
      expect(isBlockedHorizontallyAt(rampGeo(), 3, 2, 0)).toBe(true);
    });

    it('radius 外扩：高端面外 radius 带内仍挡，带外不挡', () => {
      expect(isBlockedHorizontallyAt(rampGeo(), 5.4, 0, 0)).toBe(true);   // 5.4 < 5+0.45
      expect(isBlockedHorizontallyAt(rampGeo(), 5.5, 0, 0)).toBe(false);  // 5.5 > 5.45 → footprint 外
    });

    it('斜坡整体在头顶之上 → 不挡（可从下穿过）', () => {
      const raised = geoFor({
        ramps: [{ cx: 0, cz: 0, halfSlope: 5, halfPerp: 2, slopeDirX: 1, slopeDirZ: 0, lowY: 5, highY: 9 }],
      });
      // bottomY=5 ≥ headY(0+1.4) → 楔形在头顶之上
      expect(isBlockedHorizontallyAt(raised, 5, 0, 0)).toBe(false);
    });
  });

  // ─── colcyl_ 圆形平台（disc）──────────────────────────────────────
  describe('disc（colcyl_ 圆形平台）', () => {
    const discGeo = () => geoFor({
      collisionDiscs: [{ cx: 0, cz: 0, radius: 3, height: 2 }],
    });

    it('高度查询按圆形 footprint：圆内有顶面、外接方角处无（修复"方形碰撞")', () => {
      expect(getTerrainHeightAt(discGeo(), 0, 0)).toBe(2);       // 圆心
      expect(getTerrainHeightAt(discGeo(), 2.9, 0)).toBe(2);     // 半径内
      expect(getTerrainHeightAt(discGeo(), 2.9, 2.9)).toBe(0);   // 外接方角（dist≈4.1>3）→ 圆外，软虚空
      expect(getTerrainHeightAt(discGeo(), 5, 0)).toBe(0);       // 圆外
    });

    it('横向阻挡按圆形 footprint：圆内挡、方角不挡', () => {
      expect(isBlockedHorizontallyAt(discGeo(), 0, 0, 0)).toBe(true);    // 圆内、顶面高于迈步 → 挡
      expect(isBlockedHorizontallyAt(discGeo(), 2.9, 2.9, 0)).toBe(false); // 方角圆外 → 不挡（方形会误挡）
    });

    it('顶面在迈步内 → 可踩上去不挡', () => {
      const lowDisc = geoFor({ collisionDiscs: [{ cx: 0, cz: 0, radius: 3, height: 0.3 }] });
      expect(isBlockedHorizontallyAt(lowDisc, 0, 0, 0)).toBe(false);
    });
  });

  // ─── findClimbAt ───────────────────────────────────────────────────

  describe('findClimbAt', () => {
    it('在 climb_ footprint 内、高度区间内 → 返回该 climb', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 }],
      });
      const found = findClimbAt(geo, 0, 0, 1);
      expect(found).not.toBeNull();
      expect(found?.topY).toBe(4);
    });

    it('在 footprint 外（超出 grab margin）→ null', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 }],
      });
      // grab margin 0.6, halfW 1 → 边界 1.6；测 2 应该 null
      expect(findClimbAt(geo, 2, 0, 1)).toBeNull();
    });

    it('feetY 远高于 topY → null', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 }],
      });
      expect(findClimbAt(geo, 0, 0, 10)).toBeNull();
    });

    it('feetY 远低于 bottomY → null', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 5, topY: 9 }],
      });
      expect(findClimbAt(geo, 0, 0, 0)).toBeNull();
    });

    it('feetY 略低于 bottomY (margin 0.5)→ 仍可抓', () => {
      const geo = geoFor({
        climbVolumes: [{ cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 5, topY: 9 }],
      });
      expect(findClimbAt(geo, 0, 0, 4.7)).not.toBeNull();
    });

    it('多个 climb_，返回第一个匹配的', () => {
      const geo = geoFor({
        climbVolumes: [
          { cx: 0, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 },
          { cx: 10, cz: 0, halfW: 1, halfD: 1, bottomY: 0, topY: 4 },
        ],
      });
      expect(findClimbAt(geo, 0, 0, 1)?.cx).toBe(0);
      expect(findClimbAt(geo, 10, 0, 1)?.cx).toBe(10);
    });
  });

  // ─── makeLevelGeometry / 实例隔离 ──────────────────────────────────

  describe('makeLevelGeometry / 实例隔离', () => {
    it('不传 level → 返回 NEON_CRUCIBLE_GEOMETRY', () => {
      const geo = makeLevelGeometry();
      expect(geo).toBe(NEON_CRUCIBLE_GEOMETRY);
      expect(geo.wysiwyg).toBe(false);
      expect(getTerrainHeightAt(geo, 38, 38)).toBe(6);
    });

    it('两个实例互不干扰（无全局状态）', () => {
      const geo1 = geoFor({
        collisionRects: [{ cx: 0, cz: 0, halfW: 5, halfD: 5, height: 3 }],
      });
      const geo2 = geoFor({
        collisionRects: [{ cx: 100, cz: 100, halfW: 1, halfD: 1, height: 9 }],
      });
      // geo1 看不到 geo2 的几何
      expect(getTerrainHeightAt(geo1, 100, 100)).toBe(0);
      expect(getTerrainHeightAt(geo1, 0, 0)).toBe(3);
      // geo2 看不到 geo1 的几何
      expect(getTerrainHeightAt(geo2, 0, 0)).toBe(0);
      expect(getTerrainHeightAt(geo2, 100, 100)).toBe(9);
    });
  });

  // ─── 广相网格等价性（grid vs 全量扫描）──────────────────────────────
  describe('GeoGrid 广相索引与全量扫描完全等价', () => {
    const geo = geoFor({
      collisionRects: [
        { cx: 0, cz: 0, halfW: 8, halfD: 8, height: 0 },
        { cx: 20, cz: -10, halfW: 4, halfD: 6, height: 3 },
        { cx: -25, cz: 18, halfW: 5, halfD: 5, height: 5, baseY: 0 },
      ],
      collisionDiscs: [{ cx: 12, cz: 12, radius: 4, height: 2 }],
      walls: [{ cx: 5, cz: -20, halfW: 2, halfD: 8, bottomY: 0, topY: 4 }],
      ramps: [{
        cx: -10, cz: -10, halfSlope: 6, halfPerp: 3,
        slopeDirX: 1, slopeDirZ: 0, lowY: 0, highY: 4,
      }],
      climbVolumes: [{ cx: 30, cz: 30, halfW: 1.5, halfD: 1.5, bottomY: 0, topY: 6 }],
    });
    // 同几何但去掉 grid → 触发全量扫描分支
    const noGrid: LevelGeometry = { ...geo, grid: undefined };

    it('getTerrainHeight / getSupportHeight / isBlocked / findClimb 在采样网格上逐点一致', () => {
      expect(geo.grid).toBeDefined();
      for (let x = -40; x <= 40; x += 1.3) {
        for (let z = -40; z <= 40; z += 1.7) {
          expect(getTerrainHeightAt(geo, x, z)).toBe(getTerrainHeightAt(noGrid, x, z));
          for (const feetY of [0, 1, 3, 5]) {
            expect(getSupportHeightAt(geo, x, z, feetY)).toBe(getSupportHeightAt(noGrid, x, z, feetY));
            expect(isBlockedHorizontallyAt(geo, x, z, feetY)).toBe(isBlockedHorizontallyAt(noGrid, x, z, feetY));
          }
          expect(findClimbAt(geo, x, z, 1)?.cx).toBe(findClimbAt(noGrid, x, z, 1)?.cx);
        }
      }
    });
  });
});
