# MegaBonk Three.js — 项目总览

## 项目概述

基于 Quaternius Cyberpunk Game Kit 美术资源，使用 Three.js 构建的 3D Roguelike Survivor 游戏。灵感来源于 MegaBonk，移动端优先。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 渲染引擎 | Three.js 0.170 | 3D渲染，GLTF模型+骨骼动画 |
| 构建工具 | Vite 7.3 | 开发服务器+打包 |
| 开发语言 | TypeScript 5.7 (strict) | 类型安全 |
| 模型格式 | GLTF (嵌入式base64) | 含骨骼动画 |
| 输入系统 | @minigame/platform | 虚拟摇杆+触控按钮 |
| 显示适配 | @minigame/render-adapter | 高DPI自适应 |
| 国际化 | @minigame/i18n | 中英文双语 |
| 包管理 | pnpm workspace | monorepo结构 |

## 项目结构

```
megabonk-game/
├── game/
│   ├── core/source/           # 纯游戏逻辑（不依赖Three.js）
│   │   ├── GameInstance.ts        # 核心循环（2857行）
│   │   ├── config.ts              # 数值配置
│   │   ├── types.ts               # 类型定义
│   │   ├── weapons.ts             # 13种武器开火逻辑
│   │   ├── upgrades.ts            # 升级选项生成
│   │   ├── quests.ts              # 30个任务系统
│   │   ├── shop.ts                # 永久商店
│   │   ├── save.ts                # localStorage存档
│   │   ├── physics.ts             # 移动物理
│   │   └── spatial-hash.ts        # 碰撞优化
│   └── client/source/         # Three.js 渲染+UI
│       ├── index.ts               # 场景/渲染/HUD/菜单（3567行）
│       └── session/EventEmitter.ts
├── packages/                  # 模板基础设施（不修改）
│   ├── platform/                  # 输入抽象
│   ├── render-adapter/            # 显示适配
│   └── i18n/                      # 国际化
├── public/models/             # GLTF模型资源（Quaternius Cyberpunk Kit）
├── public/textures/           # 粒子纹理
├── i18n/                      # 中英文文本
├── docs/                      # 策划文档（本目录）
└── index.html                 # 入口页面
```

## 代码量

| 模块 | 行数 |
|------|------|
| 核心逻辑 (game/core) | ~4700行 |
| 客户端渲染 (game/client) | ~3600行 |
| 总计（不含packages） | ~8300行 |

## 运行方式

```bash
pnpm install
pnpm run dev
# 浏览器打开 http://localhost:1513
```

## 操作方式

| 平台 | 移动 | 跳跃 | 滑铲 | 技能 |
|------|------|------|------|------|
| 桌面 | WASD | Space | Shift | 自动 |
| 移动端 | 左侧摇杆 | ⬆️按钮 | ⬇️按钮 | 🔥按钮 |
