# MegaBonk 关卡设计 Metric 速查手册

> 本手册基于项目代码静态扫描自动生成，所有数值标注来源文件与变量名。  
> 扫描范围：`game/core/source/config.ts`、`game/core/source/GameInstance.ts`、`game/core/source/types.ts`、`game/core/source/physics.ts`、`game/client/source/index.ts`、`level-editor/WORKFLOW.md`、`level-editor/WHITEBOX_SPEC.md`。  
> 单位约定：长度/距离 = 世界单位（unit），时间 = 秒（s），速度 = 单位/秒，重力 = 单位/秒²。

---

## 1. 玩家物理参数

### 1.1 基础移动与生存

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 玩家半径（碰撞软半径） | 0.5 | 单位 | `GameInstance.ts` L1687 | 写入 `spatialHash.insert(... 0.5)`；玩家受敌人攻击的近战判定为 `dist < 1.2` |
| 玩家近战受击判定距离 | 1.2 | 单位 | `GameInstance.ts` L1788 | 敌人触碰玩家造成伤害的范围 |
| 玩家拾取半径（基础） | 2.0 | 单位 | `config.ts` L13 | `PLAYER_PICKUP_RADIUS` |
| 玩家无敌时间 | 0.5 | 秒 | `config.ts` L14 | `PLAYER_INVINCIBLE_DURATION` |
| 玩家基础 HP | 100 | HP | `config.ts` L9 | `PLAYER_BASE_HP`（角色覆盖见 1.6） |
| 玩家基础移速 | 4.0 | 单位/秒 | `config.ts` L10 | `PLAYER_BASE_SPEED` |
| 玩家基础暴击率 | 0.05 (5%) | — | `config.ts` L11 | `PLAYER_BASE_CRIT_CHANCE` |
| 玩家基础暴击伤害 | 1.5× | — | `config.ts` L12 | `PLAYER_BASE_CRIT_DAMAGE` |
| 视觉模型高度参考 | 1.5 | 单位 | `GameInstance.ts` L2607 | `lookAt(..., p.y + 1.5, ...)`；伤害文字高度 `y=1.5` |
| 加速率（按目标速度趋近） | 12.0 / 秒 | — | `GameInstance.ts` L491 | `accelRate = 12.0`（lerp 系数） |
| 减速率（停止输入时） | 16.0 / 秒 | — | `GameInstance.ts` L495 | `decelRate = 16.0` |

### 1.2 跳跃与重力（MegaBonk 核心物理）

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 跳跃初速度 | 6.0 | 单位/秒 | `config.ts` L21 | `JUMP_FORCE` |
| 重力加速度 | 18.0 | 单位/秒² | `config.ts` L22 | `GRAVITY` |
| **理论普通跳跃峰值高度** | **≈ 1.00** | 单位 | 推导 `v²/(2g)=36/36` | 仅靠跳无法直接登上 y=2 平台，需走坡道 |
| 跳跃达到峰值用时 | ≈ 0.333 | 秒 | 推导 `v/g=6/18` | — |
| 跳跃落地总时间 | ≈ 0.667 | 秒 | 推导 `2v/g` | — |


### 1.3 兔子跳（Bunny Hop）

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 兔子跳触发窗口（落地后） | 0.15 | 秒 | `config.ts` L26 | `BUNNY_HOP_WINDOW` |
| 兔子跳跳跃力倍率 | 1.2× | — | `config.ts` L27 | `BUNNY_HOP_BONUS`（应用为 `JUMP_FORCE * 1.2 = 7.2`） |
| **理论兔子跳峰值高度** | **≈ 1.44** | 单位 | 推导 `(7.2)²/(2*18)` | 仍 **无法** 直接跳上 y=2 平台，必须借助坡道 |


### 1.4 滑铲（Slide）

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 滑铲持续时间 | 0.5 | 秒 | `config.ts` L23 | `SLIDE_DURATION` |
| 滑铲速度倍率 | 1.6× | — | `config.ts` L24 | `SLIDE_SPEED_MULTIPLIER`（实际滑铲速度 = 玩家速度 × 1.6） |
| 滑铲冷却（声明） | 0.3 | 秒 | `config.ts` L25 | `SLIDE_COOLDOWN`（声明但 GameInstance 中未实际使用冷却字段） |
| 滑铲是否提供垂直增益 | 否 | — | `GameInstance.ts` L470 | 滑铲仅修改地面水平速度，不能登高 |

### 1.5 冲刺（Dash）

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 冲刺距离 | 6 | 单位 | `config.ts` L16 | `DASH_DISTANCE` |
| 冲刺持续时间 | 0.2 | 秒 | `config.ts` L17 | `DASH_DURATION` |
| 冲刺速度（推导） | 30 | 单位/秒 | `GameInstance.ts` L615 | `dashSpeed = DASH_DISTANCE / DASH_DURATION = 6/0.2 = 30` |
| 冲刺冷却 | 5 | 秒 | `config.ts` L18 | `DASH_COOLDOWN` |
| 冲刺无敌帧 | 0.2（=持续时间） | 秒 | `GameInstance.ts` L610 | `invincibleTimer = DASH_DURATION` |

### 1.6 三个可玩角色

| 角色 | HP | 速度 | 伤害倍率 | 护甲 | 暴击率 | 初始武器槽 | 初始武器 | 来源 |
|------|----|----|--------|-----|------|---------|---------|------|
| megachad | 100 | 4.0 | 1.2× | 0 | 0.08 | 2 | sword | `config.ts` L57-66 |
| roberto | 150 | 3.2 | 1.0× | 3 | 0.05 | 2 | axe | `config.ts` L67-76 |
| skateboard_skeleton | 70 | 5.0 | 0.9× | 0 | 0.10 | 2 | bone_bouncer | `config.ts` L77-86 |

### 1.7 武器槽位扩展（按等级解锁）

| 等级 | 武器槽上限 | 来源 |
|------|---------|------|
| 1（初始） | 2 | `config.ts` L30 `MAX_WEAPONS_DEFAULT = 2` |
| 5 | 3 | `GameInstance.ts` L2073 |
| 10 | 4 | `GameInstance.ts` L2074 |
| 20 | 5 | `GameInstance.ts` L2075 |
| 30 | 6（绝对上限） | `GameInstance.ts` L2076 + `config.ts` L31 `MAX_WEAPONS_CAP = 6` |

---

## 2. 地图 / 关卡尺寸

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 地图主尺寸 `MAP_SIZE` | 120 | 单位 | `config.ts` L3 | `MAP_SIZE = 120`（关卡 GLB 内的 `col_` 应控制在 ±55 内） |
| 地图半边长 | 60 | 单位 | 推导 `MAP_SIZE/2` | — |
| 玩家移动边界（X / Z） | ±60 | 单位 | `physics.ts` L28-30 | `applyMovement3D` 中 `halfMap = mapSize * 0.5` |
| 敌人移动边界（X / Z） | ±65 | 单位 | `GameInstance.ts` L1014 | `halfMap = (mapSize + 10) * 0.5 = 65`（敌人可比玩家多走 5 单位） |
| 投射物存活边界 | ±70 | 单位 | `GameInstance.ts` L1653 | `halfMap = (mapSize + 20) * 0.5 = 70`，超出立刻销毁 |
| 敌人生成位置（4 边） | x 或 z = ±65 | 单位 | `GameInstance.ts` L2322-2333 | `getSpawnPosition()`：`halfMap = mapSize*0.5 = 60`，再加 `offset = 5` |
| 沿生成边的随机分布范围 | ±60 | 单位 | `GameInstance.ts` L2326 | `along = (Math.random()-0.5) * mapSize` |
| Boss 生成位置 | (0, 0, −36) | 单位 | `GameInstance.ts` L2359 | `z: -this.config.mapSize * 0.3 = -36`（北走廊中段） |
| 传送器生成距离（与玩家） | 25 ~ 40 | 单位 | `GameInstance.ts` L1873 | `distance = 25 + Math.random()*15` |
| 传送器最远位置（夹紧） | ±48 | 单位 | `GameInstance.ts` L1876 | `halfMap = mapSize * 0.4 = 48` |

---

## 3. 平台 / 碰撞系统

### 3.1 平台模型列表（资源 / 未缩放尺寸）

| 模型 key | 文件 | 大约尺寸（未缩放） | 来源 |
|---------|------|-----------------|------|
| `platform_4x4` | `platform_4x4_full.gltf` | 4×4 | `WORKFLOW.md` L213, `index.ts` `loadModels()` |
| `platform_4x4` 别名 | `platform_4x4.gltf` | 4×4 | `index.ts` `loadModels()` |
| `platform_4x2` | `platform_4x2.gltf` | 4×2 | 同上 |
| `platform_2x2` | `platform_2x2.gltf` | 2×2 | 同上 |
| `platform_2x1` | `platform_2x1.gltf` | 2×1 | 同上 |
| `platform_1x1` | `platform_1x1.gltf` | 1×1 | 同上 |
| `platform_4x1` | `platform_4x1.gltf` | 4×1 | 同上 |

### 3.2 `getTerrainHeight()` 碰撞矩形格式

| 字段 | 含义 | 单位 | 来源 |
|-----|------|------|------|
| `centerX` | 矩形中心 X | 单位 | `core/systems/collision.ts` (CollisionRect) |
| `centerZ` | 矩形中心 Z | 单位 | 同上 |
| `halfWidth` | X 方向半宽（**实际宽度 = 2 × halfWidth**） | 单位 | 同上 |
| `halfDepth` | Z 方向半深（**实际深度 = 2 × halfDepth**） | 单位 | 同上 |
| `height` | 平台表面 Y 高度 | 单位 | 同上 |

### 3.3 坡道规则（自动生成）

| 规则 | 值 | 来源 |
|-----|----|------|
| 边缘自动坡道宽度 | 3 单位 | `GameInstance.ts` L589, L591 |
| 坡度计算 | `rampHeight = h * (1 - edgeDist / 3)` | `GameInstance.ts` L592 |
| y=2 平台坡度 | ≈ 0.67 单位/单位 | 推导 |
| y=4 平台坡度 | ≈ 1.33 单位/单位 | 推导 |
| y=6 平台坡度 | ≈ 2.0 单位/单位（陡） | 推导 |
| 多平台重叠取值 | 取最大高度 `Math.max(height, h)` | `GameInstance.ts` L588 |

### 3.4 可通行性（综合 1.2/1.3 节物理）

| 目标高度 | 直接跳 | 兔子跳 | 走坡道 | 备注 |
|--------|--------|---------|---------|------|
| y=2 | ❌ (上限 1.0) | ❌ (上限 1.44) | ✅ | 必须借助 3 单位坡道 |
| y=4 | ❌ | ❌ | ✅ | 坡较陡但可走上 |
| y=6 | ❌ | ❌ | ✅ | 坡很陡（2:1） |

### 3.5 Blender `col_` Scale 字段含义

| Blender 字段 | 游戏字段 | 含义 |
|------------|---------|------|
| `Scale X` | `halfWidth` | 碰撞半宽 | 
| `Scale Y` | `halfDepth` | 碰撞半深 |
| `Scale Z` | — | 厚度，**忽略** |
| `Position X` | `centerX` | 不变 |
| `Position Y` | `-centerZ` | **取负** |
| `Position Z` | `height` | 高度（Y） |

来源：`WORKFLOW.md` L116-138。

---

## 4. Blender 坐标系 / 命名规范

### 4.1 坐标系转换（Blender Z-up → Three.js Y-up）

| Blender | 游戏 | 说明 | 来源 |
|--------|------|------|------|
| `X` | `X` | 不变 | `WORKFLOW.md` L133 |
| `Y` | `-Z` | 深度轴翻转（取负） | `WORKFLOW.md` L134 |
| `Z` | `Y (height)` | 高度 | `WORKFLOW.md` L135 |
| 导出选项 | **必须勾选 `+Y Up`** | Blender Z-up ↔ Three.js Y-up | `WORKFLOW.md` L190, L385-386 |

### 4.2 合法物体命名前缀

#### 平台 / 结构模型前缀（生成 `InstancedMesh`）

| 前缀 | 含义 | 来源 |
|-----|------|------|
| `platform_4x4` / `platform_4x2` / `platform_2x2` / `platform_2x1` / `platform_1x1` / `platform_4x1` | 平台 | `WORKFLOW.md` L213-218 |
| `support` / `support_short` / `support_long` | 支撑柱 | `WORKFLOW.md` L219-221 |
| `fence_platform` / `fence` | 围栏 | `WORKFLOW.md` L222-223 |
| `rail_long` / `rail_short` / `rail_corner` | 护栏 | `WORKFLOW.md` L224-226 |
| `light_street` / `light_square` | 路灯 | `WORKFLOW.md` L227-228 |
| `sign_1` / `sign_2` / `sign_3` | 招牌 | `WORKFLOW.md` L229-231 |
| `ac_unit` / `ac_stacked` | 空调 | `WORKFLOW.md` L232-233 |
| `pipe_1` / `pipe_2` | 管道 | `WORKFLOW.md` L234-235 |
| `door` / `antenna_1` / `tv_1` / `computer` | 装饰 | `WORKFLOW.md` L236-239 |
| `tree` / `tombstone` / `pumpkin` | 自然类 | `WORKFLOW.md` L240-242 |
| `turret_cannon` / `turret_teleporter` / `lootbox` | 道具 | `WORKFLOW.md` L243-245 |

#### 碰撞物体前缀

| 前缀 | 含义 | 来源 |
|-----|------|------|
| `col_` | 碰撞体积（Empty Cube） → 生成 `getTerrainHeight()` 数据 | `WORKFLOW.md` L249-251 |

#### 生成点前缀（Empty Arrows）

| 前缀 | 含义 | 必须数量 | 来源 |
|-----|------|--------|------|
| `spawn_player` | 玩家出生点 | 必须 1 个 | `WORKFLOW.md` L164 |
| `spawn_boss` | Boss 出生位置 | 必须 1 个 | `WORKFLOW.md` L165 |
| `spawn_teleporter` / `spawn_teleporter_1/2` | 传送器位置 | 0-3 个 | `WORKFLOW.md` L166-168 |
| `spawn_enemy_N` / `_S` / `_E` / `_W` | 四方向敌人刷新区 | 可选 | `WORKFLOW.md` L169-172 |

注：Blender 自动加的 `.001`、`.002` 后缀会被代码忽略。来源：`WORKFLOW.md` L98, L207。

---

## 5. 视野 / 摄像机

| 参数 | 值 | 单位 | 来源文件 | 变量名 / 说明 |
|------|----|----|---------|-------------|
| 摄像机类型 | `PerspectiveCamera` | — | `index.ts` L422, L590 | 主摄像机 |
| 初始 FOV | 60 | 度 | `index.ts` L542, L590 | `currentFOV = targetFOV = 60` |
| FOV — 普通战斗 | 60 | 度 | `index.ts` L2616 | `else { this.targetFOV = 60 }` |
| FOV — 敌人 > 50 | 65 | 度 | `index.ts` L2614 | `else if (enemyCount > 50)` |
| FOV — Boss 战 | 68 | 度 | `index.ts` L2612 | `if (state.boss)` |
| FOV 受击瞬间峰值 | 50 | 度 | `index.ts` L1570 | 短暂收缩营造冲击感 |
| FOV 渐变速度 | 1% 每帧 | — | `index.ts` L2621 | `currentFOV += fovDiff * 0.01` |
| Near 裁切面 | 0.1 | 单位 | `index.ts` L590 | — |
| Far 裁切面 | 300 | 单位 | `index.ts` L590 | — |
| 摄像机相对玩家偏移：后方距离 | 7 | 单位 | `index.ts` L2579 | `camBehind = 7`（向 -Z 方向） |
| 摄像机相对玩家偏移：上方距离 | 5 | 单位 | `index.ts` L2580 | `camHeight = 5` |
| 摄像机初始位置 | (0, 4, −8) | 单位 | `index.ts` L592 | — |
| 摄像机跟随速度（基础） | 0.08 / 帧 | — | `index.ts` L2594 | `Math.min(0.08 + dist*0.12, 0.6)` |
| 摄像机跟随速度（最大） | 0.6 / 帧 | — | `index.ts` L2594 | 玩家与摄像机距离远时加速跟进 |
| LookAt Y 偏移 | +1.5 | 单位 | `index.ts` L2607 | 注视点抬高至玩家胸口 |
| LookAt Z 偏移 | +2 | 单位 | `index.ts` L2607 | 视线向前 2 单位 |
| 摄像机角度 | **固定（不旋转）** | — | `index.ts` L2573-2576 | 第三人称固定视角；WASD 为世界坐标移动 |
| 雾起始距离 | 40 | 单位 | `index.ts` L587 | `THREE.Fog('#87CEEB', 40, 120)` |
| 雾结束距离 | 120 | 单位 | `index.ts` L587 | — |
| 雾颜色 | `#87CEEB` (天蓝) | — | `index.ts` L587 | — |
| 阴影 camera near/far | 0.5 / 80 | 单位 | `index.ts` L691-692 | 平行光阴影 |
| 阴影 camera 范围 | ±60 (左右 / 上下) | 单位 | `index.ts` L693-696 | 与 `MAP_SIZE/2` 一致 |

---

## 6. 敌人 / Boss / 武器

### 6.1 敌人配置（6 种）

| 类型 | HP | 伤害 | 速度 | 行为 | XP 奖励 | 攻击冷却 | 精英? | 首次出现 | 权重 | 偏好距离 | 来源 |
|-----|----|----|-----|-----|--------|--------|------|--------|-----|--------|------|
| skeleton_soldier | 15 | 5 | 3.0 | chase | 1 | 1.5s | 否 | 0s | 40 | — | `config.ts` L104 |
| zombie | 30 | 10 | 1.5 | chase | 3 | 2.5s | 否 | 60s | 25 | — | `config.ts` L105 |
| skeleton_archer | 12 | 7 | 2.5 | ranged | 3 | 3.0s | 否 | 120s | 15 | 8 | `config.ts` L106 |
| skeleton_knight | 120 | 20 | 3.5 | charge | 5 | 2.0s | 是 | 180s | 5 | — | `config.ts` L107 |
| necromancer | 80 | 15 | 2.0 | ranged | 10 | 4.0s | 是 | 240s | 3 | 10 | `config.ts` L108 |
| gargoyle | 200 | 25 | 4.0 | dive | 10 | 3.0s | 是 | 360s | 2 | — | `config.ts` L109 |

### 6.2 敌人 AI 关键距离

| 参数 | 值 | 单位 | 来源 | 说明 |
|-----|----|-----|------|------|
| Skeleton Knight 冲锋触发距离 | 15 | 单位 | `GameInstance.ts` L716 | 距离 < 15 时进入 windup |
| Knight windup 时间 | 0.8 | 秒 | `GameInstance.ts` L718 | 红色预警时间 |
| Knight 冲锋时间 | 0.5 | 秒 | `GameInstance.ts` L735 | — |
| Knight 冲锋速度倍率 | 3.0× | — | `GameInstance.ts` L751 | — |
| Knight 冲锋后冷却 | 3.0 | 秒 | `GameInstance.ts` L761 | — |
| Gargoyle 飞行高度 | 3 | 单位 | `GameInstance.ts` L784 | y = 3 |
| Gargoyle 俯冲时间 | 0.4 | 秒 | `GameInstance.ts` L792 | — |
| Gargoyle 俯冲速度倍率 | 3.0× | — | `GameInstance.ts` L805 | — |
| Gargoyle 着陆 AOE 半径 | 3 | 单位 | `GameInstance.ts` L848 | `aoRadius = 3` |
| Gargoyle 下降速度 | 8 | 单位/秒 | `GameInstance.ts` L813 | — |
| Gargoyle 上升速度 | 6 | 单位/秒 | `GameInstance.ts` L835 | — |
| Necromancer 召唤数量 | 2-3 | — | `GameInstance.ts` L907 | `2 + floor(rand*2)` |
| Necromancer 召唤冷却 | 8.0 | 秒 | `GameInstance.ts` L687 | — |
| Necromancer 召唤半径 | 2-3.5 | 单位 | `GameInstance.ts` L914 | `2 + rand*1.5` |
| 敌人投射物速度（弓箭手） | 8 | 单位/秒 | `GameInstance.ts` L882 | — |
| 敌人投射物速度（巫师） | 6 | 单位/秒 | `GameInstance.ts` L883 | — |
| 敌人投射物寿命 | 4.0 | 秒 | `GameInstance.ts` L897 | — |
| 敌人投射物半径 | 0.4 | 单位 | `GameInstance.ts` L898 | — |
| 远程敌人开火距离窗口 | 0.5×~1.5× preferredRange | — | `GameInstance.ts` L702 | 不近不远才开火 |
| 充能/冲锋类移速倍率 | 2.0× | — | `GameInstance.ts` L995 | `behavior === 'charge'` |
| 飞扑类移速倍率 | 1.5× | — | `GameInstance.ts` L996 | `behavior === 'dive'` |

### 6.3 HP / 难度时间缩放

| 参数 | 值 | 来源 |
|-----|----|------|
| 基础时间缩放 `timeScale` | `1 + gameTime/600` | `GameInstance.ts` L2265 |
| 3 分钟后额外 HP 缩放 | 每分钟 +10% | `GameInstance.ts` L2270-2272 |
| 精英 50% 概率随机 buff | 速度×1.4 / HP×1.5 / 伤害×1.5 | `GameInstance.ts` L2281-2287 |
| Mini-boss HP 倍率 | 基础 × `timeScale` × **3** | `GameInstance.ts` L2203 |
| Mini-boss 伤害倍率 | 基础 × 2 | `GameInstance.ts` L2206 |
| Mini-boss 首次出现时间 | 180 秒后 | `GameInstance.ts` L2116 |
| Mini-boss 间隔 | 120 秒（2 分钟） | `GameInstance.ts` L2118 |

### 6.4 主 Boss

| 参数 | 值 | 单位 | 来源 |
|-----|----|----|------|
| Boss 基础 HP | 2000 | HP | `config.ts` L36 `BOSS_HP` |
| Boss 出现时间 | 540 (9 分钟) | 秒 | `config.ts` L35 `BOSS_SPAWN_TIME` |
| Boss 入场动画时长 | 2.0 | 秒 | `config.ts` L37 `BOSS_INTRO_DURATION` |
| Boss 出生坐标 | (0, 0, −36) | 单位 | `GameInstance.ts` L2359 `z = -mapSize*0.3` |
| Boss 阶段 1 速度 | 3.0 | 单位/秒 | `GameInstance.ts` L2391 |
| Boss 阶段 2 速度（HP ≤ 60%） | 4.0 | 单位/秒 | `GameInstance.ts` L2388 |
| Boss 阶段 3 速度（HP ≤ 30%, 狂暴） | 5.0 | 单位/秒 | `GameInstance.ts` L2385 |
| Boss 阶段 1 近战伤害 | 20 | HP | `GameInstance.ts` L2554 |
| Boss 阶段 2 近战伤害 | 30 | HP | `GameInstance.ts` L2555 |
| Boss 阶段 3 近战伤害 | 40 | HP | `GameInstance.ts` L2556 |
| Boss 近战范围 | 2.0 | 单位 | `GameInstance.ts` L1811 `dist < 2.0` |
| Boss `melee_sweep` 范围 | 3.5 | 单位 | `GameInstance.ts` L2432 |
| Boss `ground_slam` 范围 | 5.0 | 单位 | `GameInstance.ts` L2443 |
| Boss `aoe_explosion` 范围 | 7.0 | 单位 | `GameInstance.ts` L2513 |
| Boss `dark_bolt` 弹速 | 10 | 单位/秒 | `GameInstance.ts` L2460 |
| Boss `dark_rain` 投射物 y | 10 | 单位 | `GameInstance.ts` L2535 |
| Boss `dark_rain` 散布半径 | ±6 | 单位 | `GameInstance.ts` L2530-2531 |
| Boss `dark_rain` 数量 | 6 | — | `GameInstance.ts` L2528 |
| Boss `summon_wave` 召唤数 | 4 / 8（阶段3） | — | `GameInstance.ts` L2471 |
| Boss 召唤半径 | 5 | 单位 | `GameInstance.ts` L2475 |
| Boss `charge` 速度 | 12.0 | 单位/秒 | `GameInstance.ts` L2524 |
| Boss 攻击间隔 | 2.5-3.5 / 1.5-2.5（狂暴） | 秒 | `GameInstance.ts` L2401 |
| Boss spatial hash 半径 | 1.5 | 单位 | `GameInstance.ts` L1690 |

### 6.5 武器射程 / AOE / 攻速汇总（满级第 8 级数据）

> 完整 8 级数据见 `config.ts` `WEAPON_STATS`；这里只摘录最高级（关卡体感测试关键值）。

| 武器 | 满级伤害 | 满级冷却 | 满级射程 | 满级 AOE | 投射数 | 速度 | 来源 |
|-----|--------|--------|--------|---------|------|------|------|
| sword | 42 | 0.5s | 4.5 | 4.5 | 3 | — | `config.ts` L153 |
| bone_bouncer | 20 | 0.8s | — | — | 3 | 15 | `config.ts` L163 |
| axe | 32 | 0.9s | 5.0 | 1.6 | 4 | 6 | `config.ts` L173 |
| revolver | 45 | 0.25s | 35 | — | 3 | 28 | `config.ts` L183 |
| bow | 58 | 0.6s | 45 | — | 3 | 35 | `config.ts` L193 |
| lightning_staff | 35 | 1.2s | 40 (chains 8) | — | 1 | — | `config.ts` L203 |
| fire_staff | 65 | 1.0s | — | 4.5 | 3 | 12 | `config.ts` L213 |
| flame_ring | 12 | 0.3s | 8.0 | 8.0 | — | — | `config.ts` L223 |
| tornado | 20 | 1.4s | — | 3.0 | 3 | 7 | `config.ts` L233 |
| shotgun | 22 | 0.7s | 20 | — | 9 | 22 | `config.ts` L243 |
| black_hole | 18 | 2.5s | — | 8.0 | 3 | 0 | `config.ts` L253 |
| katana | 48 | 0.3s | 5.0 | 2.5 | 3 | 26 | `config.ts` L263 |
| aura | 14 | 0.5s | 7.0 | 7.0 | — | — | `config.ts` L273 |

补充：

| 参数 | 值 | 来源 |
|-----|----|------|
| 普通投射物半径 | 0.2-0.4 | `GameInstance.ts` L1249, L1288, L1485 |
| Fire staff 50% 飞溅 | proj.damage × 0.5 | `GameInstance.ts` L1666 |
| Lightning chain 衰减 | 0.7× | `GameInstance.ts` L1330 |
| Black hole 引力强度 | 8.0 | `GameInstance.ts` L1526 |
| Bone bouncer 弹反搜索半径 | 20 | `GameInstance.ts` L2744 |
| 击退基础力 | 1.5 单位 | `GameInstance.ts` L2585 |
| Thorns 伤害（每级） | level × 3 | `GameInstance.ts` L2570 |
| Thorns 生效距离 | 1.5 | `GameInstance.ts` L2574 |

---

## 7. 性能预算

### 7.1 游戏逻辑硬上限

| 参数 | 值 | 来源 |
|-----|----|------|
| Tick 频率 | 60 FPS（16.67 ms） | `config.ts` L4 `TICK_INTERVAL_MS = 1000/60` |
| `MAX_ENEMIES` 同时存活上限 | 100 | `config.ts` L5 |
| Final Swarm 阶段上限 | 150 | `GameInstance.ts` L2109 |
| Necromancer 召唤硬上限 | 150 | `GameInstance.ts` L912 |
| `MAX_PROJECTILES` 投射物 | 200 | `config.ts` L6 |
| `MAX_PICKUPS` 拾取物 | 300 | `config.ts` L7 |
| Spatial hash cell size | 4 单位 | `GameInstance.ts` L109 |
| AI 计算分组（每帧只算 1/4） | 4 组 | `GameInstance.ts` L247, L693 |

### 7.2 单关卡推荐模型上限（来自 `WORKFLOW.md` L289-299）

| 模型类型 | 建议最大实例数 | 说明 |
|--------|--------------|------|
| `platform_4x4` | 50 | 大面积覆盖 |
| `platform_4x2` | 80 | 走廊 / 过道 |
| `platform_2x2` / `platform_1x1` | 40 | 小平台 |
| `support` / `support_long` | 100 | 结构支撑 |
| `fence_platform` | 150 | 围栏（来源 `WORKFLOW.md`） |
| `light_street` | 40 | 中等复杂度 |
| `sign_1` / `sign_2` | 20 | 有纹理 |
| `ac_unit` / `pipe` | 60 | 小装饰 |
| **单关卡总实例上限** | **< 800** | 超过应合并几何或分区 |
| 预期 Draw call | 约 15-20 | InstancedMesh 合并后（`WORKFLOW.md` 性能预算） |

### 7.3 优化策略一览

| 策略 | 用法 | 来源 |
|-----|------|------|
| InstancedMesh | 同模型多次摆放 → 1 个 draw call | `WORKFLOW.md` L274 |
| 视锥剔除 | Three.js 自带；客户端对部分动态网格关闭（`frustumCulled = false`） | `index.ts` L1205, L1275, L1287, L1297, L1371 |
| 合并几何体 | 完全静态装饰 | `WORKFLOW.md` L275 |
| LOD / 分区加载 | **当前未采用**，规模未达需要 | `WORKFLOW.md` L283-285 |

---

## 8. 现有关卡基线（core 端 `NEON_CRUCIBLE_GEOMETRY` fallback）

> 历史：原 client 端 `buildArena()` + 硬编码 25 矩形已在激进重构中删除。客户端唯一关卡来自 `public/models/levels/level_whitebox.glb`（双文件模式）。
> core 端仍保留 `NEON_CRUCIBLE_GEOMETRY` 作为 `GameConfig.level` 缺省时的 fallback 几何（仅供单测基线 / 边界使用），对客户端已没有影响。详见 `game/core/source/systems/collision.ts`。

---

## 9. 时间相关

### 9.1 全局总时长

| 阶段 | 起始 | 结束 | 来源 |
|-----|------|------|------|
| 总游戏目标时长 | 0s | **540s（9 分钟）** Boss 出现 | `config.ts` L35 `BOSS_SPAWN_TIME` |

### 9.2 波次时间表（`config.ts` L123-129 `WAVE_CONFIGS`）

| 波次 | 起 (s) | 止 (s) | 生成间隔 | 同时存活上限 | 敌种 | 组规模 | 精英概率 |
|-----|--------|--------|---------|-----------|------|------|--------|
| 1 | 0 | 60 | 2.0s | 30 | skeleton_soldier | 1-3 | 0% |
| 2 | 60 | 180 | 1.5s | 50 | + zombie | 2-4 | 5% |
| 3 | 180 | 300 | 1.2s | 70 | + skeleton_archer | 3-5 | 10% |
| 4 | 300 | 420 | 1.0s | 85 | + 所有 | 3-6 | 15% |
| 5 | 420 | 540 | 0.8s | 100 | + 所有 | 4-8 | 20% |

### 9.3 关键时间节点

| 事件 | 时间 (s) | 来源 |
|-----|--------|------|
| skeleton_soldier 首次出现 | 0 | `config.ts` L104 |
| zombie 首次出现 | 60 | L105 |
| skeleton_archer 首次出现 | 120 | L106 |
| Mini-boss 首次出现 | 180 | `GameInstance.ts` L2116 |
| skeleton_knight 首次出现 | 180 | `config.ts` L107 |
| 敌人额外 HP 缩放启动 | 180 | `GameInstance.ts` L2270 |
| necromancer 首次出现 | 240 | `config.ts` L108 |
| 传送器出现（Tier 2+） | **300（5 分钟）** | `config.ts` L44 `TELEPORTER_APPEAR_TIME` |
| gargoyle 首次出现 | 360 | `config.ts` L109 |
| Final Swarm 开始 | **480（8 分钟）** | `GameInstance.ts` L2106 |
| Boss 出现 | **540（9 分钟）** | `config.ts` L35 |
| Mini-boss 间隔 | 每 120s 一次 | `GameInstance.ts` L2118 |

### 9.4 传送器系统

| 参数 | 值 | 单位 | 来源 |
|-----|----|----|------|
| 出现时间 | 300 | 秒 | `config.ts` L44 `TELEPORTER_APPEAR_TIME` |
| 激活倒计时 | 3.0 | 秒 | `config.ts` L43 `TELEPORTER_ACTIVATION_DURATION` |
| 玩家激活半径 | 2.0 | 单位 | `config.ts` L45 `TELEPORTER_RADIUS` |
| 数量（Tier 1 / 2 / 3） | 0 / 1 / 2 | — | `config.ts` L351-353 |

### 9.5 Boss 阶段触发（按 HP%）

| 阶段 | HP 阈值 | 速度 | 来源 |
|-----|--------|-----|------|
| 1 | > 60% | 3.0 | `GameInstance.ts` L2390-2392 |
| 2 | ≤ 60% | 4.0 | L2386-2388 |
| 3（狂暴） | ≤ 30% | 5.0 | L2382-2385 |

### 9.6 其他时间常数

| 参数 | 值 | 单位 | 来源 |
|-----|----|----|------|
| 拾取物寿命 | 30 | 秒 | `config.ts` L39 `PICKUP_LIFETIME` |
| 拾取物吸引基础速度 | 12 | 单位/秒 | `config.ts` L40 `PICKUP_ATTRACT_SPEED` |
| Combo 重置窗口 | 2.0 | 秒 | `GameInstance.ts` L1927 `comboTimer = 2.0` |
| 敌人击中闪烁时长 | 0.15 | 秒 | `GameInstance.ts` L1115 等 |
| Final Swarm 生成间隔倍率 | 0.5×（加倍） | — | `GameInstance.ts` L2133 |
| Final Swarm 组规模倍率 | 1.5× | — | `GameInstance.ts` L2149 |
| Final Swarm 敌人移速倍率 | 1.2× | — | `GameInstance.ts` L1006 |

---

## 10. 其他遗漏数值

### 10.1 等级 / 经验

| 参数 | 值 | 来源 |
|-----|----|------|
| 最高等级 `MAX_LEVEL` | 40 | `config.ts` L29 |
| 经验基础 `XP_BASE` | 10 | `config.ts` L32 |
| 经验增长 `XP_GROWTH` | 0.35 | `config.ts` L33 |
| 升级回血量 | 当前 maxHp × 10% | `GameInstance.ts` L2070 |
| Combo 经验加成上限 | 2× | `GameInstance.ts` L2047 (1 + min(combo*0.05, 1.0)) |
| 普通怪基础 EXP | `enemy.xpReward` 直接写入 pickup.value：1 / 3 / 3 / 5 / 10 / 10 | `data/enemies.ts` |
| Boss 基础 EXP | 100，死亡时生成 `xp_orange` pickup | `systems/helpers.ts` |
| XP 颜色分档（橙） | pickup.value ≥ 30 | `systems/pickups.ts` |
| XP 颜色分档（紫） | ≥ 10 | `systems/pickups.ts` |
| XP 颜色分档（蓝） | ≥ 3 | `systems/pickups.ts` |
| 精英死亡额外掉落 silver | 5 | `GameInstance.ts` L1977 |
| 胜利奖励 silver | 100 | `GameInstance.ts` L326 |
| Boss 击败固定 silver | 50 | `GameInstance.ts` L2611 |

### 10.2 难度 Tier 倍率（`config.ts` L351-353 `TIER_CONFIGS`）

| Tier | 名称 | 敌 HP | 敌伤害 | 敌速 | XP | Silver | 传送器数 | Boss HP |
|------|-----|-----|------|----|----|--------|--------|--------|
| 1 | Normal | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 0 | 1.0 |
| 2 | Hard | 1.5 | 1.3 | 1.1 | 1.5 | 2.0 | 1 | 1.5 |
| 3 | Nightmare | 2.5 | 1.8 | 1.2 | 2.0 | 3.0 | 2 | 2.5 |

### 10.3 Tome 等级上限（`config.ts` L278-289 `TOME_MAX_LEVELS`）

| Tome | 最大等级 | 主要效果（来源：`GameInstance.ts` `recalculateTomeStats`） |
|------|--------|----------------------------------------------|
| attack_speed_tome | 5 | 每级 +10% 攻速 |
| luck_tome | 3 | 每级 +1 silver（拾取时） |
| thorns_tome | 5 | 每级 +3 反伤 |
| shield_tome | 5 | 每级 +2 护甲 + 5% 受伤减免 |
| xp_gain_tome | 5 | 每级 +15% XP |
| attraction_tome | 5 | 每级 +1.2 拾取半径 |
| curse_tome | 3 | 加速敌人 +10%/级，组规模 +15%/级，XP +20%/级 |
| precision_tome | 5 | 每级 +5% 暴击率 + 10% 暴击伤害 |
| knockback_tome | 3 | 每级 +30% 击退 |
| speed_tome | 5 | 每级 +8% 移速 |

### 10.4 武器进化（`config.ts` L318-327 `WEAPON_EVOLUTIONS`）

| 基础武器 | 必需 Tome | Tome 要求等级 | 进化名 | 伤害倍率 |
|---------|---------|-----------|-------|--------|
| sword | attack_speed_tome | 5 | Dexecutioner | 2.5× |
| axe | knockback_tome | 3 | Berserker Axe | 2.0× |
| bone_bouncer | luck_tome | 3 | Bone Storm | 2.0× |
| revolver | precision_tome | 3 | Deagle | 3.0× |
| lightning_staff | curse_tome | 3 | Thunder God | 2.5× |
| fire_staff | thorns_tome | 3 | Inferno | 2.0× |
| tornado | speed_tome | 5 | Hurricane | 2.5× |
| black_hole | attraction_tome | 5 | Singularity | 3.0× |

进化触发条件：武器 level ≥ 8 且对应 tome 达标。来源：`GameInstance.ts` L2681-2689。

### 10.5 客户端渲染参数

| 参数 | 值 | 来源 |
|-----|----|------|
| 主菜单摄像机距离 | 18-20 单位环绕 | `index.ts` L3266, L3314-3315 |
| 主菜单摄像机 FOV | 50 | `index.ts` L3264 |
| 主菜单雾起 / 止 | 30 / 60 | `index.ts` L3262 |
| 屏震频率（默认） | 由 `shakeFrequency` 控制 | `index.ts` L2629 |
| 屏震衰减 | `0.15^(decay/60)` 每帧 | `index.ts` L2633 |

---

## 总结：关卡设计黄金法则

1. **跳跃天花板是 1 单位，兔子跳 1.44 单位** —— 任何 y ≥ 2 的平台都 **必须** 借助坡道（自动 3 单位边缘过渡）才能上去，跳跃只能用于跨小沟或避障，不要把关键路径设计成"必须跳上 2 单位高台"。

2. **坡道按高度自动生成 3 单位边缘缓冲** —— 设计时 `col_` 体积的实际"可走"区域 = `(halfW × 2) + 6`、`(halfD × 2) + 6`，相邻平台间距 ≥ 6 单位时坡道会无缝过渡，间距 > 6 则需手动桥接。

3. **地图半边长固定 60 单位，敌人外溢 5 单位，投射物外溢 20 单位** —— 关卡可玩区域是 **120 × 120**，所有 `col_` 体积请控制在 ±55 内，留出围栏与外部缓冲空间。

4. **Boss 默认在 (0, 0, −36)，传送器在距玩家 25-40 单位的环带** —— 关卡北侧 z = −36 附近必须留出至少 10×10 的空旷区作为 Boss 战场，外围 25-40 单位环带要至少 3 处可放传送器。

5. **关卡总实例 < 800、同模型 InstancedMesh、单关 draw call 目标 15-20** —— 平台 ≤ 130、围栏 ≤ 150、装饰 ≤ 60；同模型重复摆放是免费的，新模型贵。

6. **Blender 导出务必勾选 `+Y Up`，坐标转换 Y → −Z、Z → Y** —— 这是最常踩的坑；导出前用 `_Reference` 集合的 120×120 网格对齐验证。

7. **物体名前缀必须严格匹配 WORKFLOW.md 表格** —— `col_`、`spawn_player`、`spawn_boss`、`platform_4x4`…… `.001`/`.002` 后缀代码会自动忽略，但前缀错一个字符就识别不到。

8. **敌人四方向从地图边缘 ±65 生成** —— 关卡边界外 5 单位必须保持开放（不要堵围栏出生口），或自定义 `spawn_enemy_N/S/E/W` 覆盖默认。

9. **波次节奏：3 分钟前 chase，3 分钟后 ranged + elite，5 分钟传送器，8 分钟 Final Swarm，9 分钟 Boss** —— 关卡空间设计要兼顾近战引导（窄走廊）+ 远程站位（高台 y=2/4）+ Boss 大圆形战场。

10. **同时存活敌人硬上限 100（Final Swarm 150）+ 投射物 200** —— 任何视觉上"密集"的设计都受这两个上限保护；不必担心平台坡道导致敌人卡死（敌人有 ±65 边界并自动贴地）。
