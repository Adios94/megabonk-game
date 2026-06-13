# 关卡制作工作流 — 从 Blender 到游戏

## 概述

本文档描述了从 Blender 中搭建关卡场景到最终在游戏中加载运行的完整流程。任何接手此项目的人都应先阅读此文档。

---

## 整体工作流

```
设计师 (Blender)                     程序 (代码)
─────────────────                    ────────────
1. 打开模型库 .blend 文件             ← 由脚本自动生成
2. 拼接关卡场景（摆放模型）
3. 标记碰撞区域（Empty Box 物体）
4. 标记生成点（Empty Arrows 物体）
5. 导出 .glb 场景文件                → 代码解析 .glb
                                     → 根据物体名识别模型类型
                                     → 同类模型合并为 InstancedMesh
                                     → 碰撞节点 → 生成地形高度数据
                                     → 生成点 → 设置玩家/Boss位置
                                     → 关卡切换系统按 Tier 加载
```

---

## 第一步：生成 Blender 模型库

### 前置条件
- Blender 3.6+ 已安装
- 项目模型文件位于 `dist/models/`

### 生成方法

运行命令（需要 Blender 命令行可用）：

```bash
blender --background --python level-editor/build_asset_library.py
```

或在 Mac 上如果 Blender 在 DMG 中：

```bash
"/Volumes/Blender/Blender.app/Contents/MacOS/Blender" --background --python level-editor/build_asset_library.py
```

脚本会：
1. 清空默认场景
2. 按分类导入 `dist/models/` 下所有 GLTF/GLB 模型
3. 创建参考网格（120×120 和 200×200）
4. 保存为 `level-editor/megabonk_asset_library.blend`

### 生成后的文件结构

```
level-editor/
├── build_asset_library.py        ← 模型库生成脚本
├── import_assets.py              ← 可选：手动在 Blender 中运行的版本
├── README.md                     ← 操作指南
├── megabonk_asset_library.blend  ← 生成的模型库（约 2MB）
└── exports/                      ← 导出的关卡文件放这里
    ├── level_cybercity.glb
    └── level_rooftop.glb
```

---

## 第二步：在 Blender 中搭建关卡

### 打开模型库

```bash
open level-editor/megabonk_asset_library.blend
```

### 模型库中的集合 (Collection) 结构

| 集合名 | 内容 | 数量 |
|--------|------|------|
| Platforms | 所有平台模型 | 7 种 |
| Structures | 支撑柱、栏杆、围栏、门 | 9 种 |
| Decorations | 路灯、招牌、空调、管道等 | 14 种 |
| Props | 宝箱、炮台、传送器、拾取物 | 6 种 |
| Nature | 树、墓碑、南瓜 | 3 种 |
| _Reference | 参考网格 (120×120, 200×200) | 2 个 |

### 搭建操作

1. **新建关卡集合**：Outliner 右键 → New Collection → 命名如 `Level_CyberCity`
2. **复制模型**：从分类集合中选择模型 → `Shift+D` 复制 → `M` 移到关卡集合
3. **摆放**：`G`(移动) `R`(旋转) `S`(缩放)
4. **对齐技巧**：按 `G` 再按 `X`/`Y`/`Z` 锁定轴向移动

### 重要注意事项

- **不要修改模型本身的网格/材质**，只做位移、旋转、缩放
- **保持物体名前缀不变**：Blender 自动加的 `.001` `.002` 后缀没关系
- **Y 轴是深度（前后），Z 轴是高度（上下）**：这是 Blender 的坐标系
- **模型原始尺寸约 1-4 单位**：通常需要 scale 2.0-3.0 来铺满区域

---

## 第三步：标记碰撞区域

碰撞区域决定了玩家可以站在哪里、平台在哪里。

### 创建碰撞体积

1. `Shift+A` → Empty → Cube
2. 命名为 `col_描述`（如 `col_ground_center`、`col_tower_north`）
3. 移动到平台位置
4. 调整 Scale 表示碰撞范围

### 碰撞体积参数含义

```
物体名:    col_platform_north_tower
位置:      X=0, Y=-40, Z=4        ← Blender 坐标
Scale X:   5                       ← 碰撞半宽
Scale Y:   5                       ← 碰撞半深
Scale Z:   0.1                     ← 无意义（厚度，忽略）
```

代码解析后转换为游戏碰撞格式：
```
[centerX=0, centerZ=40, halfWidth=5, halfDepth=5, height=4]
```

### 转换规则 (Blender → 游戏)

| Blender | 游戏 | 说明 |
|---------|------|------|
| X | X | 不变 |
| Y | -Z | 深度轴翻转 |
| Z | Y (height) | 高度 |
| Scale X | halfWidth | 碰撞半宽 |
| Scale Y | halfDepth | 碰撞半深 |

### 坡道系统

代码中每个碰撞矩形的边缘自动有 3 单位的坡道过渡。无需手动创建坡道。

| 平台高度 | 坡度 | 说明 |
|---------|------|------|
| y=2 | 0.67/单位 | 缓坡，走路/兔子跳可上 |
| y=4 | 1.33/单位 | 中坡，走路可上 |
| y=6 | 2.0/单位 | 陡坡，走路可上但很陡 |

---

## 第四步：标记生成点

生成点决定了玩家、Boss、传送器出现的位置。

### 创建方法

1. `Shift+A` → Empty → Arrows
2. 命名为对应前缀
3. 移动到期望位置

### 生成点类型

| 物体名 | 功能 | 数量要求 |
|--------|------|---------|
| `spawn_player` | 玩家出生点 | 必须 1 个 |
| `spawn_boss` | Boss 出生位置 | 必须 1 个 |
| `spawn_teleporter` | 传送器可能出现的位置 | 0-3 个 |
| `spawn_teleporter_1` | 传送器位置 1 | 可选 |
| `spawn_teleporter_2` | 传送器位置 2 | 可选 |
| `spawn_enemy_N` | 北面敌人刷新区 | 可选 |
| `spawn_enemy_S` | 南面敌人刷新区 | 可选 |
| `spawn_enemy_E` | 东面敌人刷新区 | 可选 |
| `spawn_enemy_W` | 西面敌人刷新区 | 可选 |

如果不设置 `spawn_enemy_*`，敌人默认从地图边缘（±65 单位）生成。

---

## 第五步：导出

### 导出设置

1. 选中关卡集合中的**所有物体**（包括碰撞和生成点）
2. `File` → `Export` → `glTF 2.0 (.glb/.gltf)`
3. 右侧面板设置：
   - **Format**: `GLB`（单文件，方便管理）
   - **Include**: `Selected Objects`（只导出选中的）
   - **Transform → +Y Up**: ✅ 勾选（坐标系转换）
   - **Geometry → Apply Modifiers**: ✅
   - **Animation**: ❌ 不需要（关卡是静态的）
4. 保存路径: `dist/models/levels/level_关卡名.glb`

### 导出检查清单

- [ ] 是否包含至少 1 个 `spawn_player`
- [ ] 是否包含至少 1 个 `spawn_boss`
- [ ] 是否有足够的 `col_` 碰撞体积覆盖所有平台
- [ ] 所有模型物体名前缀是否正确
- [ ] 是否勾选了 `+Y Up`
- [ ] 文件大小是否合理（通常 < 5MB）

---

## 命名规范（核心约定）

代码通过物体名的**前缀**来识别类型。Blender 自动加的 `.001` `.002` 后缀会被忽略。

### 模型物体

| 物体名前缀 | 代码处理方式 |
|-----------|------------|
| `platform_4x4` | 识别为 4×4 平台 → InstancedMesh 批量渲染 |
| `platform_4x2` | 识别为 4×2 平台 → InstancedMesh |
| `platform_2x2` | 识别为 2×2 平台 → InstancedMesh |
| `platform_1x1` | 识别为 1×1 平台 → InstancedMesh |
| `platform_2x1` | 识别为 2×1 平台 → InstancedMesh |
| `platform_4x1` | 识别为 4×1 平台 → InstancedMesh |
| `support` | 短支撑 → InstancedMesh |
| `support_short` | 矮支撑 → InstancedMesh |
| `support_long` | 高支撑 → InstancedMesh |
| `fence_platform` | 围栏段 → InstancedMesh |
| `fence` | 独立围栏 → InstancedMesh |
| `rail_long` | 长护栏 → InstancedMesh |
| `rail_short` | 短护栏 → InstancedMesh |
| `rail_corner` | 转角护栏 → InstancedMesh |
| `light_street` | 路灯 → InstancedMesh |
| `light_square` | 方灯 → InstancedMesh |
| `sign_1` | 招牌 A → InstancedMesh |
| `sign_2` | 招牌 B → InstancedMesh |
| `sign_3` | 招牌 C → InstancedMesh |
| `ac_unit` | 空调 → InstancedMesh |
| `ac_stacked` | 堆叠空调 → InstancedMesh |
| `pipe_1` | 管道 A → InstancedMesh |
| `pipe_2` | 管道 B → InstancedMesh |
| `door` | 门 → InstancedMesh |
| `antenna_1` | 天线 → InstancedMesh |
| `tv_1` | 电视 → InstancedMesh |
| `computer` | 电脑 → InstancedMesh |
| `tree` | 树 → InstancedMesh |
| `tombstone` | 墓碑 → InstancedMesh |
| `pumpkin` | 南瓜 → InstancedMesh |
| `turret_cannon` | 炮台 → InstancedMesh |
| `turret_teleporter` | 传送器模型 → InstancedMesh |
| `lootbox` | 宝箱 → InstancedMesh |

### 碰撞物体

| 物体名前缀 | 含义 |
|-----------|------|
| `col_` | 碰撞体积 → 生成 getTerrainHeight() 数据 |

### 逻辑物体

| 物体名前缀 | 含义 |
|-----------|------|
| `spawn_player` | 玩家出生点 |
| `spawn_boss` | Boss 出生位置 |
| `spawn_teleporter` | 传送器位置 |
| `spawn_enemy_` | 敌人刷新区域 |

---

## 性能方案

### 为什么需要性能优化

500-2000 个模型实例如果每个都是独立的 `Object3D.clone()`，会产生 2000 个 draw call，帧率会骤降。

### 优化策略

| 策略 | 适用场景 | 效果 |
|------|---------|------|
| **InstancedMesh** | 同类模型多次放置（平台、围栏、路灯） | Draw call 从 2000 降到 ~15 |
| **合并几何体** | 完全静态的装饰物 | 减少 scene graph 开销 |
| **视锥剔除** | Three.js 自带 | 只渲染摄像头看得到的 |
| **LOD** | 远处物体用简化版 | 减少三角面数 |
| **分区加载** | 超大场景 | 只加载玩家附近区域 |

### 当前规模结论

对于 200×200、500-2000 实例的规模：
- **InstancedMesh + 视锥剔除** 基本够用
- 不需要分区加载
- 不需要 LOD（模型本身面数很低）

### 性能预算（单关卡）

| 模型类型 | 建议最大实例数 | 说明 |
|---------|--------------|------|
| platform_4x4 | 50 | 大面积覆盖 |
| platform_4x2 | 80 | 走廊/过道 |
| platform_2x2 / 1x1 | 40 | 小平台 |
| support / support_long | 100 | 结构支撑 |
| fence_platform | 150 | 围栏，简单几何 |
| light_street | 40 | 中等复杂度 |
| sign_1 / sign_2 | 20 | 有纹理 |
| ac_unit / pipe | 60 | 小装饰物 |
| **总计** | **< 800** | 超过考虑合并 |

---

## 代码侧实现（Level Loader）

### 加载流程

```typescript
// 1. 加载 .glb 文件
const gltf = await gltfLoader.loadAsync('/models/levels/level_cybercity.glb');

// 2. 遍历所有节点
gltf.scene.traverse((node) => {
  const name = node.name;

  if (name.startsWith('col_')) {
    // 碰撞体积 → 提取位置和尺寸
    collisionRects.push({
      centerX: node.position.x,
      centerZ: -node.position.y,  // Blender Y → 游戏 -Z
      halfWidth: node.scale.x,
      halfDepth: node.scale.y,
      height: node.position.z,    // Blender Z → 游戏 Y(height)
    });
  }
  else if (name.startsWith('spawn_')) {
    // 生成点 → 记录位置
    spawnPoints[name] = {
      x: node.position.x,
      y: node.position.z,
      z: -node.position.y,
    };
  }
  else {
    // 模型实例 → 按前缀分组
    const modelType = name.split('.')[0];
    instanceGroups[modelType].push(node.matrix);
  }
});

// 3. 为每个模型类型创建 InstancedMesh
for (const [type, matrices] of Object.entries(instanceGroups)) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((mat, i) => mesh.setMatrixAt(i, mat));
  scene.add(mesh);
}
```

### 关卡切换

```typescript
// 根据 Tier 加载不同关卡
const LEVEL_FILES: Record<DifficultyTier, string> = {
  1: '/models/levels/level_cybercity.glb',
  2: '/models/levels/level_rooftop.glb',
  3: '/models/levels/level_underground.glb',
};
```

---

## Blender 操作速查

| 操作 | 快捷键 |
|------|--------|
| 移动物体 | `G` (然后 X/Y/Z 锁轴) |
| 旋转物体 | `R` (然后 X/Y/Z 锁轴) |
| 缩放物体 | `S` |
| 复制物体 | `Shift+D` |
| 删除物体 | `X` |
| 全选 | `A` |
| 框选 | `B` |
| 移动到集合 | `M` |
| 添加 Empty | `Shift+A` → Empty |
| 吸附到网格 | 按住 `Ctrl` 移动 |
| 精确输入 | 操作后直接输入数字 |
| 聚焦选中物体 | `.` (小键盘) |
| 俯视图 | `Numpad 7` |
| 正面图 | `Numpad 1` |
| 侧面图 | `Numpad 3` |

---

## 常见问题

### Q: 导出后模型方向不对？
确保导出时勾选了 `+Y Up`。Blender 用 Z-up，Three.js 用 Y-up，这个选项自动转换。

### Q: 碰撞区域和视觉不匹配？
检查 `col_` 物体的位置和 Scale 是否与对应的平台模型对齐。建议把碰撞物体放到平台模型上方，调整到完全覆盖。

### Q: 模型加载后太小/太大？
在 Blender 中调整 Scale，导出时会保留缩放信息。游戏中不会再二次缩放。

### Q: 可以新增自定义模型吗？
不可以。必须使用 `dist/models/` 中已有的模型文件。如果需要新模型，需要先将其放入 `dist/models/` 并在代码中注册。

### Q: 如何测试关卡？
1. 导出 `.glb` 到 `dist/models/levels/`
2. 修改代码中的关卡文件路径
3. 运行 `pnpm dev`
4. 在浏览器中体验

---

## 文件目录

```
megabonk-game/
├── dist/models/              ← 所有原始模型文件
│   ├── platform_4x4.gltf
│   ├── support_long.gltf
│   ├── ...
│   └── levels/               ← 导出的关卡文件放这里
│       ├── level_cybercity.glb
│       └── level_rooftop.glb
├── level-editor/             ← 关卡编辑工具
│   ├── build_asset_library.py
│   ├── import_assets.py
│   ├── README.md
│   └── megabonk_asset_library.blend
├── game/
│   ├── client/source/index.ts    ← 渲染代码 (LevelLoader / tryLoadLevel)
│   └── core/source/
│       └── GameInstance.ts        ← 碰撞逻辑 (getTerrainHeight)
```
