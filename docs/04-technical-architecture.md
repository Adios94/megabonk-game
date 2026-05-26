# MegaBonk Three.js — 技术架构

## 架构模式

**GameInstance + GameScene** 双层分离：
- `GameInstance`（纯逻辑）：不依赖任何渲染库，60fps tick循环
- `GameScene`（渲染层）：Three.js 场景管理，读取 GameState 快照渲染

通过 `LocalGameSession` 桥接，使用 `setInterval` 驱动逻辑层，`requestAnimationFrame` 驱动渲染层。

## 核心规则

1. `import * as THREE from 'three'`（命名空间导入）
2. `game/core/` 绝对不能导入 Three.js
3. 所有 Three.js 对象必须设置 `.name` 属性
4. 不修改 `packages/` 目录
5. 导入使用 `.ts` 扩展名
6. Three.js 在 vite build 时作为 external

## 模块职责

```
GameInstance.ts (2857行)
├── tick() — 17步游戏循环
├── processPlayerMovement() — 跳跃/滑铲/兔子跳/加速曲线
├── updateEnemiesAI() — 8种AI行为（分4帧更新决策）
├── fireWeapons() — 13种武器开火
├── processCollisions() — SpatialHash碰撞检测
├── processDeaths() — 死亡处理+掉落
├── spawnEnemies() — 波次生成+Final Swarm
├── updateBossAI() — 3阶段Boss
├── checkWeaponEvolutions() — 武器进化判定
└── updateTeleporters() — 传送门激活

weapons.ts (613行)
├── fireWeapon() — 各武器投射物创建
├── updateOrbitingProjectile() — 飞斧环绕
├── updateSpinningProjectile() — 龙卷风旋转
└── applyGravitationalPull() — 黑洞引力

index.ts [客户端] (3567行)
├── LocalGameSession — 驱动逻辑层
├── GameScene — Three.js场景
│   ├── 模型加载（GLTFLoader + SkeletonUtils.clone）
│   ├── 骨骼动画（AnimationMixer per entity）
│   ├── VFX粒子系统（自定义ShaderMaterial，500粒子池）
│   ├── HUD（DOM overlay）
│   ├── 升级面板/商店/任务UI
│   └── 相机系统（固定角度+屏震+动态FOV）
└── 启动流程（loadModels → showMainMenu → startGame）
```

## 输入系统

```
PlatformInput (mode: 'joystick')
├── 移动端: VirtualJoystick (左侧) + TouchButtons (右侧3按钮)
└── 桌面端: WASD + Space + Shift (DesktopInput)

映射:
  moveX/moveY → 世界方向移动（已应用deadzone 0.15）
  action1 (⬆️/Space) → 跳跃
  action2 (⬇️/Shift) → 滑铲
  action3 (🔥) → 技能
```

## 渲染策略

| 实体 | 渲染方式 | 原因 |
|------|---------|------|
| 玩家 | 直接使用GLTF scene | 单个实例，需要骨骼动画 |
| 敌人 | 克隆GLTF scene（SkeletonUtils） | 每个实例独立动画Mixer |
| 投射物 | InstancedMesh (SphereGeometry) | 数量多(200)，无需骨骼 |
| 拾取物 | InstancedMesh (OctahedronGeometry) | 数量多(300)，简单形状 |
| Boss | 克隆GLTF scene | 单个实例，需要动画 |
| 平台/装饰 | 克隆GLTF scene | 静态不动 |
| 粒子VFX | THREE.Points + ShaderMaterial | 500粒子池，GPU渲染 |

## 性能措施

- SpatialHash 碰撞（避免O(n²)）
- 敌人AI决策分4帧轮流更新
- 对象池（敌人克隆体回收复用）
- 粒子预分配（零运行时new）
- InstancedMesh 批量渲染投射物/拾取物
- 动态FOV代替缩放（无需重建投影矩阵每帧）
- frustumCulled = false（手动管理可见性）

## 存档结构

```typescript
interface SaveData {
  version: number;
  silver: number;
  shopLevels: Record<string, number>;
  questsCompleted: string[];
  weaponsUnlocked: string[];
  charactersUnlocked: string[];
  extraWeaponSlots: number;
  stats: { totalKills, totalRuns, bestSurvivalTime, highestLevel, bossesDefeated };
}
```
