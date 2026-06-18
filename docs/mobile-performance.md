# 移动端性能瓶颈与优化方案

> ⚠️ **本文已合并到 [`performance.md`](./performance.md)（2026-06-18）**，新工作请看那里。
> 此文件保留作历史归档：iPhone Safari 实测原始数据 + 移动端独立分析。

本文档基于 megabonk 接入 duko（`/game/`）后在 **Mac 桌面浏览器** 与 **iPhone Safari** 上的实测数据，结合 `game/client/source/index.ts` 渲染管线代码整理。

---

## 1. 实测基线

### 1.1 测试环境

| 项目 | 说明 |
|------|------|
| 入口 | `http://<host>:5193/game/` |
| 性能 API | `KubeeClient.getPerformanceScore()`、`KubeeClient.fps.getStats()` |
| iPhone 采样 | iOS 18.7，Safari 27，局内刚开始（敌人尚少） |
| Mac 采样 | Chrome，局内约 9 分钟 |

### 1.2 关键数据对比

| 指标 | Mac（桌面 Chrome） | iPhone（Safari，局内开局） |
|------|-------------------|---------------------------|
| 平均 FPS | **58.3** | **10.9** |
| 最低 FPS | 48 | 7.3 |
| 帧时间 | ~17 ms | ~126 ms |
| 综合分 | 87 | 70 |
| 加载时间 | 1134 ms | 234 ms |
| JS 错误 | 0 | 0 |
| 内存 | 120 MB | 不可用（iOS 无 `performance.memory`） |

### 1.3 结论摘要

- **不是加载或 JS 逻辑问题**：加载快、无运行时错误。
- **主要是 GPU 渲染负载**：同一套网页在 iPhone 上帧率约为 Mac 的 **1/5**。
- **局内开局仅 ~11 FPS**：说明瓶颈在**基础渲染管线**（分辨率、后处理、阴影、着色器），而不只是「后期怪太多」。
- **Mac 分数不能代表手机**：对外评估需单独测移动端。

### 1.4 iPhone 测 FPS 注意事项

直接打开 `/game/` 时 FPS 统计**不会自动启动**，需先执行：

```javascript
KubeeClient.fps.start({ intervalMs: 1000 })
// 局内玩 15～30 秒
KubeeClient.fps.getStats()
KubeeClient.getPerformanceScore()
```

在 duko Studio 的 iframe 内会自动启动 FPS 上报。

---

## 2. 瓶颈分析（按影响排序）

### 2.1 像素填充率过高 — **P0**

**位置**：`installThreeHighDpi()`（`index.ts`）+ `@minigame/platform` 的 `getRecommendedPixelRatio()`

**机制**：

- 默认 `maxPixelRatio` 封顶 **2**。
- iPhone Retina 下实际渲染分辨率约 **逻辑分辨率 × 2**（例如 ~780×1700+ 像素）。
- `EffectComposer` 使用 **HalfFloat** 离屏缓冲，带宽消耗高于直接上屏。

**影响**：移动端 GPU 填充率是第一瓶颈。

---

### 2.2 后处理管线过重 — **P0**

**位置**：`setupComposer()`（`index.ts`）

**机制**（Bloom 已默认关闭，但仍有）：

| Pass | 作用 | 开销 |
|------|------|------|
| `SceneOutlinePass` | 整场景渲到 RT + 深度纹理 + 全屏描边合成 | **每帧额外一次完整 3D 渲染** |
| `OutputPass` | Tone mapping | 全屏 |
| `ColorGradePass` | 饱和度/对比度/亮度 | 全屏 |

等效于：**1 次场景 + 3 次全屏后处理**，对手机 GPU 压力极大。

相关代码注释亦指出 Bloom 为移动端最大单项开销之一（当前已关）。

---

### 2.3 2048 软阴影 — **P0**

**位置**：`setupLighting()`（`index.ts`）

```typescript
dir.castShadow = true;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
// shadowMap.type = PCFSoftShadowMap
```

**影响**：每帧额外 shadow pass，2048² + PCF 软阴影在移动端通常是单项大头之一。

---

### 2.4 全局「弯曲世界」顶点着色器 — **P0～P1**

**位置**：`THREE.Material.prototype.onBeforeCompile` 全局 patch（`index.ts` 约 139 行起）

**机制**：

- 几乎所有 `MeshToonMaterial` / `MeshBasicMaterial` 等在顶点阶段做 **sin/cos 球面弯曲**（`uWarpStrength`）。
- 每个顶点额外计算，移动端 vertex shader 负担显著。

**叠加**：`setupGround()` 中 **400×400** 地面经 `tessellateGeometry(baseGeo, 1.8)` 高密度细分，顶点数进一步放大。

---

### 2.5 Draw Call / SkinnedMesh 敌人 — **P1**（随局内进度加重）

**位置**：`renderEnemies()`（`index.ts`）

**机制**：

- 每个敌人 `cloneSkeleton()` + 独立 `AnimationMixer`。
- 每个 SkinnedMesh 子网格 ≈ 1 draw call。
- 关卡 GLB 多 mesh、多 `MeshToonMaterial`，静态几何**未合批**。

**说明**：开局敌人少仍 ~11 FPS，说明 P0 项不解决时，P1 不是主因；但中后期会进一步恶化。

---

### 2.6 其它 — **P2**

| 项 | 说明 |
|----|------|
| `colormap.png` 404 | `ghost.glb` 引用 `/models/Textures/colormap.png` 缺失，贴图失败，影响较小 |
| 无 `KubeeClient.game.loaded()` | 平台生命周期警告，不影响 FPS |
| 无 `__THREE_PERF__` | 无法用 `KubeeClient.perf.getSnapshot()` 做 draw call 级分析 |
| `handshake retry` | Studio ↔ 后端连接，与游戏性能无关 |

---

## 3. 优化方案

### 3.1 阶段 1：移动端画质档（预期 iPhone **11 → 25～40 FPS**，约 1～2 天）

新增 `getQualityTier()` / `isMobile()`，在 `GameScene.start()` 读取一次，全局生效。

| 优先级 | 改动 | 具体做法 | 代码位置 |
|--------|------|----------|----------|
| 1 | 降分辨率 | `installThreeHighDpi({ maxPixelRatio: isMobile ? 1 : 2 })` | `start()` ~4292 |
| 2 | 简化后处理 | 移动端：`outlinePass.mode = 'none'`，或直接 `renderer.render` 跳过 Composer | `setupComposer()` |
| 3 | 降阴影 | 移动端：`mapSize = 1024` 或 `BasicShadowMap`，或 `castShadow = false` | `setupLighting()` |
| 4 | 关弯曲世界 | 移动端：`curvedWorldUniforms.uWarpStrength.value = 0` | ~135 行 |
| 5 | 减地面细分 | 移动端：`tessellateGeometry(baseGeo, 4)` 或不细分 | `setupGround()` |

**验证标准**：iPhone 同位置（局内开局）`avgFps ≥ 25`。

---

### 3.2 阶段 2：减 Draw Call（预期再 +5～15 FPS，约 3～5 天）

| 优先级 | 改动 | 具体做法 |
|--------|------|----------|
| 6 | 关卡静态合批 | 加载 whitebox 后按材质 `mergeGeometries` 合并静态 mesh |
| 7 | 远景关阴影 | 确保 `userData.isBackground` 的 mesh 不 cast/receive shadow |
| 8 | 敌人 LOD | 远距离简化 mesh 或 animation mixer 每 2 帧更新 |
| 9 | 减 VFX 上限 | `MAX_BILLBOARDS` 64→24，粒子池减半 |

**验证**：Mac `pnpm dev` 下按 `` ` `` 打开 perf overlay（`setupPerfStats`），观察 Draw Call 与 `enemy meshes` 是否下降。

---

### 3.3 阶段 3：平台与可观测性（可并行）

| 优先级 | 改动 | 具体做法 |
|--------|------|----------|
| 10 | 生命周期 | boot / 主菜单完成时调用 `KubeeClient.game.loaded()` |
| 11 | 补资源 | 添加 `public/models/Textures/colormap.png` |
| 12 | 引擎暴露 | 可选：`window.__THREE_RENDERER__ = renderer` 供 KubeeClient 识别 |
| 13 | 深度 profiling | 接入 `__THREE_PERF__`，启用 `KubeeClient.perf.getSnapshot()` |

---

## 4. 验证与数据采集

### 4.1 推荐测试场景

1. 固定：**局内开局**（与基线一致，便于对比）。
2. 补充：**怪多 / Boss / 满屏特效**（看中后期下限 FPS）。
3. 条件注明：机型、iOS 版本、是否低电量模式、WiFi/热点。

### 4.2 控制台一键导出（游戏 iframe 内）

```javascript
(() => {
  const k = KubeeClient;
  const mem = performance.memory;
  const data = {
    capturedAt: new Date().toISOString(),
    performanceScore: k.getPerformanceScore(),
    fps: k.fps.getStats(),
    engine: k.engine,
    consoleStats: k.console.getStats(),
    perfSnapshot: k.perf?.getSnapshot?.() ?? null,
    memory: mem ? {
      usedMB: Math.round(mem.usedJSHeapSize / 1048576 * 10) / 10,
      totalMB: Math.round(mem.totalJSHeapSize / 1048576 * 10) / 10,
    } : null,
  };
  const text = JSON.stringify(data, null, 2);
  console.log(text);
  try { copy(text); } catch {}
  return data;
})();
```

### 4.3 iPhone 远程调试

1. iPhone：**设置 → Safari → 高级 → Web 检查器** 打开。
2. USB 连 Mac，Safari **开发 → [你的 iPhone] → 游戏页**。
3. 在 Mac 弹出的 Web 检查器 **控制台** 执行上述脚本。

### 4.4 局域网访问注意

Mac 与 iPhone 须在**同一网段**才能用 `http://<Mac IP>:5193/game/`。若 Mac 为 `30.29.156.x`、手机为 `30.29.199.x`，则无法直连，需用 **iPhone 热点**（Mac 连热点后查新 IP）或 **cloudflared/ngrok** 隧道。

---

## 5. 优化优先级清单（执行顺序）

### 必做（性价比最高）

- [ ] 移动端 `maxPixelRatio: 1`
- [ ] 移动端关闭或简化 `SceneOutlinePass` / `EffectComposer`
- [ ] 移动端阴影降至 1024 或关闭

### 应做

- [ ] 移动端关闭弯曲世界 + 降低地面细分
- [ ] 调用 `KubeeClient.game.loaded()`
- [ ] 补 `public/models/Textures/colormap.png`

### 可选（目标 50+ FPS 时）

- [ ] 关卡 mesh 合批
- [ ] 敌人 LOD / 动画降频
- [ ] VFX 上限下调
- [ ] 接入 `__THREE_PERF__`

---

## 6. 相关代码索引

| 模块 | 文件 | 说明 |
|------|------|------|
| 渲染主循环 | `game/client/source/index.ts` | `GameScene`、`animate()`、`renderFrame()` |
| 后处理 | `index.ts` → `setupComposer()` | SceneOutline / Output / ColorGrade |
| 光照阴影 | `index.ts` → `setupLighting()` | 2048 PCF 阴影 |
| 弯曲世界 | `index.ts` ~139 行 | 全局 `onBeforeCompile` |
| 地面 / 关卡 | `index.ts` → `setupGround()`、`tryLoadLevel()` | 细分地面 + GLB 关卡 |
| 敌人渲染 | `index.ts` → `renderEnemies()` | SkinnedMesh + AnimationMixer |
| 高 DPI | `packages/render-adapter/source/three.ts` | `installThreeHighDpi` |
| 像素比 | `packages/platform/source/display.ts` | `getRecommendedPixelRatio` |
| 资源路径 | `game/client/source/assetUrl.ts` | duko `/game/` 前缀 |
| 性能 API | duko `KubeeClient` | FPS、综合分、perf snapshot |

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-06-18 | 初版：基于 Mac / iPhone 实测与代码审阅 |
