# 关卡制作指南

## 概述

本项目的关卡由两部分组成：
1. **视觉布局** — `game/client/source/index.ts` 中的 `buildArena()` 方法，负责 3D 模型的摆放
2. **碰撞数据** — `game/core/source/GameInstance.ts` 中的 `getTerrainHeight()` 方法，负责地形高度和平台碰撞

两者必须同步：视觉上放了一个平台，碰撞数据里就要有对应的矩形区域。

---

## 可用资源

所有模型位于 `dist/models/`，只能使用这些文件：

### 平台类
| 模型文件 | 描述 | 大约尺寸(未缩放) |
|---------|------|-----------------|
| platform_4x4_full.gltf | 大平台(实心) | 4×4 |
| platform_4x4.gltf | 大平台 | 4×4 |
| platform_4x2.gltf | 中平台 | 4×2 |
| platform_2x2.gltf | 小方平台 | 2×2 |
| platform_2x1.gltf | 小长平台 | 2×1 |
| platform_1x1.gltf | 最小平台 | 1×1 |
| platform_4x1.gltf | 窄长平台 | 4×1 |

### 结构类
| 模型文件 | 描述 |
|---------|------|
| support.gltf | 短支撑柱 |
| support_short.gltf | 矮支撑柱 |
| support_long.gltf | 高支撑柱 |
| fence_platform.gltf | 围栏段 |
| fence.glb | 独立围栏 |
| rail_long.gltf | 长护栏 |
| rail_short.gltf | 短护栏 |
| rail_corner.gltf | 转角护栏 |
| door.gltf | 门(装饰) |

### 装饰类
| 模型文件 | 描述 |
|---------|------|
| light_street_1.gltf | 路灯 A |
| light_street_2.gltf | 路灯 B |
| light_square.gltf | 方形灯 |
| sign_1.gltf | 霓虹招牌 A |
| sign_2.gltf | 霓虹招牌 B |
| sign_3.gltf | 霓虹招牌 C |
| sign_corner_1.gltf | 转角招牌 |
| ac_unit.gltf | 空调外机 |
| ac_stacked.gltf | 堆叠空调 |
| pipe_1.gltf | 管道 A |
| pipe_2.gltf | 管道 B |
| antenna_1.gltf | 天线 |
| tv_1.gltf | 电视 |
| computer.gltf | 电脑 |

### 道具类
| 模型文件 | 描述 |
|---------|------|
| lootbox.gltf | 宝箱 |
| turret_cannon.gltf | 炮台 |
| turret_teleporter.gltf | 传送器 |
| collectible_gear.gltf | 收集齿轮 |
| pickup_health.gltf | 血瓶 |
| pickup_heart.gltf | 爱心 |

### 自然类
| 模型文件 | 描述 |
|---------|------|
| tree.glb | 树 |
| tombstone.glb | 墓碑 |
| pumpkin.glb | 南瓜 |

---

## 碰撞系统

### getTerrainHeight() 格式

```typescript
private getTerrainHeight(x: number, z: number): number {
  const platforms: [number, number, number, number, number][] = [
    // [centerX, centerZ, halfWidth, halfDepth, height]
    [0, 0, 15, 15, 0],  // 中心点(0,0)，范围±15，高度0
  ];

  let height = 0;
  for (const [cx, cz, hw, hd, h] of platforms) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);

    // 在平台上方
    if (dx <= hw && dz <= hd) {
      height = Math.max(height, h);
    }
    // 在坡道区域（3单位过渡）
    else if (dx <= hw + 3 && dz <= hd + 3) {
      const edgeDist = Math.max(dx - hw, dz - hd, 0);
      if (edgeDist <= 3) {
        const rampHeight = h * (1 - edgeDist / 3);
        height = Math.max(height, rampHeight);
      }
    }
  }
  return height;
}
```

### 参数说明

- `centerX, centerZ` — 平台中心点在世界坐标的 XZ 位置
- `halfWidth` — X 方向半宽（实际宽度 = halfWidth × 2）
- `halfDepth` — Z 方向半深（实际深度 = halfDepth × 2）
- `height` — 平台表面的 Y 高度

### 坡道过渡

每个平台边缘自动有 3 单位的坡道：
- height=2 的平台 → 边缘 3 单位内从 2 平滑过渡到 0
- 坡度 = height / 3（如 y=2 → 0.67 每单位, y=6 → 2.0 每单位）

### 玩家物理限制

| 动作 | 数值 | 可达高度 |
|------|------|---------|
| 普通跳跃 | 力=8, 重力=20 | ≈1.6 单位 |
| 兔子跳 | ×1.3倍 | ≈2.1 单位 |
| 滑铲 | 1.8倍速度, 0.6秒 | 无垂直增益 |

意味着：
- y=2 平台：可通过坡道走上，或兔子跳直接上
- y=4 平台：必须通过坡道走上
- y=6 平台：必须通过坡道走上（坡很陡但可行）

---

## 视觉布局系统

### placeModel() 方法

```typescript
this.placeModel(modelKey, x, y, z, rotationY, scale);
```

- `modelKey` — LoadedModels 接口中的键名（如 `'platform_4x4'`）
- `x, y, z` — 世界坐标位置
- `rotationY` — Y 轴旋转（弧度）
- `scale` — 统一缩放倍数

### 模型键名映射

代码中使用的 key 和实际文件的对应关系：

```typescript
['platform_4x4', '/models/platform_4x4_full.gltf'],
['platform_4x2', '/models/platform_4x2.gltf'],
['platform_2x2', '/models/platform_2x2.gltf'],
['platform_1x1', '/models/platform_1x1.gltf'],
['support', '/models/support.gltf'],
['support_long', '/models/support_long.gltf'],
['rail_long', '/models/rail_long.gltf'],
['fence_platform', '/models/fence_platform.gltf'],
['light_street', '/models/light_street_1.gltf'],
['sign_1', '/models/sign_1.gltf'],
['sign_2', '/models/sign_2.gltf'],
['ac_unit', '/models/ac_unit.gltf'],
['pipe_1', '/models/pipe_1.gltf'],
['door', '/models/door.gltf'],
```

---

## 当前关卡：Neon Crucible

### 布局俯视图

```
                    N (-Z)
         ┌─────────────────────────┐
         │   [NW巢y6]     [NE巢y6] │
         │        ╔═══════╗        │
         │   ┌──┐ ║N塔 y4║ ┌──┐   │
         │   │NW│ ║      ║ │NE│   │  ← y=2 环形
         │   └──┘ ╚═══════╝ └──┘  │
         │         │ N走廊 │        │
         │    ┌────┤       ├────┐  │
    W    │════╡W塔 ║ 竞技场 ║ E塔╞══│    E
  (-X)   │    │y=4 ║ 30×30 ║ y=4│  │   (+X)
         │    └────╢       ╟────┘  │
         │         │ S走廊 │        │
         │   ┌──┐ ╔═══════╗ ┌──┐  │
         │   │SW│ ║S塔 y4║ │SE│   │
         │   └──┘ ╚═══════╝ └──┘  │
         │   [SW巢y6]     [SE巢y6] │
         └─────────────────────────┘
                    S (+Z)
```

### 区域划分

| 区域 | 高度 | 用途 |
|------|------|------|
| 中央竞技场 | y=0 | Boss 战，主要战斗区 |
| 四条走廊 | y=0 | 敌人引导通道，AOE 武器有效 |
| 环形平台(8个) | y=2 | 逃跑路线，战术转移 |
| 瞭望塔(4个) | y=4 | 远程攻击高地 |
| 巢穴(4个) | y=6 | 高风险小平台 |

### 碰撞数据（25个矩形）

```typescript
// y=0 地面层 (13个)
[0, 0, 15, 15, 0],       // 中央竞技场 30×30
[0, -30, 6, 15, 0],      // 北走廊
[0, 30, 6, 15, 0],       // 南走廊
[30, 0, 15, 6, 0],       // 东走廊
[-30, 0, 15, 6, 0],      // 西走廊
[15, -15, 5, 5, 0],      // 对角填充 ×4
[-15, -15, 5, 5, 0],
[15, 15, 5, 5, 0],
[-15, 15, 5, 5, 0],
[0, -50, 8, 5, 0],       // 走廊端点 ×4
[0, 50, 8, 5, 0],
[50, 0, 5, 8, 0],
[-50, 0, 5, 8, 0],

// y=2 环形层 (8个)
[0, -25, 5, 4, 2],       // N/S/E/W 站点
[0, 25, 5, 4, 2],
[25, 0, 4, 5, 2],
[-25, 0, 4, 5, 2],
[20, -20, 5, 5, 2],      // 对角连接点 ×4
[-20, -20, 5, 5, 2],
[20, 20, 5, 5, 2],
[-20, 20, 5, 5, 2],

// y=4 瞭望塔 (4个)
[0, -40, 5, 5, 4],
[0, 40, 5, 5, 4],
[40, 0, 5, 5, 4],
[-40, 0, 5, 5, 4],

// y=6 巢穴 (4个)
[38, -38, 3, 3, 6],
[-38, -38, 3, 3, 6],
[38, 38, 3, 3, 6],
[-38, 38, 3, 3, 6],
```

---

## 游戏配置相关

| 参数 | 值 | 影响 |
|------|----|------|
| MAP_SIZE | 120 | 玩家移动边界 ±60 |
| 敌人生成 | ±65 | 从地图边缘外 5 单位生成 |
| Boss 生成 | (0, 0, -36) | 北走廊中段 |
| 传送器时间 | 300秒 | 5分钟时出现 |
| Boss 时间 | 540秒 | 9分钟时出现 |

---

## 未来关卡扩展方案

计划支持 3-5 个关卡，通过 Blender 搭建后导出 `.glb`：

1. 在 Blender 中用已有模型拼接场景
2. 碰撞体积用 Empty (Cube) 物体标记，名字以 `col_` 开头
3. 导出为 `.glb` 放到 `dist/models/levels/`
4. 代码自动解析场景文件，生成 InstancedMesh + 碰撞数据

### 命名规范

导出时物体名决定了代码如何处理：

| 前缀 | 含义 |
|------|------|
| `platform_4x4.xxx` | 4×4 平台模型实例 |
| `support_long.xxx` | 长支撑柱实例 |
| `col_xxx` | 碰撞体积 (Empty) |
| `spawn_player` | 玩家出生点 |
| `spawn_boss` | Boss 出生位置 |
| `spawn_teleporter` | 传送器位置 |

### 性能预算

单关卡建议上限：
- 总模型实例: < 800
- 同类型最大: 平台 130, 围栏 150, 装饰 60
- 代码会用 InstancedMesh 合并同类，实际 draw call 约 15-20
