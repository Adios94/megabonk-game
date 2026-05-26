# MegaBonk Three.js — 美术资源

## 模型来源

**Quaternius Cyberpunk Game Kit**（免费CC0授权）

所有模型存放在 `public/models/` 目录，GLTF格式（嵌入式base64纹理）。

## 模型清单

### 角色模型

| 文件 | 用途 | 包含动画 |
|------|------|---------|
| Character_Male.gltf | 玩家角色 | Idle, Walk, Run, Attack, Jump, Death |
| Character_Female.gltf | 备用角色 | 同上 |

### 敌人模型

| 文件 | 用途 | 包含动画 |
|------|------|---------|
| Skeleton.gltf | 骷髅步兵 | Idle, Walk, Attack, Death |
| Ghost.gltf | 幽灵 | Float, Attack, Death |
| Bat.gltf | 蝙蝠 | Fly, Attack, Death |
| Zombie.gltf | 僵尸 | Walk, Attack, Death |
| Skeleton_Archer.gltf | 骷髅弓手 | Idle, Shoot, Death |
| Knight.gltf | 骷髅骑士(精英) | Idle, Charge, Attack, Death |
| Necromancer.gltf | 死灵法师(精英) | Idle, Cast, Death |
| Gargoyle.gltf | 石像鬼(精英) | Fly, Dive, Death |
| Boss_Anubis.gltf | Boss阿努比斯 | Idle, Slash, Slam, Cast, Enrage, Death |

### 环境模型

| 文件 | 用途 |
|------|------|
| Platform_*.gltf | 地形平台（多种变体） |
| Ramp_*.gltf | 连接斜坡 |
| Tree_Dead_*.gltf | 枯树装饰 |
| Rock_*.gltf | 岩石装饰 |
| Pillar_*.gltf | 石柱装饰 |
| Portal.gltf | 传送门 |

### 道具模型

| 文件 | 用途 |
|------|------|
| Chest.gltf | 宝箱 |
| Gem_*.gltf | 经验宝石（4色） |

## 纹理资源

存放在 `public/textures/`：

| 文件 | 用途 |
|------|------|
| particle_glow.png | 粒子特效基础纹理 |
| spark.png | 火花粒子 |

## 模型使用规范

### 加载方式

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
loader.load('models/Character_Male.gltf', (gltf) => {
  const model = gltf.scene;
  model.name = 'player';
  // 保留原始GLTF材质，不替换
  scene.add(model);
});
```

### 克隆带骨骼模型

```typescript
// 错误：普通clone会破坏骨骼绑定
// const clone = model.clone(); // ❌

// 正确：使用SkeletonUtils
const clone = cloneSkeleton(model); // ✅
clone.name = `enemy_${id}`;
```

### 动画播放

```typescript
const mixer = new THREE.AnimationMixer(clone);
const clip = THREE.AnimationClip.findByName(gltf.animations, 'Walk');
const action = mixer.clipAction(clip);
action.play();

// 每帧更新
mixer.update(deltaTime);
```

### 模型缩放

模型加载后根据包围盒自动计算缩放：
```typescript
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
const targetHeight = 1.8; // 目标高度(单位)
model.scale.multiplyScalar(targetHeight / maxDim);
```

## 美术风格

- **低多边形**：Quaternius风格，面数少但轮廓清晰
- **赛博朋克色调**：霓虹色（紫/青/粉）点缀暗色场景
- **无实时阴影**：保持移动端性能
- **发光粒子**：AdditiveBlending营造科幻氛围
- **材质保留**：使用GLTF自带材质，不做运行时替换
