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


| 类别              | 完成度    | 已就位                                                     | 仅程序化或风格不符    | 完全缺失          |
| --------------- | ------ | ------------------------------------------------------- | ------------ | ------------- |
| 玩家角色            | ✅ 完成   | 3 / 3                                                   | —            | —             |
| 敌人模型（语义匹配）      | ✅ 完成   | 6 / 6                                                   | —            | —             |
| Boss 模型         | ✅ 完成   | 2 / 2（游侠机甲 / 攻城机甲，带枪机械敌模型，风格贴合机甲设定，逻辑/动画已接）        | —            | —             |
| 武器手持 / 弹幕模型     | ✅ 完成   | 12 / 12（全部接 floater 模型）                                   | —            | —             |
| 拾取物             | ✅ 完成   | 7 / 7（全部接专属模型：xp 四档 Crystal1-4 + Coin/Heart/Heart_Half） | —            | —             |
| VFX 贴图          | 🟢 基本完成 | 18 个贴图 key 已接（武器特效全部贴图化）                                | —            | 多帧序列 / 升级闪光     |
| 消耗品             | 🔴 待补   | 0 / 10                                                  | 10（全 emoji）  | —             |
| 武器 UI 图标        | 🟡 进行中  | 3 / 12                                                  | 9（emoji 占位）  | —             |
| Tome / 被动 UI 图标 | 🔴 待补   | 0 / 12                                                  | 12（emoji 占位） | —             |
| 场景关卡            | 🟡 进行中  | 1 张 whitebox                                            | —            | 多场景           |
| 音效 / BGM        | 🔴 待补   | **0**                                                   | —            | 全部            |


---

## 1. 玩家角色【已完成】


| 角色 ID               | 文件                                                 | 引用位置          | 状态                                |
| ------------------- | -------------------------------------------------- | ------------- | --------------------------------- |
| megachad            | public/models/player_george.gltf                   | index.ts:2679 | OK                                |
| roberto             | public/models/player_stan.gltf                     | index.ts:2680 | OK                                |
| skateboard_skeleton | public/models/player_leela.gltf                    | index.ts:2681 | OK                                |
| 角色 fallback         | `CHARACTER_MODELS['megachad']`（player_george.gltf） | index.ts:2686 | 任意 character 字段缺失/异常都回落到 megachad |
| 加载中占位               | THREE.CapsuleGeometry(0.5, 1.0)                    | index.ts:2686 | 程序化（仅模型加载完成前显示）                   |


> 玩家动画 Idle/Run/Attack 通过 GLTF 内嵌 AnimationClip 已接好。
> 已扩展：Hello / Dance（idle flavor 间歇穿插）、HitRecieve_1/2（站立受击）、
> Punch（开宝箱）、Death（LoopOnce + 尸体保留）。

---

## 2. 敌人模型（6 / 6 全部就位）【已完成】

`core/data/enemies.ts` 定义 6 种敌人，渲染层已全部接上语义贴合的模型，
不再有 zombie 贴皮错位。


| 敌人 ID            | 设定        | 当前用模型                                         | 应有形象                          | 状态                                                                          |
| ---------------- | --------- | --------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| skeleton_soldier | 普通骷髅兵     | skins/kaykit/Skeleton_Minion.glb（kk_minion）   | 骷髅兵（手持斧）                      | OK（KayKit，Rig_Medium 动画 + 手持斧 Skeleton_Axe）                                 |
| zombie           | 高 HP 慢速僵尸 | zombie_basic.gltf                             | （风格匹配，靠 enemyScales 放大暗示高 HP） | OK                                                                          |
| skeleton_archer  | 远程攻击      | skins/kaykit/Skeleton_Mage.glb（kk_mage）       | 远程施法骷髅（法杖）                    | OK（KayKit 法师，落地人形 + 手持法杖 Skeleton_Staff）                                    |
| skeleton_knight  | 精英冲锋骑士    | skins/kaykit/Skeleton_Warrior.glb（kk_warrior） | 骷髅骑士（甲胄+大剑+盾）                 | OK（KayKit 战士，剑 Skeleton_Blade + 大盾 Skeleton_Shield_Large_A；目标高度 1.95m 区分精英） |
| necromancer      | 召唤型法师     | ghost.glb                                     | 死灵法师（袍子+杖）                    | OK（飘浮形象贴合，32 个动画 clip）                                                      |
| gargoyle         | 飞行俯冲      | monsters/Bat.glb                              | 蝙蝠 / 石像鬼                      | OK（带飞行/攻击/受击/死亡动画）                                                          |


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


| 敌人                              | 目标高度(米) | 说明                            |
| ------------------------------- | ------- | ----------------------------- |
| 玩家（参考）                          | 1.8     | setupPlayer targetHeight      |
| skeleton_soldier（KayKit Minion） | 1.2     | 略矮于玩家                         |
| zombie                          | 1.1     | 高 HP 坦克                       |
| skeleton_archer（KayKit Mage）    | 1.2     | 落地法师                          |
| skeleton_knight（KayKit Warrior） | 2.6     | 精英，明显更大                       |
| necromancer                     | 0.7     | 飘浮幽灵（小巧，离地 1m）                |
| gargoyle（蝙蝠）                    | 0.7     | 小型飞行（离地 y=1.8，core dive 行为控制） |


> **视觉离地高度**：`ENEMY_HOVER_OFFSET`（client 渲染层）给飘浮模型（necromancer→ghost）
> 加 1.8m 渲染偏移，让它浮空。skeleton_archer 改用落地的 KayKit 法师后已移除其 hover。
> 纯渲染偏移，不动 core 逻辑（碰撞 / preferredRange 走水平 x/z）；blob 阴影仍贴地面。
> gargoyle 的飞行高度由 core `dive` 行为（y=1.8）控制，不在此叠加。

> 实现：`updateEnemyObjects` 用 `enemyModelNormHeight` 缓存每个模型 `1/实际高度` 的
> 归一化系数，最终 `scale = normFactor × 目标高度 × sizeMultiplier`（miniBoss 1.5 / elite 1.2）。
> 改大小只需调 `enemyScales` 的目标高度值。`setupEnemyMeshes` 内的 enemyScales 是 legacy
> InstancedMesh 路径，已不参与渲染。

### 2.1 已接入的带动画 GLB（含 clip 归一化）


| 文件                                                                                    | 用途                                 | 命名风格                                  | 归一化后可用 clip                                                                        |
| ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| public/models/skins/kaykit/Skeleton_{Warrior,Mage,Minion}.glb + anim/Rig_Medium_*.glb | skeleton_knight / archer / soldier | 角色 GLB 无内嵌动画，clip 来自独立 Rig_Medium GLB | Idle, Walk, Run, HitReact, Death, Punch（由 General+MovementBasic 抽取重命名）             |
| public/models/monsters/Bat.glb                                                        | gargoyle                           | `Bat_`* 前缀                            | Attack, Attack2, Death, Flying(→Idle/Walk/Run 别名), Hit                             |
| public/models/ghost.glb                                                               | necromancer                        | 全小写                                   | Idle, Walk, Sprint(→Run 别名), Die(→Death 别名), Jump, Fall, Attack-melee-right 等 32 条 |
| ~~monsters/Skeleton.glb / monsters/Dragon.glb / knight.glb~~                          | 不再被敌人引用（可后续归档）                     | —                                     | —                                                                                  |


> **加载与归一化**：所有 GLB 都走 `loadModels()` 的 GLTF 主队列；加载完成后
> `normalizeEnemyClips()` 对 `monster_`* 和 `ghost` 模型做四步处理：
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


| 文件                                          | 可临时顶替                     |
| ------------------------------------------- | ------------------------- |
| public/models/_unused/pumpkin.glb           | 万圣节季节皮肤                   |
| public/models/_unused/zombie_chubby.gltf    | zombie 备选（胖僵尸）            |
| public/models/_unused/zombie_arm.gltf       | 远程/异变僵尸备选                 |
| public/models/_unused/enemy_2legs.gltf      | 远程机械敌                     |
| public/models/_unused/enemy_2legs_gun.gltf  | 同上                        |
| public/models/_unused/enemy_flying.gltf     | gargoyle 已改用 Bat.obj，此项可删 |
| public/models/_unused/enemy_flying_gun.gltf | 同上                        |
| public/models/_unused/enemy_large.gltf      | 精英 / 备 Boss               |
| public/models/_unused/zombie.glb            | 重复（建议删）                   |


---

## 3. Boss 模型（P0）【已完成】

第 1/2 关现为两套独立机甲 Boss（2026-06-14 反向设计：攻击逻辑 + 动画按模型现有 clip 重做）。


| 关卡    | Boss              | 逻辑脚本                                | 当前模型                               | 动画 clip                                                  | 状态             |
| ----- | ----------------- | ----------------------------------- | ---------------------------------- | -------------------------------------------------------- | -------------- |
| 第 1 关 | 游侠机甲（gunner_mech） | core/ai/bosses/gunnerMech.ts        | public/models/enemy_2legs_gun.gltf | Idle/Walk/Run/Jump/Shoot/Attack/Death（已接 AnimationMixer） | ✅ 风格贴合机甲设定 |
| 第 2 关 | 攻城机甲（siege_mech）  | core/ai/bosses/siegeMech.ts         | public/models/enemy_large_gun.gltf | 上述 + Attack.001（已接）                                      | ✅ 风格贴合机甲设定   |
| —     | Boss fallback     | THREE.BoxGeometry(2.4, 3.0, 2.4) 紫色 | —                                  | —                                                        | 程序化（模型缺失时）     |
| —     | 闲置候选              | public/models/_unused/boss.glb      | —                                  | —                                                        | 未引用，风格未知       |


> 渲染统一缩放到 **7m 高**（`TARGET_BOSS_HEIGHT`，`renderBoss`）。攻击 tag → clip 映射见 client `BOSS_ATTACK_CLIP`。
> 美术目标：两套差异化机甲（敏捷射手 / 重装炮手），或替换成原设定形象。

### 3.1 已知问题：Boss 寻路不灵活（待优化）

- **贪心直线追踪，无真正寻路**：`systems/bossAi.ts` 每帧朝玩家方向直走，撞到 `col_/wall`_ 即被 `tryMoveHorizontally` 挡住、不会绕路 → 玩家可躲到障碍物后"放风筝"。
- **物理脚印与视觉脱钩**：移动碰撞半径写死 `radius: 1.0`，与 7m 视觉体型不匹配 → 大模型可能半身穿墙；近战判定（`collisions` 2.0 / 各攻击 3.5~7.0）也未随体型放大，玩家会觉得"贴脸了却没被打到"。
- **可选优化**：① 放大物理半径贴合体型；② 放大近战/攻击判定范围改善手感；③ 加"被挡时沿墙切向滑动"的简单避障。

---

## 4. 武器模型

`core/source/data/weapons.ts` 定义 12 种武器。

> 注：旧的武器进化系统已被「羁绊系统」取代（见 `core/config.ts:390`、`core/systems/bonds.ts`），
> `WeaponInstance.evolved` 恒为 `false`，进化（金色）模型不再被渲染。
> 金色模型已全部归档到 `items/_unused/`，不再被渲染。
> shotgun 弹丸原先借用 `Dart_Golden`，现已改用自导出 `items/bullet.glb`（9mm 子弹）；`Dart_Golden.obj/.mtl` 仍留在 `items/` 但已无引用。
> **2026-06-14**：武器内部 ID `bow` 已彻底重命名为 `pistol`（手枪，core `types.ts`/`config.ts`/`weapons.ts`/`bonds` + i18n key 全部同步），其子弹也改用 `items/bullet.glb` 模型渲染（不再走 InstancedMesh 程序化弹丸）。
> **2026-06-14（VFX 贴图化）**：sword / flame_ring / ray_gun / poison_bomb 四把武器的程序化特效已全部替换为贴图驱动
> （`slash_fill.png` 填充扇形 / `flame_aura.png` 脚下贴花 / `light.png` 激光柱 / `smoke.png`+`scorch.png` 分层毒云），
> 闪电链也从程序化 TubeGeometry 折线改成 `lightning.png` 竖直面片（双层 glow/core + 镜像频闪）。
> 同时 `paralysis_gun` 弹丸从借用 `Dart` 改用 `items/bullet.glb`。
> 新增/启用的 VFX 贴图 key：`slash_fill` / `flame_aura` / `lightning`（vfx/）+ `twirl` / `flare`（复用 `textures/particle_*`）；
> 旧的 `slash` / `flame` 两个 key 已无引用（被 slash_fill / flame_aura 取代）。

### 4.0 12 把武器全量对照（行为 / 模型 / 特效 / 状态）


| #   | 武器 ID           | 行为 behavior         | 手持/弹幕模型                                                | 特效 / 程序化表现                                                | 模型状态                           | 特效状态                              |
| --- | --------------- | ------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ------------------------------ | --------------------------------- |
| 1   | sword（大剑）        | sweepArc（扇形横扫）      | items/greatsword.obj + .mtl（`swordModel`，手持）           | 剑气**填充扇形**（slash_fill.png 贴图，圆心=玩家 / 外缘=range / 170° / 顶点 alpha 羽化，与 sweepArc 判定一致） | ✅ 模型就位                         | ✅ 已贴图化（slash_fill.png）           |
| 2   | axe             | orbitingAxe（环绕飞斧）   | items/Axe_small.obj + .mtl（`axeModel`，弹丸克隆飞行）          | 模型旋转飞行（`axeObjects` index.ts:5010）                        | ✅ 模型就位                         | ⚪ 纯模型旋转（无独立特效贴图）                  |
| 3   | pistol（手枪）        | forwardArrow（直线穿透）  | floater=items/pistol.glb（`pistolModel`，自导出手枪，含嵌入贴图）；子弹=items/bullet.glb（`bulletModel`，9mm 子弹） | 子弹挂 bullet.glb 模型沿弹道飞行（朝行进方向）                            | ✅ 手枪 floater + 子弹弹丸           | ⚪ 程序化弹道（无特效贴图）                    |
| 4   | bone_bouncer    | bouncingShot（弹跳骨头）  | items/Bone.obj（**仅 geometry，无 MTL**）                   | 骨头几何体飞行 + fallback boneGeometry（index.ts:4269）            | ⚠️ 仅几何体，无材质                    | ⚪ 程序化（骨头几何体飞行，无特效贴图）              |
| 5   | shotgun         | spreadShot（散射弹丸）    | floater=items/shotgun_2.obj（`shotgunModel`，调色板贴图）；弹丸=items/bullet.glb（`dartGoldenModel`，自导出 9mm 子弹） | 多颗弹丸散射                                                    | ✅ 真枪 floater + 子弹弹丸           | ⚪ 程序化散射（无特效贴图）                    |
| 6   | lightning_staff | lightningChain（闪电链） | items/lightning_staff.glb（`lightningStaffModel`，floater 漂浮，自导出 GLB 含嵌入贴图） | 贴图竖直电弧面片（lightning.png，glow 蓝晕 + core 白芯 + 镜像频闪）+ 地面冲击环 + 闪光灯 + 火花粒子 | ✅ floater 模型                   | ✅ 已接闪电贴图（lightning.png，单帧；多帧序列为后续可选优化） |
| 7   | flame_ring      | flameAura（脚下火环）     | items/Ring3.obj+.mtl（`flameRingModel`，floater 漂浮）       | flame_aura.png 脚下贴花（按实际 aoeRadius 缩放，呼吸 + 缓慢自转）        | ✅ floater 模型                   | ✅ 已贴图化（flame_aura.png）           |
| 8   | ray_gun         | rayBeam（红色激光）       | items/ray_gun.glb（`rayGunModel`，floater 漂浮，Kenney blasterM） | 交叉 light.png 光柱辉光 + 白热核心盒 + 枪口 muzzle/flare 闪光（命中宽随 aoeRadius，见 RAY_BEAM_HIT_WIDTH_SCALE） | ✅ floater 模型                   | ✅ 已贴图化（light.png）                |
| 9   | poison_bomb     | poisonGas（毒气云 AoE）  | items/poison_bomb.glb（`poisonBombModel`，floater 漂浮，自导出含贴图） | smoke.png 地面毒液斑 + scorch.png 边界毒环 + 上升 smoke billboard + 粒子（整体按 radius 缩放） | ✅ floater 模型                   | ✅ 已贴图化（smoke + scorch）           |
| 10  | paralysis_gun   | paralysisShot（麻痹弹）  | floater=items/pistol_6.obj（`paralysisGunModel`，调色板贴图）；弹丸=items/bullet.glb（`bulletModel`，与 pistol 共用） | 黄色电弧（程序化）+ 头顶麻痹三角警示标 Canvas2D（index.ts:329-422）           | ✅ 手枪 floater + bullet.glb 弹丸 | ⚠️ 程序化黄电弧 + Canvas2D 警示，缺黄电弧贴图（P1） |
| 11  | void_ripple     | voidRipple（虚空波纹）    | items/Book4_Closed.obj+.mtl（`voidRippleModel`，floater 漂浮） | void_ripple.png 同心波纹环（PlaneGeometry，染青加色发光，按 radius 缩放）       | ✅ floater 模型                   | ✅ 已贴图化（void_ripple.png，多帧序列可选）   |
| 12  | scorch_boots    | scorchTrail（灼地脚印）   | items/scorch_boots.glb（`scorchBootsModel`，floater 漂浮，含嵌入贴图） | 焦土盘 CircleGeometry(1,24) + scorch_boots.png 放射贴花（按 radius 缩放） | ✅ floater 模型                   | ✅ 已贴图化（scorch_boots.png，多帧序列可选） |


> **一句话总结（2026-06-14 更新）**：12 把武器**全部有 floater 漂浮模型**，已无纯程序化武器。
> 物理 5 把（sword / axe / pistol=手枪 / bone_bouncer / shotgun=shotgun_2.obj）
> + 法术/能量/枪械/其它 7 把（lightning_staff=自导出 glb / flame_ring=Ring3 / poison_bomb=Potion9 / void_ripple=Book4 /
> ray_gun=Kenney blasterM / paralysis_gun=pistol_6.obj / scorch_boots=自导出 glb / poison_bomb=自导出 glb；其中 shotgun / pistol / paralysis_gun 弹丸均用 bullet.glb）。
> **特效也已全部贴图化**：sword(slash_fill) / lightning_staff(lightning) / flame_ring(flame_aura) / ray_gun(light) /
> poison_bomb(smoke+scorch) / void_ripple(void_ripple) / scorch_boots(scorch_boots)。
> 剩余美术项仅 paralysis_gun 黄电弧 + 「多帧序列 / 升级闪光」等可选精修（P1~P2）。

### 4.1 已就位（OBJ + MTL 或 GLB）


| 武器 ID        | 普通模型                  | 进化（金色）模型                                | 引用        |
| ------------ | --------------------- | --------------------------------------- | --------- |
| sword        | Sword.obj + Sword.mtl | _unused/Sword_Golden.obj/.mtl（已归档）      | —         |
| axe          | Axe_small.obj/.mtl    | _unused/Axe_Double_Golden.obj/.mtl（已归档） | —         |
| pistol（手枪）    | items/pistol.glb（floater）+ items/bullet.glb（子弹弹丸） | _unused/Bow_Golden.obj/.mtl（已归档）        | —         |
| bone_bouncer | Bone.obj（仅 geometry）  | —                                       | —         |
| shotgun / pistol（弹丸）  | bullet.glb（自导出 9mm 子弹；长轴 +X，加载后烘 -90° 偏航对齐 +Z 前向）  | —                                       | 两者共用作弹丸模型 |


### 4.2 模型已加载但**未挂任何武器**（备用资源）


| 模型                                 | 备注                              |
| ---------------------------------- | ------------------------------- |
| Sword_big.obj/.mtl                 | katana（备用，已加载）                  |
| Hammer_Double.obj/.mtl             | hammer（备用，已加载）                  |
| Dagger.obj/.mtl                    | dagger（备用，已加载）                  |
| Dart.obj/.mtl                      | dart（备用，已加载）                    |
| _unused/Sword_Golden.obj/.mtl      | 进化金色，已归档（武器进化系统已移除）             |
| _unused/Axe_Double_Golden.obj/.mtl | 进化金色，已归档（武器进化系统已移除）             |
| _unused/Bow_Golden.obj/.mtl        | 进化金色，已归档（武器进化系统已移除）             |
| _unused/Dagger_Golden.obj/.mtl     | 进化金色，已归档（武器进化系统已移除）             |
| _unused/Sword_big_Golden.obj/.mtl  | 进化金色，已归档（武器进化系统已移除）             |
| _unused/Bow_Wooden.obj/.mtl        | 未引用，已归档                         |
| _unused/Coin.obj/.mtl              | 未引用，已归档（§5 silver 拾取改造时需移回）     |
| _unused/Heart_Half.obj/.mtl        | 未引用，已归档（§5 health_small 改造时需移回） |


### 4.3 floater 模型已接，特效贴图化进度（多为可选精修）

> 这 7 把已挂 floater 漂浮模型（见 §4.0），不再缺手持/法器模型；特效也大多完成贴图化，下表只列「可选精修」需求。

| 武器 ID           | floater 模型              | 当前特效              | 仍缺特效        | 优先级 |
| --------------- | ----------------------- | ----------------- | ----------- | --- |
| lightning_staff | lightning_staff.glb（自导出，含嵌入贴图） | 贴图竖直电弧面片（lightning.png）+ 冲击环 + 粒子 | （可选）闪电多帧序列贴图 | P2  |
| flame_ring      | Ring3                   | ✅ flame_aura.png 脚下贴花（按 aoeRadius 缩放 + 呼吸/自转） | （可选）火焰多帧序列贴图 | P2  |
| poison_bomb     | poison_bomb.glb（自导出，含嵌入贴图） | ✅ smoke.png 地面斑 + scorch.png 毒环 + 上升 smoke billboard + 粒子 | （可选）专用毒云 sprite 序列 | P2  |
| void_ripple     | Book4_Closed            | ✅ void_ripple.png 同心波纹环（染青加色，按 radius 缩放） | （可选）虚空波纹多帧序列 | P2  |
| ray_gun         | ray_gun.glb（Kenney blasterM） | ✅ light.png 交叉光柱 + 白热核心 + muzzle/flare 闪光 | （可选）专用激光柱贴图 | P2  |
| paralysis_gun   | pistol_6.obj（调色板贴图）；弹丸 bullet.glb | 黄色电弧 + 头顶三角警示 | 黄色电弧贴图 | P1  |
| scorch_boots    | scorch_boots.glb（含嵌入贴图） | ✅ 焦土盘 + scorch_boots.png 放射灼地贴花 | （可选）灼地脚印多帧序列 | P2  |

### 4.4 仍纯程序化 / 缺模型

> 已无纯程序化武器——12 把全部接上了 floater 漂浮模型，且特效已基本全部贴图化
>（void_ripple / scorch_trail 也已接 void_ripple.png / scorch_boots.png）。
> 仅 paralysis_gun（黄电弧仍程序化）列为 P1 精修；其余多为「多帧序列」等可选精修（见 §4.3）。


---

## 5. 拾取物 / 经验球（P0）【已完成】

`PickupType` 共 7 种。`setupPickupMesh()` 已改成**按类型独立 InstancedMesh**（每种一个 mesh，
颜色仍走 `setColorAt()` 染色）。silver/health/health_small 已换上各自的专属 OBJ 模型（2026-06-14）。


| 类型           | 数值    | 当前模型                  | 状态                      |
| ------------ | ----- | --------------------- | ----------------------- |
| xp_green     | 1 xp  | **Crystal1.obj 染绿**   | ✅ 已接专属模型                |
| xp_blue      | 3 xp  | **Crystal2.obj 染蓝**   | ✅ 已接专属模型                |
| xp_purple    | 10 xp | **Crystal3.obj 染紫**   | ✅ 已接专属模型                |
| xp_orange    | 20 xp | **Crystal4.obj 染橙**   | ✅ 已接专属模型（Crystal5 备用未接） |
| silver       | 银币    | **Coin.obj 染银白**      | ✅ 已接专属模型                |
| health       | 大心    | **Heart.obj 染红**      | ✅ 已接专属模型                |
| health_small | 小心    | **Heart_Half.obj 染红** | ✅ 已接专属模型                |


> **改造已完成（7/7 全部接专属模型）**：`setupPickupMesh()` 现按 7 种类型各建一个 InstancedMesh，
> 颜色仍走 `setColorAt()` 染色。geometry 映射（`geomFor`）：
> xp_green→Crystal1 / xp_blue→Crystal2 / xp_purple→Crystal3 / xp_orange→Crystal4 /
> silver→Coin / health→Heart / health_small→Heart_Half。
> 全部 OBJ 在 `loadObjItems()` 里加载（Crystal1-5 / Coin / Heart / Heart_Half / Bone 共用 `loadAndNormalize`）。
> Coin / Heart_Half 已于 2026-06-14 从 `items/_unused/` 移回 `items/`（之前不在 items/，会 fallback 成八面体）。

### 其他拾取相关


| 项             | 当前                                          | 状态             |
| ------------- | ------------------------------------------- | -------------- |
| 金币粒子 goldMote | Canvas2D 程序化                                | 可保留，也可换 sprite |
| 宝箱            | Chest_Closed.obj/.mtl + Chest_Open.obj/.mtl | OK             |


---

## 6. 消耗品（P0 - 全 emoji 占位）

`core/data/consumables.ts` 10 种消耗品，**全部用 emoji 当图标和地面 mesh，没有 3D 模型也没有 UI 图标**。


| ID               | 名称  | 当前       | 缺                              |
| ---------------- | --- | -------- | ------------------------------ |
| wild_berry       | 野莓  | 🫐 emoji | 3D pickup mesh + 64×64 UI icon |
| hot_soup         | 热汤  | 🍲 emoji | 同上                             |
| mint_candy       | 薄荷糖 | 🍬 emoji | 同上                             |
| hard_bread       | 硬面包 | 🥖 emoji | 同上                             |
| energy_bar       | 能量棒 | 🍫 emoji | 同上                             |
| magnet           | 磁铁  | 🧲 emoji | 同上                             |
| iron_meal        | 铁甲餐 | 🍱 emoji | 同上                             |
| rage_potion      | 狂怒药 | 💢 emoji | 同上                             |
| prophecy_book    | 预言书 | 📖 emoji | 同上                             |
| craftsman_hammer | 工匠锤 | 🔨 emoji | 同上                             |


> 优先做 10 张 64×64 UI 图标（玩家直接可见），3D pickup 可后补。

---

## 7. 场景 / 关卡

### 7.1 当前真正在用的场景资源


| 用途       | 模型                            | 引用                                                             | 状态                      |
| -------- | ----------------------------- | -------------------------------------------------------------- | ----------------------- |
| 关卡白盒     | level_whitebox.glb + _col.glb | `tryLoadLevel()` index.ts:2072（默认关卡名 `whitebox` index.ts:1826） | 关卡几何体唯一来源               |
| 传送门 / 祭坛 | turret_teleporter.gltf        | 加载 index.ts:1684；摆放 `renderTeleporters()` index.ts:5334        | OK（缺模型时 fallback 蓝环+光柱） |


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


| 元素   | 当前                                 | 应有        |
| ---- | ---------------------------------- | --------- |
| 地面   | PlaneGeometry(400, 400) 纯色         | 街道材质贴图    |
| 霓虹地砖 | 13 块 PlaneGeometry(2.5, 2.5) 半透明色块 | 发光地砖贴图    |
| 关卡数  | 仅 1 张 whitebox                     | 3-5 张正式关卡 |


---

## 8. 程序化几何体清单（这些是"等替换的占位"）

以下都是 `index.ts` 用 Three.js 原始几何体硬画出来的、**仍在等美术替换**的占位。
每行直接跳转到代码位置即可对接美术；行号随重构会漂移，定位时以「函数名 / 占位几何」为准。

> **范围说明**：本表只列「还需替换的纯程序化占位」。
> 武器/AoE 特效（slash_fill / lightning / flame_aura / light / smoke+scorch / void_ripple / scorch_boots）
> 已贴图化，见 §4 与 §9；祭坛地面魔法阵（magic_circle.png）、宝箱模型（Prop_Chest gltf）已就位。
> 此外还有几处**仅模型加载失败时才显示的兜底几何**（拾取八面体 / 宝箱 BoxGeometry 拼装 / AoE 圆盘 default），
> 它们是防御性 fallback、平时不出现，故不计入"待替换"清单（代码须保留，不要删）。
>
> **通用投射物小球（`setupProjectileMesh`，`SphereGeometry(0.25)` InstancedMesh）也属于此类兜底**：
> 自 2026-06-14 起，敌人弹幕改走火焰 billboard（`enemy_bullet.png`）、Boss（机器人）弹改用 `items/bullet.glb`、
> 玩家投射物各有专属模型分支，因此该小球在正常对局中 **`count` 恒为 0、不产生 draw call、永不可见**。
> 它仅作为「未来新增武器/敌弹忘配视觉」时的防御性兜底而**刻意保留**——不要因为"看不到"就删掉。


| 行号               | 用途                  | 占位几何                                  | 想要的资产                | 优先级 |
| ---------------- | ------------------- | ------------------------------------- | -------------------- | --- |
| index.ts:3122    | 玩家脚下选中圆环            | RingGeometry(0.6, 0.75) 绿色            | 选中圆环 sprite 128px    | P2  |
| index.ts:5701    | 祭坛 fallback 圆环      | RingGeometry(1.5, 2.0)                | 祭坛圆环贴花               | P1  |
| index.ts:5716    | 祭坛光柱                | CylinderGeometry(0.3, 1.5, 4)         | 光柱 sprite            | P1  |
| index.ts:6385    | 宝箱光柱                | CylinderGeometry(0.45, 0.95, 2.8)     | 光柱 sprite            | P1  |
| index.ts:6558    | 神坛进度环               | RingGeometry(2.45, 2.65)              | 进度条贴花                | P1  |
| index.ts:6572    | 神坛悬浮水晶              | OctahedronGeometry(0.55)              | 水晶模型                 | P1  |
| index.ts:6585    | 神坛光柱                | CylinderGeometry(0.18, 0.5, 3.5)      | 光柱 sprite            | P1  |


---

## 9. 特效（VFX）贴图

### 9.1 已就位（19 个 VFX 贴图 key）

> `VFX_TEXTURE_FILES`（index.ts:118 起）共 19 个 key。其中 `slash` / `flame` 自 2026-06-14 VFX 贴图化后
> 已无引用（被 `slash_fill` / `flame_aura` 取代），保留备用。
> 最新加入 `enemy_bullet`（敌人弹幕火焰球，朝相机 billboard、火焰尾沿飞行方向反向拖尾、加色发光）。
> 此前加入 `void_ripple` / `scorch_boots` 两张（void_ripple 虚空环 / scorch_trail 灼地痕迹贴图化）。
>
> 注：`enemy_bullet` 仅用于**普通远程敌人**弹幕；Boss（机器人）弹幕走 `items/bullet.glb` 模型，不用此贴图。

| key          | 文件                            | 用途        |
| ------------ | ----------------------------- | --------- |
| spark        | textures/vfx/spark.png        | 通用粒子      |
| star         | textures/vfx/star.png         | 升级 / 经验闪光 |
| smoke        | textures/vfx/smoke.png        | 烟雾 / 毒气云地面斑 + 上升烟 |
| light        | textures/vfx/light.png        | 一般光晕 / ray_gun 激光柱辉光 |
| slash        | textures/vfx/slash.png        | 剑气 / 切击（已被 slash_fill 取代，备用） |
| muzzle       | textures/vfx/muzzle.png       | 通用命中光晕（`emitHitSparks`）/ 奥术爆发施法发射 + 命中爆闪 |
| magic_circle | textures/vfx/magic_circle.png | 祭坛 / 法阵   |
| portal_swirl | textures/vfx/portal_swirl.png | 传送门旋涡     |
| scorch       | textures/vfx/scorch.png       | 烧痕 / 毒气云边界环 / 灼地痕迹 |
| dirt         | textures/vfx/dirt.png         | 尘土        |
| flame        | textures/vfx/flame.png        | 火焰（已被 flame_aura 取代，备用） |
| lightning    | textures/vfx/lightning.png    | 闪电链 / 雷击竖直电弧（白电弧 + 透明底，加色发光） |
| slash_fill   | textures/vfx/slash_fill.png   | **NEW** 剑气填充扇形（sword sweepArc 贴图） |
| flame_aura   | textures/vfx/flame_aura.png   | **NEW** flame_ring 脚下火焰贴花 |
| twirl        | textures/particle_twirl.png   | 复用旧 particle 贴图（旋涡粒子） |
| flare        | textures/particle_flare.png   | 复用旧 particle 贴图（ray_gun 枪口耀斑） |
| void_ripple  | textures/vfx/void_ripple.png  | **NEW** void_ripple 虚空波纹环（染青加色发光） |
| scorch_boots | textures/vfx/scorch_boots.png | **NEW** scorch_trail 灼地放射贴花 |
| enemy_bullet | textures/vfx/enemy_bullet.png | **NEW** 普通远程敌人弹幕火焰球（朝相机 billboard，火焰尾拖尾，加色发光） |


### 9.2 已存在但未被引用（可删 / 可挂）

> 2026-06-14：`particle_twirl.png` / `particle_flare.png` 已被启用（key `twirl` / `flare`），从本清单移除。

```
public/textures/particle_circle.png
public/textures/particle_star.png
public/textures/texture_sign.png
```

### 9.3 程序化生成（Canvas 绘制 → 可替换为静态 PNG）


| 行号               | 内容             | 当前实现                         | 推荐美术                     |
| ---------------- | -------------- | ---------------------------- | ------------------------ |
| index.ts:329-422 | 麻痹三角警示标        | Canvas2D 红黄三角形               | paralysis_warn.png 64×64 |
| index.ts:535+    | 奥术光球（Bond VFX） | Canvas getArcaneOrbTexture() | arcane_orb.png 128×128   |
| index.ts:2946-80 | 金币粒子 mote      | Canvas2D 金币                  | gold_mote.png 64×64      |
| index.ts:6237    | 头顶"奥秘"数字       | Canvas2D 文字（动态）              | 保留 Canvas                |
| index.ts:7582+   | 飘字伤害数          | Canvas2D 文字（动态）              | 保留 Canvas                |


---

## 10. UI 资源

### 10.1 已就位

详见 `public/ui/` 下：button / characters / common / panel / quests / shop / title。

### 10.2 缺失（emoji 占位）


| 用途               | 当前                            | 应有        |
| ---------------- | ----------------------------- | --------- |
| 武器图标 12 张        | emoji（🗡🦴🪓🔫⚡🔥💥🔴☠⚠🌀🥾）  | 64×64 PNG |
| Tome（被动书）图标 12 张 | emoji（⚡❤🎒🍀🌹🛡📚🧲💀🎯💨👟） | 64×64 PNG |
| 消耗品图标 10 张       | emoji（见第 6 节）                 | 64×64 PNG |
| Stat 图标          | emoji（在 index.ts:560-587）     | 已用，可保留    |


> 已有：`/ui/weapons/sword.png`, `axe.png`, `bone_bouncer.png` —— 仅 3/12

---

## 11. 音效 / BGM（P0 - 完全缺失）

`grep -i "audio|sound|new Audio"` 在整个 `game/` 目录 **0 命中**。代码完全没有音频框架。


| 类别                    | 状态  | 建议数量        |
| --------------------- | --- | ----------- |
| 武器音效（命中/释放/进化）        | 缺   | 12 × 3 = 36 |
| UI 音效（点击/升级/购买/任务）    | 缺   | ~10         |
| 敌人音效（出现/受击/死亡）        | 缺   | ~15         |
| Boss 音效（嘶吼/技能/死亡）     | 缺   | ~5          |
| 角色音效（受伤/死亡/拾取）        | 缺   | ~8          |
| BGM（菜单/战斗/Boss/胜利/失败） | 缺   | 5           |
| 环境音                   | 缺   | 2-3         |


> 实施步骤：1）选音频库（建议 `howler.js` 或 `THREE.PositionalAudio`）；2）写个 `AudioManager`；3）至少 20 个核心音效先上。

---

## 12. 优先级排序（必补清单）

### P0 — 影响游戏识别度（本周必补）

1. **6 个敌人语义模型**（skeleton_soldier / skeleton_archer / skeleton_knight / necromancer / gargoyle）—— zombie 已 OK
2. **两套机甲 Boss 模型**（游侠机甲 / 攻城机甲；当前用带枪机械敌占位）+ **Boss 寻路优化**（见 §3.1）
3. ~~5 个新武器手持/弹幕模型~~ **已完成**：12 把武器全部接 floater 模型，弹幕用 bullet.glb
4. **武器 UI 图标 12 张**（替代 emoji）
5. **消耗品 UI 图标 10 张**（替代 emoji）
6. **音频系统 + 至少 20 个核心音效**
7. **拾取物按类型替换 OBJ**（xp 4 阶 + silver/heart/heart_small）

### P1 — 提升精致度

1. ~~武器特效贴图化~~ **已完成**：sword / lightning_staff / flame_ring / ray_gun / poison_bomb 均已贴图化；仅余 void_ripple / paralysis_gun / scorch_boots 的专用 sprite + 各特效「多帧序列」为可选精修
2. **Tome 12 个 UI 图标**
3. 2-3 张额外正式关卡（替代单一 whitebox）
4. **BGM 至少 3 首**（菜单/战斗/Boss）
5. 神坛 / 祭坛 圆环替换为带美术的贴花（Boss 攻击预警圆环已移除）
6. 宝箱光柱 / 神坛光柱 sprite

### P2 — 细节

1. 把 Canvas 程序化贴图导出为静态 PNG（paralysis_warn / arcane_orb / gold_mote）
2. 接入或删除 particle_circle / particle_star 等剩余备用粒子（particle_flare / particle_twirl 已启用）
3. 地面材质贴图（替代纯色 PlaneGeometry）
4. 玩家选中圆环 sprite（进化武器金色光环已随武器进化系统移除，相关程序化几何与字段已从代码删除）

---

## 13. 文件路径速查


| 资产文件夹                        | 用途                                                                 |
| ---------------------------- | ------------------------------------------------------------------ |
| public/models/               | 角色 / 敌人 / 场景 GLTF/GLB（当前 26 个在用，含 ghost.glb）                       |
| public/models/_unused/       | 已归档：33 个未引用模型 / FBX 重复 / 旧版替换件                                     |
| public/models/monsters/      | GLB 怪物（Quaternius Monster Pack 带动画版，skeleton_soldier / gargoyle 用） |
| public/models/items/         | 武器 / 拾取物 OBJ/MTL + 自导出 GLB（含 bullet.glb / pistol.glb / lightning_staff.glb / poison_bomb.glb / scorch_boots.glb）   |
| public/models/items/_unused/ | 已归档：3 套未引用 OBJ + MTL（Bow_Wooden / Coin / Heart_Half）               |
| public/models/levels/        | 关卡白盒 GLB                                                           |
| public/textures/vfx/         | VFX 贴图（含 slash_fill / flame_aura / lightning / void_ripple / scorch_boots 等，共 16 张） |
| public/textures/             | particle 贴图：particle_flare / particle_twirl 已启用，circle/star 仍未引用    |
| public/ui/                   | UI 图片资源                                                            |



| 代码定义位置                                            | 内容         |
| ------------------------------------------------- | ---------- |
| game/core/data/weapons.ts                         | 12 种武器定义   |
| game/core/data/enemies.ts                         | 6 种敌人定义    |
| game/core/data/consumables.ts                     | 10 种消耗品定义  |
| game/client/source/index.ts:1259 loadModels()     | 模型加载列表     |
| game/client/source/index.ts:1683 loadObjItems()   | OBJ 物品加载列表 |
| game/client/source/index.ts:115 VFX_TEXTURE_FILES | VFX 贴图配置   |
| game/client/source/index.ts:2861 enemyModelMap    | 敌人 → 模型映射  |


