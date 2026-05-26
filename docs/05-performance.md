# MegaBonk Three.js — 性能优化策略

## 渲染优化

### InstancedMesh 批量渲染

投射物和拾取物使用 `THREE.InstancedMesh`，避免大量 draw call：
- 投射物池：200个实例，SphereGeometry
- 拾取物池：300个实例，OctahedronGeometry
- 通过 `setMatrixAt()` 更新位置，`setColorAt()` 更新颜色

### 粒子系统

自定义 ShaderMaterial + THREE.Points：
- 预分配500粒子池，零运行时内存分配
- GPU端计算粒子大小：`gl_PointSize = aSize * (400.0 / -mvPosition.z)`
- AdditiveBlending 实现发光效果
- 粒子回收复用，无需创建/销毁

### 敌人渲染

- 使用 SkeletonUtils.clone() 克隆带骨骼的模型
- 对象池回收已死亡敌人的克隆体
- 每个敌人独立 AnimationMixer（支持独立动画状态）
- frustumCulled = false，手动管理可见性

## 逻辑优化

### SpatialHash 碰撞检测

替代 O(n²) 暴力检测：
- 网格大小：3个单位
- 每帧只检测相邻格子内的实体对
- 投射物 vs 敌人、玩家 vs 敌人、玩家 vs 拾取物

### 敌人AI分帧更新

8种敌人AI决策不在同一帧全部更新：
- 每帧只更新 1/4 的敌人决策
- 位置移动仍然每帧执行（保持流畅）
- 决策频率：15fps（60fps / 4）

### Tick循环独立

- 逻辑层：`setInterval` 60fps 固定步长
- 渲染层：`requestAnimationFrame` 自适应帧率
- 两层解耦，渲染可降帧不影响逻辑

## 内存优化

### 对象池

| 对象 | 池大小 | 策略 |
|------|--------|------|
| 敌人克隆体 | 80 | 死亡后回收，重生时复用 |
| 投射物矩阵 | 200 | InstancedMesh固定分配 |
| 拾取物矩阵 | 300 | InstancedMesh固定分配 |
| VFX粒子 | 500 | 预分配Buffer，索引循环 |

### 零运行时分配

- 所有临时 Vector3/Matrix4 预创建为模块级变量
- 粒子属性（位置/颜色/大小/生命）预分配 Float32Array
- 避免在热路径中使用 `new`

## 移动端适配

### 高DPI处理

通过 `@minigame/render-adapter` 的 `installThreeHighDpi`：
- 自动检测设备像素比
- 限制最大像素比为2（避免过度渲染）
- Canvas尺寸自适应

### 触控输入

- 虚拟摇杆：左侧区域，deadzone 0.15
- 触控按钮：右侧3个按钮（跳跃/滑铲/技能）
- 60fps输入采样

## 性能指标目标

| 平台 | 目标帧率 | 最大敌人数 | 最大粒子数 |
|------|---------|-----------|-----------|
| 桌面端 | 60fps | 100 | 500 |
| 移动端(中端) | 30-60fps | 80 | 300 |
| Final Swarm | 30fps+ | 150 | 500 |
