# MegaBonk Three.js — 技术 / 性能 / 开发指南

> 本文档对照当前代码（`game/core/`、`game/client/`、`packages/`）。

---

## 一、整体架构

### 1. 双层分离：GameInstance + GameScene

| 层 | 文件 | 职责 | 依赖 Three.js |
|---|---|---|---|
| 逻辑 | `game/core/source/GameInstance.ts` | 60Hz tick 循环、状态推进、碰撞、AI、Boss、武器开火 | ❌ 禁止 |
| 渲染 | `game/client/source/index.ts` | Three.js 场景 / 模型 / VFX / HUD / 菜单 / 输入桥接 | ✅ |

驱动方式：

```
GameInstance.start()
  └─ tickTimer = setInterval(() => tick(), TICK_INTERVAL_MS=16.67ms)   // 60Hz 固定步长

GameScene.animate()
  └─ requestAnimationFrame → 读 GameInstance.getState() 快照 → 渲染   // 自适应帧率
```

两层解耦，渲染降帧不影响逻辑。

### 2. 核心规则（必须遵守）

1. **Three.js 命名空间导入**：`import * as THREE from 'three'`
2. **`game/core/` 禁止导入 Three.js**
3. **所有 Three.js 对象必须设置 `.name`**（便于调试 / 场景搜索）
4. **不修改 `packages/` 目录**（模板基础设施）
5. **导入路径使用 `.ts` 扩展名**：`import { foo } from './bar.ts'`
6. **Three.js 在 vite build 时作为 external**（生产环境需要 importmap）

### 3. 实际代码量

| 模块 | 行数 |
|---|---|
| `game/core/source/GameInstance.ts` | 2577 |
| `game/core/source/weapons.ts` | 419 |
| `game/core/` 其他（types/config/upgrades/quests/shop/save/physics/spatial-hash） | ~1500 |
| `game/client/source/index.ts` | 4568 |
| **核心 + 客户端合计** | **≈ 7766** |

---

## 二、模块职责

### 1. `game/core/`

```
GameInstance.ts (2577)
├── tick() — 主循环
│   ├── processPlayerMovement   (跳跃/滑铲/兔子跳/加速)
│   ├── updateEnemiesAI         (4 种 behavior + 3 个精英专属逻辑)
│   ├── fireWeapons             (7 种武器开火，cooldownTimer 推进)
│   ├── updateProjectiles       (轨道 / 普通 / 重力)
│   ├── processCollisions       (SpatialHash 投射物 vs 敌人)
│   ├── processEnemyAttacks     (近战 / 远程 / 冲刺判定)
│   ├── updatePickups
│   ├── checkPlayerDeath
│   ├── spawnEnemies            (波次 + Mini-Boss + Final Swarm)
│   ├── updateBossAI            (3 阶段)
│   ├── updateTeleporters
│   └── processDeaths           (击杀后掉落 / combo 累加)
├── selectUpgrade()             (玩家点选项后应用 + checkWeaponEvolutions)
├── recalculateTomeStats()      (典籍 + 商店 buff 重算到 player.*)
└── endRun()                    (结算银币 + 写存档)

config.ts          武器/敌人/角色/Tier/波次/典籍上限的所有数值
types.ts           WeaponType / TomeType / EnemyType / 状态接口
weapons.ts         (419) fireWeapon、updateOrbitingProjectile、applyGravitationalPull
upgrades.ts        升级选项构建 + 稀有度滚点 + xpForLevel
quests.ts          (202) 29 个跨局任务定义
shop.ts            8 个永久商店升级
save.ts            localStorage 读写 + run stats 累计
physics.ts         applyMovement3D、distanceBetween、normalizeDirection
spatial-hash.ts    SpatialHash（碰撞优化）
index.ts           barrel 导出
```

### 2. `game/client/source/index.ts` (4568)

```
LocalGameSession            (会话桥接：驱动 GameInstance + 调用渲染)
GameScene                   (Three.js 场景管理)
├── 模型加载                (GLTFLoader + OBJLoader + cloneSkeleton)
├── 角色/敌人/Boss 渲染      (cloneSkeleton + AnimationMixer 每实例)
├── 投射物渲染              (InstancedMesh，球体)
├── 拾取物渲染              (InstancedMesh，八面体)
├── 武器实例渲染            (axe/sword/bow 等 OBJ 模型)
├── VFX 粒子系统            (THREE.Points + 自定义 ShaderMaterial，500 池)
├── HUD                     (DOM overlay：HP/XP/计时/Combo)
├── 菜单/升级面板/商店/任务   (DOM)
├── 相机系统                (固定角度 + 动态 FOV + 屏震 + 顿帧)
└── 启动流程                (loadModels → showMainMenu → startGame)
```

---

## 三、输入系统

```
PlatformInput (mode: 'joystick')   ← @minigame/platform
├── 移动端: VirtualJoystick (左) + TouchButtons (右 3 按钮)
│         deadzone 0.15
└── 桌面端: WASD + Space + Shift   (DesktopInput)

输出映射:
  moveX/moveY  → 世界方向移动（已应用 deadzone）
  action1 (⬆️/Space) → 跳跃
  action2 (⬇️/Shift) → 滑铲
  action3 (🔥)       → 技能（预留）
```

> 输入抽象在 `packages/platform/source/`。**不要直接监听 keydown / touchstart**，统一通过 `PlatformInput` 实例。

---

## 四、渲染策略

| 实体 | 渲染方式 | 原因 |
|---|---|---|
| 玩家 | 直接使用 GLTF scene | 单实例，需要骨骼动画 |
| 敌人 | `SkeletonUtils.clone(model)` | 每实例独立 AnimationMixer |
| 投射物 (≤200) | `InstancedMesh` (SphereGeometry) | 数量多、形状简单 |
| 拾取物 (≤300) | `InstancedMesh` (OctahedronGeometry) | 数量多、形状简单 |
| 武器实例（轨道斧、剑、弓） | OBJ 模型克隆，每投射物一个 Object3D | 需要朝向控制 |
| 龙卷风 | （已删除） | — |
| Boss | `SkeletonUtils.clone(boss)` | 单实例，需要动画 |
| 平台 / 装饰 | clone GLTF scene | 静态 |
| 粒子 VFX | `THREE.Points + ShaderMaterial` | 500 粒子池，GPU 算大小 |

### 1. 模型克隆规则

```ts
// ❌ 错误：会破坏骨骼绑定
const clone = model.clone();

// ✅ 正确
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
const clone = cloneSkeleton(model);
clone.name = `enemy_${id}`;
```

### 2. 模型缩放

加载后用包围盒计算目标高度：

```ts
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
model.scale.multiplyScalar(targetHeight / maxDim);
```

### 3. 材质保留

GLTF 自带材质**不做运行时替换**，避免破坏卡通色调和原作者意图。

### 4. 相机系统

- 固定角度第三人称（不随玩家旋转）
- 玩家后方 7、上方 5
- 平滑跟随：移动 0.05、停下 0.1
- 动态 FOV（敌人多 → 拉远，Boss → 更远）
- 屏震（轻击高频 / 暴击中频 / Boss 低频）
- 顿帧：暴击 0.03 s、Boss 攻击 0.05 s

---

## 五、性能优化

### 1. 渲染层

| 措施 | 实现 |
|---|---|
| InstancedMesh 批量渲染 | 投射物 200 + 拾取物 300，`setMatrixAt` / `setColorAt` 更新 |
| 粒子 GPU 化 | `gl_PointSize = aSize × (400.0 / -mvPosition.z)` 在 vertex shader 算大小 |
| AdditiveBlending | 粒子叠加无需写 depth，节省 fillrate |
| `frustumCulled = false` | 关闭自动剔除，手动管理可见性，避免 every-frame 计算 |
| 高 DPI 限制 | `installThreeHighDpi` 把 pixelRatio 钳到 ≤2 |

### 2. 逻辑层

| 措施 | 实现 |
|---|---|
| SpatialHash 碰撞 | 网格 3 单位，避免 O(n²)，仅检测相邻格 |
| 60Hz 固定步长 | `setInterval` 驱动，dt 稳定 |
| 渲染解耦 | RAF 自适应帧率 |
| 局部内存 | 临时 Vector3/Matrix4 模块级预创建，热路径零 `new` |

> ⚠️ 旧文档曾写「敌人 AI 决策分 4 帧轮流」，**当前代码并未做此优化**（`updateEnemiesAI` 每 tick 处理所有敌人）。如要做，可在 `enemy.aiPhase` 字段上按 `tick % 4 === aiPhase` 调度。

### 3. 对象池

| 对象 | 池大小 | 来源常量 |
|---|---|---|
| 投射物 InstancedMesh | 200 | `MAX_PROJECTILES` |
| 拾取物 InstancedMesh | 300 | `MAX_PICKUPS` |
| 敌人 InstancedMesh（legacy） | 100 | `MAX_ENEMIES` |
| VFX 粒子 | 500 | `MAX_PARTICLES`（client/index.ts:722） |

### 4. 性能指标目标

| 平台 | 目标帧率 | 最大同屏敌人 | 最大粒子 |
|---|---|---|---|
| 桌面 | 60fps | 100 | 500 |
| 移动端中端 | 30–60fps | 80 | 300 |
| Final Swarm（任意端） | ≥30fps | 150 | 500 |

---

## 六、存档结构

`save.ts` — `localStorage` key: `megabonk_save`

```ts
interface SaveData {
  version: number;
  silver: number;
  shopLevels: Record<string, number>;
  questsCompleted: string[];
  weaponsUnlocked: string[];
  charactersUnlocked: string[];
  extraWeaponSlots: number;
  stats: {
    totalKills: number;
    totalRuns: number;
    bestSurvivalTime: number;
    highestLevel: number;
    bossesDefeated: number;
    totalEvolutions: number;
  };
}
```

写时机：
- `endRun()` 写 stats 和银币
- `selectUpgrade(tome)` → `recalculateTomeStats()` 期间从 `getShopBonuses()` 读
- `purchaseUpgrade(id)` 写 shopLevels

---

## 七、开发指南

### 1. 启动

```bash
pnpm install
pnpm run dev
# 浏览器打开 http://localhost:1513/
```

环境变量：`VITE_I18N_LOCALE=zh VITE_I18N_MODE=dev`（默认中文，dev mode 显示缺失 key）。

### 2. 目录结构

```
megabonk-game/
├── game/
│   ├── core/source/        # 纯逻辑（不导 Three.js）
│   └── client/source/      # 渲染 + UI
├── packages/               # 模板基础设施（不修改）
│   ├── platform/             虚拟摇杆 / 触控按钮 / 桌面输入
│   ├── render-adapter/       高 DPI 适配
│   └── i18n/                 翻译运行时 + Vite 插件
├── public/
│   ├── models/             GLTF / GLB / OBJ 模型
│   └── textures/           粒子纹理
├── i18n/
│   ├── zh.json
│   └── en.json
├── docs/                   本文档目录
├── index.html
├── vite.config.ts
└── tsconfig.json
```

### 3. 改数值的常见入口

| 想做什么 | 改哪里 |
|---|---|
| 改武器某级数值 | `config.ts WEAPON_STATS[type][level-1]` |
| 加新武器 | `types.ts WeaponType` → `config.ts WEAPON_STATS` → `weapons.ts fireWeapon` 加分支 → `GameInstance.fireWeapon` 加 case → `client/index.ts` 加颜色 / 图标 / 模型 → i18n |
| 加新典籍 | `types.ts TomeType` → `config.ts TOME_MAX_LEVELS` → `recalculateTomeStats()` 或对应业务路径加结算 → i18n |
| 调难度 | `config.ts TIER_CONFIGS` |
| 调波次 / Final Swarm | `config.ts WAVE_CONFIGS`、`GameInstance.ts:1881` |
| 调 Boss | `config.ts BOSS_SPAWN_TIME / BOSS_HP`、`GameInstance.updateBossAI` |
| 加新角色 | `config.ts CHARACTER_CONFIGS` → 模型在 `public/models/player_*.gltf` → i18n |

### 4. 调试技巧

```js
// 浏览器控制台：查看当前游戏状态
window.__session.gameInstance.getState()

// 修改典籍等级（dev 测试）
window.__session.gameInstance.getState().player.tomes
```

### 5. 构建与部署

```bash
pnpm run build
# 输出到 dist/
```

生产环境 `index.html` 需要添加 importmap（Three.js 是 external）：

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</script>
```

### 6. 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 模型显示纯白 | 材质被覆盖 | 保留 GLTF 原材质 |
| 模型小到看不见 | 模型原始尺寸不一 | 用 `Box3().setFromObject` 计算后缩放 |
| 克隆模型动画错乱 | 用了 `.clone()` | 改 `SkeletonUtils.clone()` |
| WASD 方向反 | 相机朝向问题 | 翻转 `moveX` / `moveY` |
| 粒子看不到 | 屏空间尺寸过小 | 调大 vertex shader 中 `aSize` 乘数 |
| TS 报「找不到模块 './foo'」 | 漏写 `.ts` 扩展名 | 改 `import './foo.ts'` |
| 升级面板里出现 undefined 武器 | i18n 缺 key | 检查 `i18n/zh.json` 与 `i18n/en.json` |

### 7. 不要这样做

- ❌ 在 `game/core/` 里 `import * as THREE`
- ❌ 修改 `packages/`
- ❌ 用 `.clone()` 克隆带骨骼的 GLTF
- ❌ 把可调数值硬编码在 `client/index.ts`（应放 `config.ts`）
- ❌ 给 Three.js 对象不设 `.name`
- ❌ 在热路径里 `new Vector3()`（用模块级 `_tempVec`）

---

## 八、模板特性（来自 KUBEE.md）

本仓库基于 **Three.js 3D 模板**，原是 AI-facing 的"易扩展、最小可玩"骨架：

- 优化目标：快速迭代、AI 可读、易扩展
- 不预先解决所有生产问题（声音、网络、回放等留给具体游戏接入）

主要修改入口（按优先级）：
1. `game/core/source/config.ts` — 数值
2. `game/core/source/GameInstance.ts` — 游戏循环
3. `game/core/source/types.ts` — 类型
4. `game/client/source/index.ts` — 渲染 / UI
5. `i18n/en.json` + `i18n/zh.json` — 文案

通常**不需要**改 `packages/`，除非要扩展跨平台输入或显示适配。
