# MegaBonk Three.js — 技术 / 性能 / 开发指南

> 本文档对照当前代码（`game/core/`、`game/client/`、`packages/`）。

---

## 一、整体架构

### 1. 双层分离：GameInstance + GameScene

| 层 | 文件 | 职责 | 依赖 Three.js |
|---|---|---|---|
| 逻辑 | `@minigame/core` (`game/core/source/`) | 60Hz tick 循环、状态推进、碰撞、AI、Boss、武器开火、stat 管线 | ❌ 禁止 |
| 渲染 | `game/client/source/index.ts` | Three.js 场景 / 模型 / VFX / HUD / 菜单 / 输入桥接 | ✅ |

驱动方式：

```
GameInstance.start()
  └─ tickTimer = setInterval(() => tick(), TICK_INTERVAL_MS=16.67ms)   // 60Hz 固定步长

GameScene.animate()
  └─ requestAnimationFrame → 读 GameInstance.getState() 快照 → 渲染   // 自适应帧率
```

两层解耦，渲染降帧不影响逻辑。

> **方案 A 重构 Phase 1-7 落地后**：`GameInstance.ts` 已退化为 ~350 行薄 facade，
> 所有逻辑迁到 `systems/`、数据迁到 `data/`、行为迁到 `behaviors/` / `ai/`。
> 详见 §二「模块职责」。

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
| `game/core/source/GameInstance.ts` | ~350 (facade) |
| `game/core/source/systems/*.ts` | ~1300 (11 systems) |
| `game/core/source/{data,behaviors,ai,factories,stats}/*.ts` | ~1700 |
| `game/core/source/__tests__/*` | ~2200（232 单测） |
| `game/core/` 其他（types/config/upgrades/quests/shop/save/physics/spatial-hash/world） | ~1500 |
| `game/client/source/index.ts` | ~4500 |
| **核心 + 客户端合计** | **≈ 11600** |

---

## 二、模块职责

### 1. `@minigame/core` 内部目录树

```
game/core/source/
├── index.ts                  公开 API（contract 锁定: GameInstance / GameState / GameConfig / GameResult / InputState
│                             / TICK_INTERVAL_MS / DEFAULT_GAME_CONFIG）
├── GameInstance.ts           薄 facade ~350 行
│                             - constructor / start / tick / applyAction / selectUpgrade / pause / resume
│                             - getState / getResult
│                             - tick() 内只做 dispatch (16 个 system 调用顺序见 §三)
├── world.ts                  miniplex World instance
├── types.ts / config.ts      共享类型 + 各种配置常量
│
├── data/                     数据驱动配置（Phase 2-5）
│   ├── weapons.ts            WeaponDef + WEAPONS table
│   ├── enemies.ts            EnemyDef + ENEMIES (单一 source of truth, ENEMY_CONFIGS 别名兼容旧 API)
│   └── tomes.ts              TomeDef + TOMES (走 stat pipeline, contextOnly 标志)
│
├── stats/                    4 层 stat 管线（Phase 1）
│   ├── Stat.ts               Stat shape + finalize() = (base+added) × (1+Σincreased) × Π(more)
│   ├── Modifier.ts           Modifier { kind, stat, value, tags? }
│   ├── StatBlock.ts          class StatBlock { setBase / applyModifier / getStat / getFinal }
│   ├── computeWeaponDamage.ts   武器伤害封装（base * damageMult * tagMods * crit）
│   └── recomputePlayerStats.ts  charCfg + shop + tomes → 写回 player 7 个 stat 字段
│
├── behaviors/                武器行为（Phase 2-3, 7 把武器）
│   ├── sweepArc.ts           sword 即时弧形扫击
│   ├── forwardArrow.ts       bow 前向 / 第一发自瞄
│   ├── orbitingAxe.ts        axe 绕玩家 orbit
│   ├── spreadShot.ts         shotgun 等角扇形
│   ├── bouncingShot.ts       bone_bouncer 弹跳 + 自瞄
│   ├── lightningChain.ts     lightning_staff 链击
│   ├── flameAura.ts          flame_ring 半径 AOE
│   ├── queries.ts            findNearestEnemy + Excluding
│   ├── types.ts              BehaviorContext / BehaviorEffects
│   └── index.ts              BEHAVIORS map (id → fn)
│
├── ai/                       敌人 + boss AI（Phase 4）
│   ├── behaviors/            chase / ranged / charge / dive (4 brains) + _move 共享移动
│   ├── modifiers/            necromancer (召唤 overlay)
│   ├── bosses/skeletonKing.ts   SKELETON_KING_PHASES (3 phases) + 7 attacks + getBossMeleeDamage
│   └── types.ts              AiContext + AiEffects extends BehaviorEffects
│
├── factories/
│   └── spawnEnemy.ts         4 mode (wave/miniBoss/necromancerSummon/bossSummon) 处理 tier / elite buff / time scaling
│
└── systems/                  每帧 dispatch 的纯函数（Phase 6, 232 单测覆盖）
    ├── types.ts              Engine interface (state + counters + spatialHash + world + effects + geo)
    ├── helpers.ts            findNearestEnemy* / addDamageEvent / applyKnockback / checkPlayerDeath / checkGameOver
    ├── collision.ts          LevelGeometry 接口 + 4 个 *At 查询（地形/支撑/横向/climb）— Phase 3 后无全局状态
    ├── horizontalMove.ts     tryMoveHorizontally helper (玩家/敌人/Boss 共用墙体滑行 4-path fallback)
    ├── terrain.ts            @deprecated re-export shim, 仅供老 terrain.test.ts 兜底
    ├── player.ts             createInitialPlayer / tickPlayerMovement / tickDash / tickTimers / tickLevelUp
    ├── projectiles.ts        tickProjectiles (移动 / 寿命 / 出界 / 地形 y clamp)
    ├── collisions.ts         processCollisions (4 类碰撞 + bone_bouncer 弹跳 + pierce + shield_tome)
    ├── pickups.ts            processDeaths / tickPickups / tickThorns
    ├── spawning.ts           tickSpawning (波次 + curse_tome 加快 + final swarm + mini-boss) / checkBossSpawn
    ├── altars.ts             tickAltars / generateAltars / onBossDefeated / consumePortalUsed (5 阶段状态机)
    ├── chests.ts             tickChests / generateChests
    ├── teleporters.ts        @deprecated re-export shim → altars.ts + chests.ts
    ├── overtime.ts           tickOvertime (gameTime ≥ 540 累加 overtimeSeconds)
    ├── tierTransition.ts     tickTierTransition (portal_used → tier++ + 重置场景)
    ├── shrines.ts            tickShrines / generateShrines / applyShrineReward (充能神殿 4 选 1)
    ├── weapons.ts            tickWeapons / getWeaponStats / checkWeaponEvolutions
    ├── aiSystem.ts           tickEnemyAi (modifier → brain dispatch per enemy)
    ├── bossAi.ts             tickBossAi (phase resolve + attack 调度 + 移动 + 墙阻挡 + y 跟地)
    └── weaponFiring.ts       tryFireWeaponEcs (BEHAVIORS map dispatch)
```

### 2. `game/client/source/index.ts` (~4500)

```
LocalGameSession            (会话桥接：驱动 GameInstance + 调用渲染)
GameScene                   (Three.js 场景管理)
├── 模型加载                (GLTFLoader + OBJLoader + cloneSkeleton)
├── 角色/敌人/Boss 渲染      (cloneSkeleton + AnimationMixer 每实例)
├── 投射物渲染              (InstancedMesh，球体)
├── 拾取物渲染              (InstancedMesh，八面体)
├── 武器实例渲染            (axe/sword/bow 等 OBJ 模型)
├── VFX 粒子系统            (THREE.Points + 自定义 ShaderMaterial，500 池)
├── Billboard VFX 系统      (Plane mesh 池 64 个，朝相机/朝地面，单帧贴图特效)
├── HUD                     (DOM overlay：HP/XP/计时/Combo)
├── 菜单/升级面板/商店/任务   (DOM)
├── 相机系统                (固定角度 + 动态 FOV + 屏震 + 顿帧)
└── 启动流程                (loadModels → showMainMenu → startGame)
```

### 3. tick() 顺序（每帧 60 Hz）

`GameInstance.tick()` 现在只做 dispatch：

```ts
tickPlayerMovement(engine, dt);    // 移动 / 跳 / slide / bunny hop / climb / wall slide
tickDash(engine, dt);              // dash 短无敌 + 高速移动
tickTimers(engine, dt);            // 各种 cooldown / hitFlash 倒计时
tickEnemyAi(state.enemies, ctx);   // modifier → brain dispatch per enemy
tickWeapons(engine, dt);           // attackSpeed × dt 推 cooldown, 触发即 fire
tickProjectiles(engine, dt);       // 投射物移动 + 寿命 + 出界 + 软虚空地形 clamp
processCollisions(engine);         // 4 类: 子弹 vs 敌人/boss + 敌人近战 + 子弹 vs 玩家
processDeaths(engine);             // hp ≤ 0 → spawn pickup + kill++
tickPickups(engine, dt);           // 寿命 / 吸附 / collect
tickLevelUp(engine);               // xp ≥ xpToNext → 进 level_up phase
tickSpawning(engine, dt);          // wave + mini-boss + final swarm
tickAltars(engine, dt);            // 5 阶段祭坛状态机 (按 [E] 召唤 / 进入 portal)
tickShrines(engine, dt);           // 充能神殿 charging → ready → consumed
tickChests(engine);
checkBossSpawn(engine);            // 仅当祭坛 boss_active 时 spawn
if (state.boss && phase === 'boss_fight') tickBossAi(state.boss, ctx);
tickThorns(engine);
checkGameOver(engine);             // Boss 死 → portal_open；玩家死 → defeat
tickTierTransition(engine);        // portal_used → tier++ + 重置场景
tickOvertime(engine, dt);          // gameTime ≥ 540 累加 overtimeSeconds
engine.aiGroup = (engine.aiGroup + 1) % 4;
```

各 system 接受 `engine: Engine`（封装 state + counters + spatialHash + world + effects + **geo: LevelGeometry**）和 `dt: number`，
mutate engine 内字段。这是 ECS-style 组合：数据 + 系统纯函数。

### 4. 物理 / 碰撞系统（Phase 1-3 重构）

PR #7 引入了数据驱动关卡（`LevelData` + Blender glb LevelLoader），但只让玩家接入了横向阻挡。后续做了三阶段修整：

| 阶段 | commit | 关键变更 |
|---|---|---|
| 🟢 阶段 1 止血 | `3198d6c` | `getTerrainHeight` 软虚空保底 y=0；boss 每帧跟地；关卡 `?level` opt-in |
| 🟡 阶段 2 抽 helper | `a46902a` | 新增 `tryMoveHorizontally` 4-path fallback；敌人 / Boss 接入墙阻挡 |
| 🔵 阶段 3 去全局状态 | `e11cc20` | `LevelGeometry` 接口 + 纯函数；`Engine.geo` 实例化；`makeLevelGeometry(level?)` |

**当前架构（Phase 3 后）：**

```ts
// GameInstance 持有
engine.geo = makeLevelGeometry(config.level);  // 不传 level → NEON_CRUCIBLE_GEOMETRY

// 4 个 *At 查询（系统接受 engine.geo / ctx.geo）
getTerrainHeightAt(geo, x, z)         // 最高地表（软虚空 → 0）
getSupportHeightAt(geo, x, z, feetY)  // 仅返回 feetY+STEP_HEIGHT 内可达的面
isBlockedHorizontallyAt(geo, x, z, feetY, includeClimb?, radius?)
findClimbAt(geo, x, z, feetY)

// helper（玩家 / 敌人 / Boss 共用）
tryMoveHorizontally(geo, oldX, oldZ, desiredX, desiredZ, feetY, opts)
// 4-path fallback: 直走 → 沿 X 滑 → 沿 Z 滑 → 原地
```

**各 mover 的虚空 / 阻挡策略：**

| Mover | y 更新 | 横向 | 掉出 |
|---|---|---|---|
| Player | 重力 + 严格支撑面 | helper(0.45) + climb | FALL_RESPAWN_Y = -20 → 复活 |
| Enemy | 软虚空贴地 | helper(0.4) | 不会发生 |
| Boss | 软虚空贴地 | helper(1.0) | 同上 |
| Projectile | vy 重力 + clamp ≥ terrainY+0.1 | wall_ 命中销毁 | 同上 |
| Gargoyle | 地形高度 + 1.8 | 飞越所有阻挡 | 不适用 |

**关卡加载：**

游戏启动时无条件加载 `public/models/levels/level_whitebox.glb` + `level_whitebox_col.glb`。
文件缺失 boot 直接抛错（没有内置 arena 兜底）。

关卡命名约定见 `level-editor/WHITEBOX_SPEC.md`（前缀：`col_` / `wall_` / `climb_` / `ramp_` / `spawn_*`）。

**测试覆盖：**

- `systems/__tests__/collision.test.ts` —— 4 API × 内置基线 / 加载关卡 / 边界 / 实例隔离
- `systems/__tests__/horizontalMove.test.ts` —— helper 4 path fallback
- `ai/__tests__/_move.test.ts` —— 敌人接入 wall_ 集成


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
| 玩家投射物 | OBJ/GLTF 模型克隆，每投射物一个 Object3D | 需要朝向控制（斧/剑/弓/枪弹等） |
| 普通敌人弹幕 | `InstancedMesh` (PlaneGeometry + `enemy_bullet.png`) | 朝相机火焰 billboard，火焰尾沿速度反向拖尾，加色发光 |
| Boss（机器人）弹幕 | `items/bullet.glb` 克隆，每弹一个 Object3D | 朝飞行方向（含俯冲炮弹垂直分量） |
| 通用投射物兜底 | `InstancedMesh` (SphereGeometry 0.25) | **防御性 fallback**，正常对局 count=0、永不可见，保留不删 |
| 拾取物 (≤300) | `InstancedMesh` (OctahedronGeometry) | 数量多、形状简单 |
| 龙卷风 | （已删除） | — |
| Boss | `SkeletonUtils.clone(boss)` | 单实例，需要动画 |
| 平台 / 装饰 | clone GLTF scene | 静态 |
| 粒子 VFX | `THREE.Points + ShaderMaterial` | 500 粒子池，GPU 算大小，主贴图 `vfx/spark.png` |
| Billboard VFX | `Mesh + PlaneGeometry + MeshBasicMaterial` 池 64 个 | 单帧贴图特效（剑气/魔法圆/烟雾/烧痕等），朝相机或平躺地面 |

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
| ✅ AI错峰计算 | `enemy.aiPhase = id % 4` 确定性分配（零 RNG，回放稳定）；**目标重算**按 `aiPhase === aiGroup` 4 帧错峰（约省 75% 目标重算）。注：charge/dive 的**状态机切换**（起跳 / 蓄力判定）每帧都跑、不参与错峰，避免起手延迟 |

### 3. 对象池

| 对象 | 池大小 | 来源常量 |
|---|---|---|
| 投射物 InstancedMesh | 200 | `MAX_PROJECTILES` |
| 区域特效（毒气/涟漪/灼地/激光） | 150 | `MAX_AREA_EFFECTS` |
| 拾取物 InstancedMesh | 300 | `MAX_PICKUPS` |
| 敌人 InstancedMesh（legacy） | 100 | `MAX_ENEMIES` |
| VFX 粒子 | 500 | `MAX_PARTICLES` |
| Billboard VFX | 64 | `MAX_BILLBOARDS` |

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
- `selectUpgrade(tome)` → `recomputePlayerStats()`（`stats/recomputePlayerStats.ts`）期间从 `getShopBonuses()` 读
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
│   │   ├── GameInstance.ts # 薄 facade ~350 行
│   │   ├── world.ts        # miniplex World
│   │   ├── data/           # WeaponDef / EnemyDef / TomeDef
│   │   ├── stats/          # 4 层 stat 管线
│   │   ├── behaviors/      # 武器行为 (7 个)
│   │   ├── ai/             # brains + modifiers + bosses
│   │   ├── factories/      # spawnEnemy 工厂
│   │   └── systems/        # 11 个 dispatch 系统
│   └── client/source/      # 渲染 + UI
├── packages/               # 模板基础设施（不修改）
│   ├── platform/             虚拟摇杆 / 触控按钮 / 桌面输入
│   ├── render-adapter/       高 DPI 适配
│   └── i18n/                 翻译运行时 + Vite 插件
├── public/
│   ├── models/             GLTF / GLB / OBJ 模型
│   └── textures/
│       ├── particle_*.png      旧粒子（保留兼容）
│       └── vfx/                Kenney Particle Pack 精选 11 张（CC0）
├── i18n/
│   ├── zh.json
│   └── en.json
├── docs/                   本文档目录
├── index.html
├── vite.config.ts
└── tsconfig.json
```

### 3. 改数值 / 加新内容的常见入口

> 方案 A 重构后，**加新东西基本不需要碰 `GameInstance.ts`**。下表已对齐 Phase 1-7 实际目录。

| 想做什么 | 改哪里 |
|---|---|
| 改武器某级数值 | `config.ts WEAPON_STATS[type][level-1]` |
| 加新武器 | ① `data/weapons.ts` 加 `WeaponDef` ② 如需新行为, 在 `behaviors/` 加 `.ts` + 注册到 `behaviors/index.ts` ③ `client/index.ts` 加颜色 / 图标 / 模型 ④ i18n。**不再需要** 改 `GameInstance.ts` / 加 `fireXxx` / 改 switch |
| 加新敌人 | ① `data/enemies.ts` 加 `EnemyDef` (behavior: chase/ranged/charge/dive) ② 如需叠加召唤等行为，在 `ai/modifiers/` 加 + 注册 ③ i18n |
| 加新典籍 | ① `types.ts TomeType` ② `config.ts TOME_MAX_LEVELS` ③ `data/tomes.ts` 加 `TomeDef`（影响 stat 的返回 modifier 列表；contextual 标 `contextOnly: true`） ④ contextual tome 在对应代码路径读 `player.tomes.find(...)?.level` ⑤ i18n |
| 调难度 | `config.ts TIER_CONFIGS` |
| 调波次 / Final Swarm | `config.ts WAVE_CONFIGS` + `systems/spawning.ts` (final swarm 在 480-540s) |
| 调 Boss | `config.ts BOSS_SPAWN_TIME / BOSS_HP`、`ai/bosses/skeletonKing.ts`（phase 表 + 7 attacks）、`systems/bossAi.ts`（dispatch） |
| 加新角色 | `config.ts CHARACTER_CONFIGS` → 模型在 `public/models/player_*.gltf` → i18n |
| 调玩家 stat 公式 | `stats/recomputePlayerStats.ts` + `data/tomes.ts` |
| 加新武器进化 | `config.ts WEAPON_EVOLUTIONS`（基础武器 + 必需 tome + 进化数值） |

### 4. 调试技巧

```js
// 浏览器控制台：查看当前游戏状态
window.__session.gameInstance.getState()

// 修改典籍等级（dev 测试）
window.__session.gameInstance.getState().player.tomes

// GM 命令清单（按 ` 反引号开 / 关 panel）
window.__gm.help()             // 打印所有命令
window.__gm.giveAllWeapons()   // 满武器
window.__gm.godMode()          // 无敌
window.__gm.spawnBoss()        // 强制召唤 Boss
window.__gm.testLightning()    // 在玩家头顶劈一道电（VFX 测试）
window.__gm.showCollision()    // 切换碰撞盒可视化（仅 ?level 模式有效）
                                // 加色透明 fill + 高亮边缘 + 永远置顶
                                // 绿 col_（站顶面）/ 红 wall_（横向挡）
                                // 蓝 climb_（攀爬带）/ 黄 ramp_（走上斜面）
                                // 品红 spawn_*（发光球 + 5 单位高定位针）
                                // 也可在 GM 面板按钮触发
```

**ramp_ 与 col_ 的区别**：col_ 顶面是平的（一个固定 height），ramp_ 顶面沿 axis 轴线性插值（lowY → highY）。可视化里画的是包围盒，盒内对角斜面才是真实可走面。

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
