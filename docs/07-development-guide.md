# MegaBonk Three.js — 开发指南

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
# 浏览器打开 http://localhost:1513
```

## 开发规范

### 必须遵守

1. **Three.js 命名空间导入**：`import * as THREE from 'three'`
2. **game/core/ 禁止导入 Three.js**：纯逻辑层不依赖渲染
3. **所有 Three.js 对象必须设置 `.name`**：方便调试
4. **不修改 packages/ 目录**：模板基础设施保持不动
5. **导入路径使用 .ts 扩展名**：`import { foo } from './bar.ts'`
6. **Three.js 构建时作为 external**：生产环境需要 CDN importmap

### 架构约束

```
game/core/source/    → 纯逻辑，可单独测试，不含任何 THREE 引用
game/client/source/  → 渲染+UI，依赖 Three.js，读取 GameState 做视觉呈现
packages/            → 只读，不修改
```

### 模型使用

- 加载：GLTFLoader
- 克隆带骨骼模型：必须用 `SkeletonUtils.clone()`，不能用 `.clone()`
- 保留原始 GLTF 材质，不做运行时替换
- 加载后根据包围盒计算缩放比

## 目录结构

```
game/
├── core/source/
│   ├── GameInstance.ts    # 核心游戏循环
│   ├── config.ts          # 数值配置（武器/敌人/角色）
│   ├── types.ts           # TypeScript 类型定义
│   ├── weapons.ts         # 武器开火逻辑
│   ├── upgrades.ts        # 升级选项生成
│   ├── quests.ts          # 任务系统
│   ├── shop.ts            # 永久商店
│   ├── save.ts            # 存档管理
│   ├── physics.ts         # 物理/移动
│   └── spatial-hash.ts    # 碰撞优化
└── client/source/
    ├── index.ts           # 场景/渲染/UI/输入
    └── session/
        └── EventEmitter.ts
```

## 构建与部署

### 开发模式
```bash
pnpm run dev
```

### 生产构建
```bash
pnpm run build
```

生产环境需要在 index.html 中添加 importmap（因为 Three.js 是 external）：
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

## 调试技巧

### 查看游戏状态
打开浏览器控制台，`LocalGameSession` 实例挂在 window 上：
```javascript
// 查看当前游戏状态
window.__session.gameInstance.getState()
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 模型显示为白色 | 材质被覆盖 | 保留GLTF原始材质 |
| 模型极小看不见 | 模型原始尺寸问题 | 用包围盒计算缩放 |
| 克隆模型动画错乱 | 用了.clone() | 改用SkeletonUtils.clone() |
| WASD方向反 | 相机朝向问题 | 翻转moveX和moveY |
| 粒子看不到 | 尺寸太小 | 调大shader中的乘数 |
| 敌人卡顿 | AI每帧全量更新 | 分4帧轮流更新决策 |

## 文档索引

| 文件 | 内容 |
|------|------|
| [00-project-overview.md](./docs/00-project-overview.md) | 项目总览、技术栈、目录结构 |
| [01-core-gameplay.md](./docs/01-core-gameplay.md) | 核心玩法、操作、节奏设计 |
| [02-combat-system.md](./docs/02-combat-system.md) | 武器、典籍、敌人、Boss |
| [03-progression-system.md](./docs/03-progression-system.md) | 升级、任务、商店、存档 |
| [04-technical-architecture.md](./docs/04-technical-architecture.md) | 架构模式、模块职责 |
| [05-performance.md](./docs/05-performance.md) | 性能优化策略 |
| [06-art-resources.md](./docs/06-art-resources.md) | 美术资源清单与规范 |
