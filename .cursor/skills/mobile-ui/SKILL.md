---
name: megabonk-mobile-ui
description: >-
  Enforces mobile-first responsive UI rules for MegaBonk DOM overlays and HUD
  in game/client/source/index.ts. Use when creating or modifying any in-game UI,
  HUD, menu, overlay, panel, button, card layout, font size, spacing, or touch
  targets. Trigger on keywords: UI, HUD, 界面, 面板, 菜单, overlay, responsive,
  适配, mobile, 手机, safe-area, 触控.
---

# MegaBonk Mobile UI

> 移动端优先。目标设备：竖屏手机 320–430px 宽，横屏 667–932px 宽；需兼容刘海/圆角/虚拟按键区。

## 改动前（必读）

1. 确认改动文件在**自由区**：`game/client/source/index.ts` 及同目录新增 UI 工具文件。
2. **禁止**改 `index.html`、`packages/platform/**`（契约锁定）。safe-area 在 overlay 根节点用 CSS 写，不要动 HTML。
3. 先定位 UI 类型（见下表），再选布局策略；不要对所有面板用同一套 fixed 居中。

| UI 类型 | 示例 | 布局策略 |
|---|---|---|
| **HUD** | 血条、计时、银币 | `position:fixed` + 百分比/clamp；`pointer-events:none`；子元素可点处单独开 `auto` |
| **Modal 面板** | 升级、神龛、暂停 | 全屏 flex 居中；内容区 `max-width` + 窄屏竖排 |
| **Scroll 面板** | 商店、任务 | `overflow-y:auto` + `max-height:100%`；header 固定，列表可滚 |
| **Menu** | 主菜单 | 纵向 flex + `justify-content:center`；小屏允许整体 scroll |

## 核心缩放规则

### 1. 设计基准

- **基准视口**：390×844（iPhone 14 竖屏逻辑像素）。
- **缩放因子** `uiScale`：

```ts
const UI_BASE_SHORT = 390; // min(vw, vh) 的设计基准
function getUiScale(): number {
  const short = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(0.75, Math.min(short / UI_BASE_SHORT, 1.25));
}
function uiPx(base: number): number {
  return Math.round(base * getUiScale());
}
```

- **优先顺序**：`clamp()` > `uiPx()` > 裸 px。
- **禁止**：标题、卡片宽、按钮 padding 等关键尺寸只用固定 px 且不随屏宽变化。

### 2. 字体

```ts
// 推荐模式
fontSize: `clamp(${uiPx(10)}px, 2.5vw, ${uiPx(18)}px)`
// 大标题
fontSize: `clamp(${uiPx(28)}px, 8vw, ${uiPx(56)}px)`
```

- 正文最小 **10px**（缩放后），交互控件最小 **12px**。
- 长文案用 `line-height: 1.4`；避免 `white-space: nowrap` 导致小屏截断。

### 3. 触控目标

- 所有可点击元素：`min-width` 和 `min-height` ≥ **44px**（WCAG 2.5.5）。
- 相邻可点控件间距 ≥ **8px**（推荐 12px）。
- 使用 `cursor:pointer; user-select:none; touch-action:manipulation;`。
- hover 的 `scale(1.05)` 仅作视觉反馈，**不能**作为唯一交互手段（移动端无 hover）。

### 4. Safe Area（必须）

任何 `position:fixed` 全屏 overlay / HUD 根节点必须包含：

```ts
padding-top: env(safe-area-inset-top, 0px);
padding-bottom: env(safe-area-inset-bottom, 0px);
padding-left: env(safe-area-inset-left, 0px);
padding-right: env(safe-area-inset-right, 0px);
box-sizing: border-box;
```

- 右下角 HUD / 暂停按钮：`top/right` 用 `max(12px, env(safe-area-inset-*))` 思路留边。
- 底部 XP 条、虚拟摇杆/按键区：额外留 **≥80px** 底边，避免与 `@minigame/platform` 虚拟控件重叠。

### 5. 断点（统一，禁止自创）

| 名称 | 条件 | 行为 |
|---|---|---|
| `narrow` | `innerWidth < 480` | 卡片列 → 单列；按钮组 `flex-wrap`；减小 gap |
| `short` | `innerHeight < 600` | 面板改 `justify-content:flex-start` + scroll；标题字号降一档 |
| `landscape` | `innerWidth > innerHeight` | Modal 内容 max-height 80vh；左右留白增大 |

- **禁止**混用 400 / 500 等随意阈值。
- 需要动态响应时，在 overlay 存活期注册 `onDisplayChange`（来自 `@minigame/platform`）或 `resize`，销毁时 unsubscribe。

### 6. 面板尺寸

- 内容容器：`width: min(92vw, 700px)`（商店/任务）；卡片 `width: min(170px, 85vw)`。
- 三列卡片行：窄屏 `flex-direction: column`；宽屏 `flex-direction: row`。
- 全屏遮罩：`background: rgba(0,0,0,0.7~0.92)`；内容区不超出可视区，必要时 `overflow-y: auto`。

### 7. 与 3D 画布的关系

- UI 层 z-index：HUD 100，游戏内 Modal 300，主菜单 500，商店/任务 600。
- 不修改 `#game-container` / canvas 尺寸逻辑；UI 只做 DOM overlay。
- 伤害数字等 `position:fixed` 元素需考虑 safe-area，避免贴边被裁切。

## 改动后自检清单

完成 UI 修改后，**必须**逐项确认（可在回复中列出结果）：

```
Mobile UI Checklist:
- [ ] 根 overlay/HUD 含 safe-area padding
- [ ] 无仅 px 的关键尺寸（或已用 clamp/uiPx）
- [ ] 可点击区域 ≥ 44×44px
- [ ] 底部未遮挡虚拟摇杆/按键（留 ≥80px）
- [ ] narrow (<480) 与 short (<600) 布局合理
- [ ] 横竖屏切换不会溢出或截断（若面板常驻则已绑 resize）
- [ ] 中文/英文 i18n 文案均未溢出卡片
- [ ] z-index 未与现有层冲突
- [ ] 未修改契约锁定文件
```

## 测试建议

改完后用 DevTools 设备模式至少测 4 个视口：

| 设备 | 尺寸 | 关注点 |
|---|---|---|
| iPhone SE | 375×667 | 最小宽、字体、卡片单列 |
| iPhone 14 | 390×844 | 基准布局 |
| Android 小屏 | 360×640 | 缩放下限 0.75 |
| 横屏 | 844×390 | Modal 高度、HUD 不重叠 |

本地：`pnpm dev` → F12 → Toggle device toolbar。

## 反模式（禁止）

- ❌ 固定 `width: 160px` 卡片且无 `min(…, vw)` 兜底
- ❌ 只在 `createElement` 时读一次 `innerWidth`，旋转后不更新
- ❌ 主菜单/商店不加 safe-area
- ❌ 按钮小于 44px 靠 padding 视觉放大但 hit area 仍小
- ❌ 为适配去改 `index.html` viewport 或 platform 包
- ❌ 新增 UI 字符串未走 `t()` i18n

## 可选：抽取 UI 工具（推荐逐步做）

若同一文件内重复模式 ≥3 次，可在 `game/client/source/ui/` 新增（自由区）：

- `scale.ts` — `getUiScale`, `uiPx`, `uiClamp`
- `layout.ts` — `applySafeArea(el)`, `isNarrow()`, `bindResponsiveLayout(el, fn)`

**不要**为了单次小改强行抽工具；先满足规则，再重构。
