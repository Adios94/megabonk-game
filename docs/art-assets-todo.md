# 美术资源任务清单

> 给美术 / 主程对接用的"什么资源还缺"清单。
> 数据源：`game/client/source/index.ts` 全文扫描 + `game/core/data/*` + `public/` 目录比对。
> 最后更新：2026-06-14
>
> **归档约定**：所有未被代码引用的模型已挪到 `public/models/_unused/` 与
> `public/models/items/_unused/`。本文档里凡是带 `_unused/` 前缀的路径，
> 都是"暂时不加载、但日后可挂回去"的备用资产；要启用时把文件 `mv` 回上一级即可。

---

## 0. 总览

| 类别 | 已就位 | 仅程序化或风格不符 | 完全缺失 |
|---|---|---|---|
| 玩家角色 | 3 / 3 | — | — |
| 敌人模型（语义匹配） | 6 / 6 | — | — |
| Boss 模型 | 0 / 2（两关用带枪机械敌占位，动画已接） | 2 | — |
| 武器手持 / 弹幕模型 | 7 / 12 | 5 | — |
| 拾取物 | 1 / 7（其余靠染色） | 6 | — |
| 消耗品 | 0 / 10 | 10（全 emoji） | — |
| 武器 UI 图标 | 3 / 12 | 9（emoji 占位） | — |
| Tome / 被动 UI 图标 | 0 / 12 | 12（emoji 占位） | — |
| 场景关卡 | 1 张 whitebox | — | 多场景 |
| VFX 贴图 | 11 / 11（基础） | — | 序列帧 / 命中 / 升级 |
| 音效 / BGM | **0** | — | 全部 |

---

## 1. 玩家角色

| 角色 ID | 文件 | 引用位置 | 状态 |
|---|---|---|---|
| megachad | public/models/player_george.gltf | index.ts:2679 | OK |
| roberto | public/models/player_stan.gltf | index.ts:2680 | OK |
| skateboard_skeleton | public/models/player_leela.gltf | index.ts:2681 | OK |
| 角色 fallback | `CHARACTER_MODELS['megachad']`（player_george.gltf） | index.ts:2686 | 任意 character 字段缺失/异常都回落到 megachad |
| 加载中占位 | THREE.CapsuleGeometry(0.5, 1.0) | index.ts:2686 | 程序化（仅模型加载完成前显示） |

> 玩家动画 Idle/Run/Attack 通过 GLTF 内嵌 AnimationClip 已接好。
> 已扩展：Hello / Dance（idle flavor 间歇穿插）、HitRecieve_1/2（站立受击）、
> Punch（开宝箱）、Death（LoopOnce + 尸体保留）。

---

## 2. 敌人模型（6 / 6 全部就位）

`core/data/enemies.ts` 定义 6 种敌人，渲染层已全部接上语义贴合的模型，
不再有 zombie 贴皮错位。

| 敌人 ID | 设定 | 当前用模型 | 应有形象 | 状态 |
|---|---|---|---|---|
| skeleton_soldier | 普通骷髅兵 | skins/kaykit/Skeleton_Minion.glb（kk_minion） | 骷髅兵（手持斧） | OK（KayKit，Rig_Medium 动画 + 手持斧 Skeleton_Axe） |
| zombie | 高 HP 慢速僵尸 | zombie_basic.gltf | （风格匹配，靠 enemyScales 放大暗示高 HP） | OK |
| skeleton_archer | 远程攻击 | skins/kaykit/Skeleton_Mage.glb（kk_mage） | 远程施法骷髅（法杖） | OK（KayKit 法师，落地人形 + 手持法杖 Skeleton_Staff） |
| skeleton_knight | 精英冲锋骑士 | skins/kaykit/Skeleton_Warrior.glb（kk_warrior） | 骷髅骑士（甲胄+大剑+盾） | OK（KayKit 战士，剑 Skeleton_Blade + 大盾 Skeleton_Shield_Large_A；目标高度 1.95m 区分精英） |
| necromancer | 召唤型法师 | ghost.glb | 死灵法师（袍子+杖） | OK（飘浮形象贴合，32 个动画 clip） |
| gargoyle | 飞行俯冲 | monsters/Bat.glb | 蝙蝠 / 石像鬼 | OK（带飞行/攻击/受击/死亡动画） |

> **三个骷髅类敌人（2026-06-13 改用 KayKit Skeletons 1.1）**：共用 `Rig_Medium` 骨架，
> 动画来自 `skins/kaykit/anim/Rig_Medium_{General,MovementBasic}.glb`（独立 GLB，clip 按骨名
> 直接绑定），归一化映射：Idle_A→Idle / Walking_A→Walk / Running_A→Run / Hit_A→HitReact /
> Death_A→Death / Throw→Punch（FREE 包无近战挥砍，用 Throw 当攻击替身）。手持武器克隆挂到
> `handslot.r` / `handslot.l` 骨（GLTFLoader 会去掉骨名里的 `.`，按归一化名匹配）。
> 加载与挂载逻辑见 `loadSkinModels()` 与 `attachEnemyWeapons()`。

> skeleton_knight / archer / soldier 现统一改用 KayKit Skeletons（Warrior / Mage / Minion），
> 共用 Rig_Medium 骨架 + Rig_Medium 通用动画 + handslot 手持武器（详见上方说明与 §2.1）。
> 旧的 `knight.glb` / `monsters/Dragon.glb` / `monsters/Skeleton.glb` 不再被这三个敌人引用。
>
> ✅ `zombie_chubby.gltf` / `zombie_arm.gltf` 现已无敌人引用，已归档到 `public/models/_unused/`
> 并从 `loadModels()` 加载列表移除（仅 `zombie_basic.gltf` 仍在用，渲染 `zombie`）。

### 敌人尺寸统一（按模型高度归一化，参考玩家）

不同来源模型（Quaternius / zombie / ghost）原始尺寸差异巨大，旧逻辑把 `enemyScales`
当绝对倍数乘到原始尺寸上会大小失控。现已改为**与玩家 `setupPlayer` 同款**：先按模型
实际包围盒高度归一化，再缩放到目标世界高度。`enemyScales` 的语义 = 目标高度（米）。

> 敌人整体比玩家矮一截（约 ×0.8）以凸显角色。

| 敌人 | 目标高度(米) | 说明 |
|---|---|---|
| 玩家（参考） | 1.8 | setupPlayer targetHeight |
| skeleton_soldier（KayKit Minion） | 1.2 | 略矮于玩家 |
| zombie | 1.1 | 高 HP 坦克 |
| skeleton_archer（KayKit Mage） | 1.2 | 落地法师 |
| skeleton_knight（KayKit Warrior） | 2.6 | 精英，明显更大 |
| necromancer | 0.7 | 飘浮幽灵（小巧，离地 1m） |
| gargoyle（蝙蝠） | 0.7 | 小型飞行（离地 y=1.8，core dive 行为控制） |

> **视觉离地高度**：`ENEMY_HOVER_OFFSET`（client 渲染层）给飘浮模型（necromancer→ghost）
> 加 1.8m 渲染偏移，让它浮空。skeleton_archer 改用落地的 KayKit 法师后已移除其 hover。
> 纯渲染偏移，不动 core 逻辑（碰撞 / preferredRange 走水平 x/z）；blob 阴影仍贴地面。
> gargoyle 的飞行高度由 core `dive` 行为（y=1.8）控制，不在此叠加。

> 实现：`updateEnemyObjects` 用 `enemyModelNormHeight` 缓存每个模型 `1/实际高度` 的
> 归一化系数，最终 `scale = normFactor × 目标高度 × sizeMultiplier`（miniBoss 1.5 / elite 1.2）。
> 改大小只需调 `enemyScales` 的目标高度值。`setupEnemyMeshes` 内的 enemyScales 是 legacy
> InstancedMesh 路径，已不参与渲染。

### 2.1 已接入的带动画 GLB（含 clip 归一化）

| 文件 | 用途 | 命名风格 | 归一化后可用 clip |
|---|---|---|---|
| public/models/skins/kaykit/Skeleton_{Warrior,Mage,Minion}.glb + anim/Rig_Medium_*.glb | skeleton_knight / archer / soldier | 角色 GLB 无内嵌动画，clip 来自独立 Rig_Medium GLB | Idle, Walk, Run, HitReact, Death, Punch（由 General+MovementBasic 抽取重命名） |
| public/models/monsters/Bat.glb | gargoyle | `Bat_*` 前缀 | Attack, Attack2, Death, Flying(→Idle/Walk/Run 别名), Hit |
| public/models/ghost.glb | necromancer | 全小写 | Idle, Walk, Sprint(→Run 别名), Die(→Death 别名), Jump, Fall, Attack-melee-right 等 32 条 |
| ~~monsters/Skeleton.glb / monsters/Dragon.glb / knight.glb~~ | 不再被敌人引用（可后续归档） | — | — |

> **加载与归一化**：所有 GLB 都走 `loadModels()` 的 GLTF 主队列；加载完成后
> `normalizeEnemyClips()` 对 `monster_*` 和 `ghost` 模型做四步处理：
> (1) strip 形如 `^[A-Za-z]+_` 的前缀（Skeleton_Idle → Idle）；
> (2) 首字母大写化（idle → Idle、walk → Walk）；
> (3) 别名补全：Running/Sprint → Run、Die → Death、Flying/Static/Walk/Run 之一 → Idle；
> (4) 飞行怪兜底：若模型有 Flying 但没 Walk/Run，把 Flying 同时注册成 Walk / Run，
>    让 enemy 移动判定直接命中，不需走 fallback。
>
> **映射在两处**：`setupEnemyMeshes` 与 `updateEnemyObjects` 的 `enemyModelMap`，
> 需要同步修改。

### 2.2 已归档的备选模型（位于 public/models/_unused/）

未接入但可作为后续替换候选：

| 文件 | 可临时顶替 |
|---|---|
| public/models/_unused/pumpkin.glb | 万圣节季节皮肤 |
| public/models/_unused/zombie_chubby.gltf | zombie 备选（胖僵尸） |
| public/models/_unused/zombie_arm.gltf | 远程/异变僵尸备选 |
| public/models/_unused/enemy_2legs.gltf | 远程机械敌 |
| public/models/_unused/enemy_2legs_gun.gltf | 同上 |
| public/models/_unused/enemy_flying.gltf | gargoyle 已改用 Bat.obj，此项可删 |
| public/models/_unused/enemy_flying_gun.gltf | 同上 |
| public/models/_unused/enemy_large.gltf | 精英 / 备 Boss |
| public/models/_unused/zombie.glb | 重复（建议删） |

---

## 3. Boss 模型（P0）

第 1/2 关现为两套独立机甲 Boss（2026-06-14 反向设计：攻击逻辑 + 动画按模型现有 clip 重做）。

| 关卡 | Boss | 逻辑脚本 | 当前模型 | 动画 clip | 状态 |
|---|---|---|---|---|---|
| 第 1 关 | 游侠机甲（gunner_mech） | core/ai/bosses/gunnerMech.ts | public/models/enemy_2legs_gun.gltf | Idle/Walk/Run/Jump/Shoot/Attack/Death（已接 AnimationMixer） | 占位（带枪机械敌，风格够用） |
| 第 2 关 | 攻城机甲（siege_mech） | core/ai/bosses/siegeMech.ts | public/models/enemy_large_gun.gltf | 上述 + Attack.001（已接） | 占位 |
| — | Boss fallback | THREE.BoxGeometry(2.4, 3.0, 2.4) 紫色 | — | — | 程序化（模型缺失时） |
| — | 闲置候选 | public/models/_unused/boss.glb | — | — | 未引用，风格未知 |

> 渲染统一缩放到 **7m 高**（`TARGET_BOSS_HEIGHT`，`renderBoss`）。攻击 tag → clip 映射见 client `BOSS_ATTACK_CLIP`。
> 美术目标：两套差异化机甲（敏捷射手 / 重装炮手），或替换成原设定形象。

### 3.1 已知问题：Boss 寻路不灵活（待优化）

- **贪心直线追踪，无真正寻路**：`systems/bossAi.ts` 每帧朝玩家方向直走，撞到 `col_/wall_` 即被 `tryMoveHorizontally` 挡住、不会绕路 → 玩家可躲到障碍物后"放风筝"。
- **物理脚印与视觉脱钩**：移动碰撞半径写死 `radius: 1.0`，与 7m 视觉体型不匹配 → 大模型可能半身穿墙；近战判定（`collisions` 2.0 / 各攻击 3.5~7.0）也未随体型放大，玩家会觉得"贴脸了却没被打到"。
- **可选优化**：① 放大物理半径贴合体型；② 放大近战/攻击判定范围改善手感；③ 加"被挡时沿墙切向滑动"的简单避障。

---

## 4. 武器模型

`core/data/weapons.ts` 定义 12 种武器。

> 注：旧的武器进化系统已被「羁绊系统」取代（见 `core/config.ts:390`、`core/systems/bonds.ts`），
> `WeaponInstance.evolved` 恒为 `false`，进化（金色）模型不再被渲染。
> 除 `Dart_Golden`（shotgun 弹丸的常规模型）外，金色模型已全部归档到 `items/_unused/`。

### 4.1 已就位（OBJ + MTL 或 GLB）

| 武器 ID | 普通模型 | 进化（金色）模型 | 引用 |
|---|---|---|---|
| sword | Sword.obj + Sword.mtl | _unused/Sword_Golden.obj/.mtl（已归档） | — |
| axe | Axe_small.obj/.mtl | _unused/Axe_Double_Golden.obj/.mtl（已归档） | — |
| bow（实际是左轮） | Revolver.glb | _unused/Bow_Golden.obj/.mtl（已归档） | — |
| bone_bouncer | Bone.obj（仅 geometry） | — | — |
| shotgun（弹丸） | Dart_Golden.obj/.mtl | — | 无条件用作弹丸模型 |

### 4.2 模型已加载但**未挂任何武器**（备用资源）

| 模型 | 备注 |
|---|---|
| Sword_big.obj/.mtl | katana（备用，已加载） |
| Hammer_Double.obj/.mtl | hammer（备用，已加载） |
| Dagger.obj/.mtl | dagger（备用，已加载） |
| Dart.obj/.mtl | dart（备用，已加载） |
| _unused/Sword_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除） |
| _unused/Axe_Double_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除） |
| _unused/Bow_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除） |
| _unused/Dagger_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除） |
| _unused/Sword_big_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除） |
| _unused/Bow_Wooden.obj/.mtl | 未引用，已归档 |
| _unused/Coin.obj/.mtl | 未引用，已归档（§5 silver 拾取改造时需移回） |
| _unused/Heart_Half.obj/.mtl | 未引用，已归档（§5 health_small 改造时需移回） |

### 4.3 没有专属模型 / 全程序化（P0 重点）

| 武器 ID | 当前表现 | 缺什么 | 优先级 |
|---|---|---|---|
| lightning_staff | TubeGeometry 闪电链 + 粒子 | 手持权杖模型 + 闪电序列贴图 | P1 |
| flame_ring | RingGeometry 玩家脚下圆环 | 火焰序列贴图 / 法器模型 | P1 |
| ray_gun | BoxGeometry 拉伸成红激光 | 激光枪手持模型 + 激光柱贴图 | P0 |
| poison_bomb | CircleGeometry 绿底 + 粒子 | 毒气瓶模型 + 毒云 sprite 序列 | P0 |
| paralysis_gun | 借用 Dart 模型当弹丸 | 麻痹枪模型 + 黄色电弧贴图 | P0 |
| void_ripple | RingGeometry 青色环 | 虚空波纹 sprite 序列 | P1 |
| scorch_boots | CircleGeometry 橙色 | 灼地脚印贴花 sprite | P1 |

---

## 5. 拾取物 / 经验球（P0）

`PickupType` 共 7 种，但 `index.ts:2935-2944` 全部用同一个 `crystalGeometry` (Crystal1.obj) + `setColorAt()` 染色。

| 类型 | 数值 | 当前 | 应该用 |
|---|---|---|---|
| xp_green | 1 xp | Crystal1.obj 染绿 | Crystal1.obj（小） |
| xp_blue | 3 xp | Crystal1.obj 染蓝 | Crystal2.obj |
| xp_purple | 10 xp | Crystal1.obj 染紫 | Crystal3.obj |
| xp_orange | 20 xp | Crystal1.obj 染橙 | Crystal4.obj 或 Crystal5.obj |
| silver | 银币 | Crystal1.obj 染金 | Coin.obj（当前在 items/_unused/，挂载时先 mv 回 items/） |
| health | 大心 | Crystal1.obj 染红 | Heart.obj |
| health_small | 小心 | Crystal1.obj 染红缩小 | Heart_Half.obj（当前在 items/_unused/，挂载时先 mv 回 items/） |

> **改造点**：把 `setupPickupMesh()` 的单个 InstancedMesh 改成 7 个，每种类型独立 geometry。
> Crystal2/3/4/5.obj 已被 `loadObjItems()` 加载（index.ts:1720-1723），可直接复用；
> Coin / Heart_Half 需要先从 `items/_unused/` 移回 `items/` 并加进 `loadObjItems()`。

### 其他拾取相关

| 项 | 当前 | 状态 |
|---|---|---|
| 金币粒子 goldMote | Canvas2D 程序化 | 可保留，也可换 sprite |
| 宝箱 | Chest_Closed.obj/.mtl + Chest_Open.obj/.mtl | OK |

---

## 6. 消耗品（P0 - 全 emoji 占位）

`core/data/consumables.ts` 10 种消耗品，**全部用 emoji 当图标和地面 mesh，没有 3D 模型也没有 UI 图标**。

| ID | 名称 | 当前 | 缺 |
|---|---|---|---|
| wild_berry | 野莓 | 🫐 emoji | 3D pickup mesh + 64×64 UI icon |
| hot_soup | 热汤 | 🍲 emoji | 同上 |
| mint_candy | 薄荷糖 | 🍬 emoji | 同上 |
| hard_bread | 硬面包 | 🥖 emoji | 同上 |
| energy_bar | 能量棒 | 🍫 emoji | 同上 |
| magnet | 磁铁 | 🧲 emoji | 同上 |
| iron_meal | 铁甲餐 | 🍱 emoji | 同上 |
| rage_potion | 狂怒药 | 💢 emoji | 同上 |
| prophecy_book | 预言书 | 📖 emoji | 同上 |
| craftsman_hammer | 工匠锤 | 🔨 emoji | 同上 |

> 优先做 10 张 64×64 UI 图标（玩家直接可见），3D pickup 可后补。

---

## 7. 场景 / 关卡

### 7.1 当前真正在用的场景资源

| 用途 | 模型 | 引用 | 状态 |
|---|---|---|---|
| 关卡白盒 | level_whitebox.glb + _col.glb | `tryLoadLevel()` index.ts:2072（默认关卡名 `whitebox` index.ts:1826） | 关卡几何体唯一来源 |
| 传送门 / 祭坛 | turret_teleporter.gltf | 加载 index.ts:1684；摆放 `renderTeleporters()` index.ts:5334 | OK（缺模型时 fallback 蓝环+光柱） |

> **2026-06-14 清理**：原"已就位的 Cyberpunk Kit"表里列的平台 / 立柱 / 围栏 / 路灯 / 招牌 / 空调 / 管道 / 门 /
> 拾取齿轮 / 墓碑 / 树（共 18 个文件）此前只在 `loadModels()` 里被加载，**从未摆进场景**
> （既付启动开销又无画面产出）。已从 `index.ts` 的 `LoadedModels` 接口 / `loadedModels` 对象 / `modelPaths`
> 三处删除，并把模型文件移到 `public/models/_unused/`（见 7.2）。日后做场景装饰时再挂回来。

### 7.2 已归档到 `public/models/_unused/`（可挂可不挂）

**2026-06-14 新移入**（原"已就位 Kit"，实际未使用）：

```
platform_4x4_full.gltf · platform_4x2.gltf · platform_2x2.gltf · platform_1x1.gltf
platform_4x1.gltf · support.gltf · support_long.gltf · rail_long.gltf
fence_platform.gltf · light_street_1.gltf · sign_1.gltf · sign_2.gltf
ac_unit.gltf · pipe_1.gltf · door.gltf · collectible_gear.gltf
tombstone.glb · tree.glb
```

**更早归档**：

```
ac_stacked.gltf · antenna_1.gltf · computer.gltf · light_square.gltf
light_street_2.gltf · lootbox.gltf · pipe_2.gltf · platform_2x1.gltf
platform_4x4.gltf · rail_corner.gltf · rail_short.gltf · sign_3.gltf
sign_corner_1.gltf · support_short.gltf · turret_cannon.gltf · tv_1.gltf
pickup_health.gltf · pickup_heart.gltf · fence.glb
fence_cyber.fbx · light_street.fbx · rail_long.fbx · sign_1.fbx（FBX 重复，建议删）
```

> 要启用任意一个：`mv public/models/_unused/<file> public/models/`，
> 并在 `loadModels()`（index.ts:1683 起的 `modelPaths`）里加一行，同时在 `LoadedModels` 接口和
> `loadedModels` 对象补对应字段（三处强类型绑定，必须同步）。

### 7.3 场景缺失

| 元素 | 当前 | 应有 |
|---|---|---|
| 地面 | PlaneGeometry(400, 400) 纯色 | 街道材质贴图 |
| 霓虹地砖 | 13 块 PlaneGeometry(2.5, 2.5) 半透明色块 | 发光地砖贴图 |
| 关卡数 | 仅 1 张 whitebox | 3-5 张正式关卡 |

---

## 8. 程序化几何体清单（这些是"等替换的占位"）

以下都是 `index.ts` 用 Three.js 原始几何体硬画出来的，每行直接跳转到代码位置即可对接美术。

| 行号 | 用途 | 占位几何 | 想要的资产 | 优先级 |
|---|---|---|---|---|
| index.ts:2755 | 玩家脚下选中圆环 | RingGeometry(0.6, 0.75) 绿色 | 选中圆环 sprite 128px | P2 |
| index.ts:2764 | 进化武器金色光环 | SphereGeometry(1.2) 黄透明 | 金色光晕 sprite | P2 |
| index.ts:2926 | 通用投射物 | SphereGeometry(0.25) | 默认弹丸贴图 | P2 |
| index.ts:2937 | xp/health/silver 拾取 | OctahedronGeometry(0.35) | 见第 5 节 | P0 |
| index.ts:3438 | Boss 攻击预警圆环 | RingGeometry(0.5, 3.5) | 警示带 sprite（红黄条纹） | P1 |
| index.ts:3999 | 剑气扇形 | RingGeometry(1.0, 1.9) 120° | 剑气贴图（slash.png 已有） | — |
| index.ts:4019-99 | 闪电链 | TubeGeometry + 粒子 | 闪电贴图序列 5-8 帧 | P1 |
| index.ts:4124 | 火焰圈圆盘 | RingGeometry(1.7, 2.7) | 火焰圆环贴花（flame.png 已有） | — |
| index.ts:5010 | 祭坛 fallback 圆环 | RingGeometry(1.5, 2.0) | 祭坛圆环贴花 | P1 |
| index.ts:5025 | 祭坛光柱 | CylinderGeometry(0.3, 1.5, 4) | 光柱 sprite | P1 |
| index.ts:5037 | 祭坛地面魔法阵 | PlaneGeometry(5,5) + magic_circle.png | 已就位 | — |
| index.ts:5645-80 | 宝箱 fallback | BoxGeometry 程序化 | 已用 OBJ 替换大部分 | — |
| index.ts:5694 | 宝箱光柱 | CylinderGeometry(0.45, 0.95, 2.8) | 光柱 sprite | P1 |
| index.ts:5822 | 神坛进度环 | RingGeometry(2.45, 2.65) | 进度条贴花 | P1 |
| index.ts:5836 | 神坛悬浮水晶 | OctahedronGeometry(0.55) | 水晶模型 | P1 |
| index.ts:5849 | 神坛光柱 | CylinderGeometry(0.18, 0.5, 3.5) | 光柱 sprite | P1 |
| index.ts:6171 | ray_gun 激光线 | BoxGeometry(1,1,1) 拉伸 | 激光贴图（细长发光带） | P0 |
| index.ts:6179 | 毒气云 | CircleGeometry(1, 24) | 毒气贴花 sprite | P0 |
| index.ts:6190 | void_ripple 虚空环 | RingGeometry(0.82, 1.0) | 虚空波纹 sprite 序列 | P1 |
| index.ts:6201 | scorch_trail 灼地痕迹 | CircleGeometry(1, 20) | 灼地贴花 sprite | P1 |

---

## 9. 特效（VFX）贴图

### 9.1 已就位（11 张 billboard 贴图）

| key | 文件 | 用途 |
|---|---|---|
| spark | textures/vfx/spark.png | 通用粒子 |
| star | textures/vfx/star.png | 升级 / 经验闪光 |
| smoke | textures/vfx/smoke.png | 烟雾 |
| light | textures/vfx/light.png | 一般光晕 |
| slash | textures/vfx/slash.png | 剑气 / 切击 |
| muzzle | textures/vfx/muzzle.png | 枪口 / 施法闪光 |
| magic_circle | textures/vfx/magic_circle.png | 祭坛 / 法阵 |
| portal_swirl | textures/vfx/portal_swirl.png | 传送门旋涡 |
| scorch | textures/vfx/scorch.png | 烧痕 |
| dirt | textures/vfx/dirt.png | 尘土 |
| flame | textures/vfx/flame.png | 火焰 |

### 9.2 已存在但未被引用（可删 / 可挂）

```
public/textures/particle_circle.png
public/textures/particle_flare.png
public/textures/particle_star.png
public/textures/particle_twirl.png
public/textures/texture_sign.png
```

### 9.3 程序化生成（Canvas 绘制 → 可替换为静态 PNG）

| 行号 | 内容 | 当前实现 | 推荐美术 |
|---|---|---|---|
| index.ts:329-422 | 麻痹三角警示标 | Canvas2D 红黄三角形 | paralysis_warn.png 64×64 |
| index.ts:535+ | 奥术光球（Bond VFX） | Canvas getArcaneOrbTexture() | arcane_orb.png 128×128 |
| index.ts:2946-80 | 金币粒子 mote | Canvas2D 金币 | gold_mote.png 64×64 |
| index.ts:6237 | 头顶"奥秘"数字 | Canvas2D 文字（动态） | 保留 Canvas |
| index.ts:7582+ | 飘字伤害数 | Canvas2D 文字（动态） | 保留 Canvas |

---

## 10. UI 资源

### 10.1 已就位

详见 `public/ui/` 下：button / characters / common / panel / quests / shop / title。

### 10.2 缺失（emoji 占位）

| 用途 | 当前 | 应有 |
|---|---|---|
| 武器图标 12 张 | emoji（🗡🦴🪓🔫⚡🔥💥🔴☠⚠🌀🥾） | 64×64 PNG |
| Tome（被动书）图标 12 张 | emoji（⚡❤🎒🍀🌹🛡📚🧲💀🎯💨👟） | 64×64 PNG |
| 消耗品图标 10 张 | emoji（见第 6 节） | 64×64 PNG |
| Stat 图标 | emoji（在 index.ts:560-587） | 已用，可保留 |

> 已有：`/ui/weapons/sword.png`, `axe.png`, `bone_bouncer.png` —— 仅 3/12

---

## 11. 音效 / BGM（P0 - 完全缺失）

`grep -i "audio|sound|new Audio"` 在整个 `game/` 目录 **0 命中**。代码完全没有音频框架。

| 类别 | 状态 | 建议数量 |
|---|---|---|
| 武器音效（命中/释放/进化） | 缺 | 12 × 3 = 36 |
| UI 音效（点击/升级/购买/任务） | 缺 | ~10 |
| 敌人音效（出现/受击/死亡） | 缺 | ~15 |
| Boss 音效（嘶吼/技能/死亡） | 缺 | ~5 |
| 角色音效（受伤/死亡/拾取） | 缺 | ~8 |
| BGM（菜单/战斗/Boss/胜利/失败） | 缺 | 5 |
| 环境音 | 缺 | 2-3 |

> 实施步骤：1）选音频库（建议 `howler.js` 或 `THREE.PositionalAudio`）；2）写个 `AudioManager`；3）至少 20 个核心音效先上。

---

## 12. 优先级排序（必补清单）

### P0 — 影响游戏识别度（本周必补）

1. **6 个敌人语义模型**（skeleton_soldier / skeleton_archer / skeleton_knight / necromancer / gargoyle）—— zombie 已 OK
2. **两套机甲 Boss 模型**（游侠机甲 / 攻城机甲；当前用带枪机械敌占位）+ **Boss 寻路优化**（见 §3.1）
3. **5 个新武器手持/弹幕模型**：ray_gun、poison_bomb、paralysis_gun、void_ripple、scorch_boots
4. **武器 UI 图标 12 张**（替代 emoji）
5. **消耗品 UI 图标 10 张**（替代 emoji）
6. **音频系统 + 至少 20 个核心音效**
7. **拾取物按类型替换 OBJ**（xp 4 阶 + silver/heart/heart_small）

### P1 — 提升精致度

8. lightning_staff / flame_ring / ray_beam / void_ripple / scorch_boots **特效贴图序列**
9. **Tome 12 个 UI 图标**
10. 2-3 张额外正式关卡（替代单一 whitebox）
11. **BGM 至少 3 首**（菜单/战斗/Boss）
12. 神坛 / 祭坛 / Boss 预警圆环替换为带美术的贴花
13. 宝箱光柱 / 神坛光柱 sprite

### P2 — 细节

14. 把 Canvas 程序化贴图导出为静态 PNG（paralysis_warn / arcane_orb / gold_mote）
15. 接入或删除 particle_circle/flare/star/twirl 等备用粒子
16. 地面材质贴图（替代纯色 PlaneGeometry）
17. 玩家选中圆环 / 进化武器金色光环 sprite

---

## 13. 文件路径速查

| 资产文件夹 | 用途 |
|---|---|
| public/models/ | 角色 / 敌人 / 场景 GLTF/GLB（当前 26 个在用，含 ghost.glb） |
| public/models/_unused/ | 已归档：33 个未引用模型 / FBX 重复 / 旧版替换件 |
| public/models/monsters/ | GLB 怪物（Quaternius Monster Pack 带动画版，skeleton_soldier / gargoyle 用） |
| public/models/items/ | 武器 / 拾取物 OBJ + MTL（当前 22 个文件在用） |
| public/models/items/_unused/ | 已归档：3 套未引用 OBJ + MTL（Bow_Wooden / Coin / Heart_Half） |
| public/models/levels/ | 关卡白盒 GLB |
| public/textures/vfx/ | 11 张 VFX 贴图 |
| public/textures/ | 备用粒子贴图（5 张未引用，未归档） |
| public/ui/ | UI 图片资源 |

| 代码定义位置 | 内容 |
|---|---|
| game/core/data/weapons.ts | 12 种武器定义 |
| game/core/data/enemies.ts | 6 种敌人定义 |
| game/core/data/consumables.ts | 10 种消耗品定义 |
| game/client/source/index.ts:1259 loadModels() | 模型加载列表 |
| game/client/source/index.ts:1683 loadObjItems() | OBJ 物品加载列表 |
| game/client/source/index.ts:115 VFX_TEXTURE_FILES | VFX 贴图配置 |
| game/client/source/index.ts:2861 enemyModelMap | 敌人 → 模型映射 |
