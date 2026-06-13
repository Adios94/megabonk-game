# MegaBonk Three.js — 美术资源

> 本文档基于 `public/models/`、`public/textures/` 实际目录与 `client/source/index.ts` 的加载代码整理。

---

## 一、资源风格说明

仓库混用了两套美术风格的免费资源：

- **赛博朋克场景 / 敌人**：Quaternius Cyberpunk Game Kit 风格（gltf / glb）。`zombie` 用 `zombie_basic`，Boss 用 `enemy_large_gun`；其余敌人已换 Quaternius Animated Monster Pack 专属模型（`zombie_chubby` / `zombie_arm` 已归档）。
- **玩家角色**：3 个独立 GLTF（`player_george / player_stan / player_leela`，分别对应 `megachad / roberto / skateboard_skeleton`），与赛博朋克套件不同风格。
- **中世纪武器与拾取物**：Quaternius 经典武器套件（OBJ + MTL，金色变体用于进化态显示）。

> 仓库 `public/models/` 里还存放了一批未启用的备选资源（`skeleton.glb`、`ghost.glb`、`pumpkin.glb`、cyberpunk 风格的其他敌人 `enemy_2legs / enemy_flying / enemy_large` 等）。**这些不在 `loadModels()` 加载列表里**，可以删除或保留作为美术备选。

---

## 二、当前实际加载的模型清单

`client/source/index.ts:387 loadModels()` 与紧随其后的物品加载块。

### 1. 角色与敌人（GLTF / GLB，带骨骼动画）

| 名称 | 文件 | 用途 |
|---|---|---|
| `player_george` / `player_stan` / `player_leela` | `models/player_*.gltf` | 三个玩家角色（megachad / roberto / skateboard_skeleton），按 `CHARACTER_MODELS` 映射加载 |
| `zombie_basic` | `models/zombie_basic.gltf` | 渲染 `zombie`（高 HP 慢速僵尸，靠 enemyScales 放大） |
| `boss` | `models/enemy_large_gun.gltf` | Boss（命名为 boss，模型文件实际是大型敌人） |

> ℹ️ `zombie_chubby.gltf` / `zombie_arm.gltf` 已不再被任何敌人引用，已归档到 `public/models/_unused/`。
>
> 当前敌人 → 模型映射（见 `client/source/index.ts` 的 `enemyModelMap`，已全部接上语义贴合的专属模型）：
>
> | 逻辑 type | 实际模型 |
> |---|---|
> | `skeleton_soldier` | monster_skeleton（Skeleton.glb） |
> | `zombie` | zombie_basic |
> | `skeleton_archer` | monster_dragon（Dragon.glb） |
> | `skeleton_knight` | monster_knight（knight.glb，专属骷髅，放大） |
> | `necromancer` | ghost（ghost.glb） |
> | `gargoyle` | monster_bat（Bat.glb） |

### 2. 装饰 / 平台 / 环境（GLTF）

| 名称 | 文件 | 用途 |
|---|---|---|
| `platform` | `platform_4x1.gltf` | 默认地块 |
| `platform_4x4` | `platform_4x4_full.gltf` | 大地块 |
| `platform_4x2` | `platform_4x2.gltf` | 中地块 |
| `platform_2x2` | `platform_2x2.gltf` | 小地块 |
| `platform_1x1` | `platform_1x1.gltf` | 最小地块 |
| `support` | `support.gltf` | 平台支柱（短） |
| `support_long` | `support_long.gltf` | 平台支柱（长） |
| `rail_long` | `rail_long.gltf` | 围栏 |
| `fence_platform` | `fence_platform.gltf` | 平台边缘围栏 |
| `light_street` | `light_street_1.gltf` | 路灯 |
| `sign_1` | `sign_1.gltf` | 招牌 1 |
| `sign_2` | `sign_2.gltf` | 招牌 2 |
| `ac_unit` | `ac_unit.gltf` | 空调外机 |
| `pipe_1` | `pipe_1.gltf` | 管道 |
| `door` | `door.gltf` | 门 |
| `tombstone` | `tombstone.glb` | 墓碑 |
| `tree` | `tree.glb` | 枯树 |

### 3. 功能性物件

| 名称 | 文件 | 用途 |
|---|---|---|
| `teleporter` | `turret_teleporter.gltf` | 传送门（Tier 2/3） |
| `pickup` | `collectible_gear.gltf` | 通用拾取物（默认） |

### 4. 拾取物几何体（OBJ，无材质，几何体复用）

`client/source/index.ts:509`，仅取几何体、材质用 `MeshToonMaterial` 上色。

| 文件 | 用途 |
|---|---|
| `items/Crystal1.obj` | 经验宝石 — 绿色 (xp_green) |
| `items/Crystal2.obj` | 经验宝石 — 蓝色 (xp_blue) |
| `items/Crystal3.obj` | 经验宝石 — 紫色 (xp_purple) |
| `items/Crystal4.obj` | 经验宝石 — 橙色 (xp_orange) |
| `items/Crystal5.obj` | 备用宝石形状 |
| `items/Heart.obj` | 大血包 (`health` pickup) |
| `items/Bone.obj` | 骨头投射物（bone_bouncer） |
| `items/Coin.obj` | 银币拾取（pickup） |

### 5. 武器实例模型（OBJ + MTL，带原色材质）

`client/source/index.ts:580` 以下，每帧复用 clone。金色变体用于进化态。

| 名称 | 普通文件 | 金色（进化）文件 | 对应武器 |
|---|---|---|---|
| Axe | `items/Axe_small.obj` | `items/Axe_Double_Golden.obj` | `axe` |
| Sword | `items/Sword.obj` | `items/Sword_Golden.obj` | `sword` |
| Katana | `items/Sword_big.obj` | `items/Sword_big_Golden.obj` | （未使用，预留） |
| Bow | `items/Revolver.glb` | `items/Bow_Golden.obj` | `bow`（i18n 显示「左轮手枪」） |
| Dagger | `items/Dagger.obj` | `items/Dagger_Golden.obj` | （未使用，预留） |
| Hammer | `items/Hammer_Double.obj` | — | （未使用，预留） |
| Dart | `items/Dart.obj` | `items/Dart_Golden.obj` | `shotgun` 弹丸（金色版） |

> 闪电法杖 / 烈焰环 / 弹射骨头不使用专属武器模型——闪电是即时 VFX、烈焰环是 disk mesh、骨弹复用 `Bone.obj` 几何。

### 6. 宝箱

| 文件 | 用途 |
|---|---|
| `items/Chest_Closed.obj` + `.mtl` | 关闭状态 |
| `items/Chest_Open.obj` + `.mtl` | 打开状态（开箱后切换） |

---

## 三、纹理资源

### 1. `public/textures/`（基础粒子）

> Phase 8 起：主粒子贴图从 `particle_circle.png` 切换到 `vfx/spark.png`，
> 老 PNG 暂保留作为兼容。

| 文件 | 用途 | 是否在用 |
|---|---|---|
| `particle_circle.png` | 旧主粒子贴图 | 已退役，保留作 fallback |
| `particle_flare.png` | 备选粒子（光晕） | 备选 |
| `particle_star.png` | 备选粒子（星形） | 备选 |
| `particle_twirl.png` | 备选粒子（旋涡） | 备选 |
| `texture_sign.png` | 招牌贴图（部分 sign 模型外置贴图） | 跟随 GLTF |

### 2. `public/textures/vfx/`（Billboard VFX 贴图）

来源：[Kenney Particle Pack](https://kenney.nl/assets/particle-pack)（CC0，可商用，无需署名）。
精选 11 张接入到 `BillboardVfx` 系统（见 `client/source/index.ts` 的
`VFX_TEXTURE_FILES` 表 + `spawnBillboard()`）。

| 文件 | 用途 | 触发点 |
|---|---|---|
| `spark.png` | 通用粒子（主贴图） | 所有点云粒子（替换 `particle_circle.png`） |
| `muzzle.png` | 击中光晕 / 枪口火光 | 击中怪物、bow/shotgun 开火 |
| `slash.png` | 剑气贴图 | 剑攻击 swing（地面贴花，朝向 swing 方向） |
| `smoke.png` | 死亡烟雾 | 怪物死亡 |
| `scorch.png` | 死亡烧痕（地面贴花） | 怪物死亡，持续 1.5s |
| `star.png` | 星光 | 升级 burst、拾取 sparkle |
| `light.png` | 光环 | 升级 burst |
| `magic_circle.png` | 旋转魔法圆 | 祭坛 ready / summoning 阶段地面 decal |
| `portal_swirl.png` | 紫色漩涡 | Boss 死亡后传送门（portal_ready） |
| `dirt.png` | 尘土（预留） | 落地踢起灰尘等场景，待接入 |
| `flame.png` | 火焰（预留） | flame_ring 武器升级特效，待接入 |

新增 VFX 贴图的接入流程：

```
1. PNG 丢到 public/textures/vfx/<key>.png（透明背景）
2. client/source/index.ts:
   - VfxTextureKey union 加新 key
   - VFX_TEXTURE_FILES 表加映射
3. 在合适触发点调 this.spawnBillboard({ texture: '<key>', ... })
```

---

## 四、模型加载与使用规范

### 1. 加载方式

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

// GLTF（带骨骼）
const gltf = await new GLTFLoader().loadAsync('/models/player_george.gltf');
const model = gltf.scene;
model.name = 'player';

// OBJ + MTL（无骨骼，带原色材质）
const mtlLoader = new MTLLoader();
const mtl = await mtlLoader.loadAsync('/models/items/Sword.mtl');
mtl.preload();
const objLoader = new OBJLoader();
objLoader.setMaterials(mtl);
const sword = await objLoader.loadAsync('/models/items/Sword.obj');
```

### 2. 克隆带骨骼模型

```ts
// ❌ 错误：会破坏骨骼绑定，动画错乱
const wrong = model.clone();

// ✅ 正确
const correct = cloneSkeleton(model);
correct.name = `enemy_${id}`;
```

### 3. 模型缩放

加载后用包围盒计算实际高度并缩放到目标尺寸：

```ts
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
const targetHeight = 1.8;
model.scale.multiplyScalar(targetHeight / maxDim);
```

### 4. 动画播放

```ts
const mixer = new THREE.AnimationMixer(clone);
const clip = THREE.AnimationClip.findByName(gltf.animations, 'Walk');
mixer.clipAction(clip).play();

// 每帧
mixer.update(dt);
```

### 5. 材质规范

- GLTF 自带材质 **不做运行时替换**
- OBJ 武器材质先用 MTL 加载，然后通过 `convertToToonMaterials()` 转换为 `MeshToonMaterial`（卡通分级渐变）
- 金色变体（进化武器显示）走 `brightenWeaponMaterials()`，提亮 Kd 让其在 toon ramp 下不发黑

---

## 五、未启用的备选资源（可清理或留作扩展）

`public/models/` 下存在但 `loadModels()` 没有引用的文件：

```
ac_stacked.gltf      antenna_1.gltf       computer.gltf
enemy_2legs.gltf     enemy_2legs_gun.gltf
enemy_flying.gltf    enemy_flying_gun.gltf
enemy_large.gltf
fence_cyber.fbx      fence.glb
ghost.glb            pumpkin.glb          skeleton.glb        zombie.glb
light_square.gltf    light_street_2.gltf  light_street.fbx
lootbox.gltf
pickup_health.gltf   pickup_heart.gltf
pipe_2.gltf
player.glb           player_george.gltf   player_leela.gltf   player_stan.gltf
rail_corner.gltf     rail_long.fbx        rail_short.gltf
sign_1.fbx           sign_3.gltf          sign_corner_1.gltf
turret_cannon.gltf
tv_1.gltf
```

如果未来要换风格（例如把僵尸换回骷髅），优先考虑替换 `loadModels()` 里的路径，再决定是否清理这批文件。**当前直接删除前请运行 `pnpm build`**，确认没有别的代码路径在引用。

---

## 六、美术目标

- **低多边形 + Toon 着色**：所有材质走 `MeshToonMaterial` + 3 阶 toon gradient，不写实时阴影，性能优先。
- **无后处理**：不开 SSAO/Bloom，节省移动端 GPU。
- **AdditiveBlending 粒子**：营造科幻氛围（暴击 / Boss / 升级时金色爆发）。
- **混搭可读**：当前赛博朋克场景 + 中世纪武器是模板留下的混搭，不刻意统一——便于在不同主题中替换素材。
