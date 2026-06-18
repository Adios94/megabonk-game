# 桌面端性能瓶颈与优化方案

> ⚠️ **本文已合并到 [`performance.md`](./performance.md)（2026-06-18）**，新工作请看那里。
> 此文件保留作历史归档：Mac Chrome 实测原始数据 + 桌面独立分析 + 画质档设计。

本文档基于 megabonk 接入 duko（`/game/`）后在 **Mac 桌面 Chrome** 上的实测数据，结合 `game/client/source/index.ts` 渲染管线与 `docs/art-assets-todo.md` §14 已有优化记录整理。

与 [mobile-performance.md](./mobile-performance.md) 的关系：桌面 GPU 远强于手机，但当前仍**未稳定跑满 60 FPS**；桌面优化的目标是 **稳定 60 FPS、降低 GPU/CPU 峰值、为高密度战斗留余量**，而非像移动端那样大幅砍画质。

---

## 1. 实测基线

### 1.1 测试环境

| 项目 | 说明 |
|------|------|
| 入口 | `http://localhost:5193/game/`（duko）或 `pnpm dev` 直连 |
| 浏览器 | Chrome（Mac） |
| 场景 | 局内进行中，约 9 分钟采样 |
| 性能 API | `KubeeClient.getPerformanceScore()`、`KubeeClient.fps.getStats()` |

### 1.2 关键指标

| 指标 | Mac 桌面 Chrome（局内） | 说明 |
|------|------------------------|------|
| 平均 FPS | **58.3** | 接近 60，但未稳定满帧 |
| 最低 FPS | **48** | 战斗高峰 / 特效密集时可见掉帧 |
| 帧时间 | ~17 ms | 平均接近 16.6 ms 预算 |
| 综合分 | **87** | KubeeClient 加权评分 |
| 加载时间 | 1134 ms | 首屏可玩，非主瓶颈 |
| JS 错误 | 0 | 逻辑层稳定 |
| 堆内存 | ~120 MB | `performance.memory` 可用 |

### 1.3 与移动端对比（同游戏、不同设备）

| 指标 | 桌面 Mac | iPhone Safari |
|------|----------|---------------|
| 平均 FPS | 58.3 | 10.9 |
| 综合分 | 87 | 70 |
| 主瓶颈 | 后处理 + 阴影 + 同屏 draw | 填充率 + 后处理 + 阴影 |

**结论**：桌面端不是「已经够快不用管」，而是 **离稳定 60 FPS 还差约 2～12 FPS 余量**；后期怪多、Boss、满屏 VFX 时 min FPS 会进一步下探。

### 1.4 数据采集

**duko /game/ iframe 内**（需先启动 FPS 统计）：

```javascript
KubeeClient.fps.start({ intervalMs: 1000 })
// 局内玩 30～60 秒，覆盖普通战斗 + Boss
KubeeClient.fps.getStats()
KubeeClient.getPerformanceScore()
```

**一键导出报告**：

```javascript
(() => {
  const k = KubeeClient;
  const mem = performance.memory;
  const data = {
    capturedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { w: innerWidth, h: innerHeight },
    performanceScore: k.getPerformanceScore(),
    fps: k.fps.getStats(),
    engine: k.engine,
    consoleStats: k.console.getStats(),
    perfSnapshot: k.perf?.getSnapshot?.() ?? null,
    memory: mem ? {
      usedMB: Math.round(mem.usedJSHeapSize / 1048576 * 10) / 10,
      totalMB: Math.round(mem.totalJSHeapSize / 1048576 * 10) / 10,
      limitMB: Math.round(mem.jsHeapSizeLimit / 1048576 * 10) / 10,
    } : null,
  };
  const text = JSON.stringify(data, null, 2);
  console.log(text);
  try { copy(text); } catch {}
  return data;
})();
```

---

## 2. 已完成的优化（保持）

以下项已在代码中落地，**桌面端收益已计入当前 58 FPS 基线**：

| 项 | 位置 | 效果 |
|----|------|------|
| **关闭 Bloom** | `setupComposer()` → `BLOOM_ENABLED = false` | 去掉半分辨率高斯模糊 + mip RT，曾是最大单项 GPU 开销 |
| **关闭 canvas MSAA** | `WebGLRenderer({ antialias: false })` | 离屏 Composer 管线下 MSAA 几乎无效，纯浪费填充率 |
| **像素比封顶 dpr≤2** | `installThreeHighDpi` + `getRecommendedPixelRatio()` | Retina / 4K 屏不会无限放大渲染分辨率 |
| **InstancedMesh 合批** | 弹幕、拾取、经验球、部分 VFX | 大量同类物体 1～N draw，而非每颗一个 mesh |
| **Blob 阴影池** | `BlobShadowPool` | 角色脚下用贴图圆影，避免每个实体参与 shadow map |
| **Core 逻辑热路径** | `game/core/` | `distanceSqBetween`、SpatialHash 对象池、投射物 id 索引等，降低高密度战斗 CPU/GC |
| **WebGL context lost** | canvas 事件 + 浮层 | 切 Tab / 显卡驱动恢复时不至于永久黑屏 |
| **Dev perf overlay** | `` ` `` 键 | FPS / Draw / Tris / 分类拆解 / render submit ms |

---

## 3. 瓶颈分析（按桌面端影响排序）

### 3.1 SceneOutlinePass — 每帧二次场景渲染 — **P0**

**位置**：`setupComposer()` → `SceneOutlinePass`

**机制**：

- Pass 1：整场景渲染到 **HalfFloat RT + 深度纹理**。
- Pass 2：全屏 shader 做深度边缘描边合成。
- 之后还有 `OutputPass`（tone map）+ `ColorGradePass`（调色）。

等效 GPU 负载 ≈ **2× 场景几何 + 2× 全屏后处理**（Bloom 关闭后仍是最大头）。

**Dev 验证**：按 `` ` `` 打开左下角 overlay，看 `post` 行（`drawCalls - breakdown sum`）与 `outline: screenSpace`。

**已有开关**：`outlinePass.mode = 'none'` 时只 blit 颜色、不叠边（dev 面板 **O 键** 可切换 `screenSpace` / `none`）。

---

### 3.2 2048 PCF 软阴影 — **P0**

**位置**：`setupLighting()`

```typescript
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
```

**影响**：方向光 shadow pass 每帧额外渲染 casters；2048² + PCF 在 Mac 集显 / 多 casters 时明显。关卡 mesh、地面、部分敌人均 `castShadow` / `receiveShadow`。

**对比**：玩家/敌人/Boss 已用 **Blob 阴影** 做脚下假影，但场景级实时阴影仍全开。

---

### 3.3 高 DPI 填充率（Retina / 4K）— **P1**

**位置**：`installThreeHighDpi` + `packages/platform/source/display.ts`

**机制**：

- `devicePixelRatio` 钳制在 **1～2**。
- MacBook Retina 全屏时渲染像素 ≈ `逻辑宽×高×dpr`（例如 1512×982 ×2 ≈ 300 万像素）。
- `EffectComposer` 默认 **HalfFloat** 离屏，带宽 ×2 于 8-bit 直出。

**现象**：外接 4K 屏、浏览器非 100% 缩放时，dpr 仍可能触顶 2，GPU 压力跳升。

---

### 3.4 全局弯曲世界 + 高密度地面 — **P1**

**位置**：`THREE.Material.prototype.onBeforeCompile`（~139 行）、`setupGround()`

**机制**：

- 几乎所有 Toon/Basic 材质顶点阶段做 **sin/cos 球面弯曲**（`uWarpStrength = 0.015`）。
- 400×400 地面 `tessellateGeometry(baseGeo, 1.8)`，顶点数极大。

桌面 GPU 能扛，但在 **已与 OutlinePass 叠加** 时，vertex 阶段仍占 measurable 时间。

---

### 3.5 蒙皮敌人 Draw Call / AnimationMixer — **P1**（随局内加重）

**位置**：`renderEnemies()`

**机制**：

- 每个敌人 `cloneSkeleton()` + 独立 `AnimationMixer` + 多子网格 SkinnedMesh。
- perf overlay 已统计：`Enemies: N → M draws`、`merge tex→ / sig→`（合批潜力指标）。

**现象**：开局敌人少时 avg 仍 ~58 FPS，说明不是唯一主因；**Final Swarm / 高密度** 时 min FPS 48 与此项强相关。

---

### 3.6 其它 — **P2**

| 项 | 说明 |
|----|------|
| **ColorGradePass** | 单全屏 pass，开销远小于 OutlinePass，可保留 |
| **VFX 上限** | `MAX_BILLBOARDS = 64`，满屏时额外 draw |
| **Hit Stop 顿帧** | 逻辑层仍 `renderFrame()`，不影响 FPS 统计但体感卡顿 |
| **UI / GSAP / HUD** | 非 GPU 主瓶颈；120 MB 堆内存健康 |
| **资源体积 ~68 MB** | 影响加载，不直接卡帧；见 §5.3 |
| **无 `__THREE_PERF__`** | KubeeClient 无法做 draw call 级远程快照 |

---

## 4. 优化方案

### 4.1 阶段 1：稳定 60 FPS（预期 avg **58 → 60**，min **48 → 55+**，约 1～2 天）

面向当前最大单项开销，**尽量不影响默认画质**。

| 优先级 | 改动 | 具体做法 | 代码位置 |
|--------|------|----------|----------|
| 1 | 描边可选 / 低档关闭 | 新增 `QualityTier`：`outlinePass.mode = 'none'` 或 dev 已有 O 键行为作为默认「性能档」 | `setupComposer()` |
| 2 | 阴影分级 | 桌面性能档：`mapSize 1024` + `BasicShadowMap`；品质档保持 2048 PCF | `setupLighting()` |
| 3 | 动态 dpr | 监测 `perfRenderMs` 或 FPS，连续低于 55 时 `maxPixelRatio: 1.5 → 1`，恢复后回升 | `installThreeHighDpi` 调用处 |
| 4 | 跳过冗余 Composer | `outline=none` 且无 Bloom 时，可评估直接 `renderer.render` + 单 pass tone map（需 A/B 对比） | `renderFrame()` |

**验证标准**：

- 同场景 60 秒：`avgFps ≥ 59.5`，`minFps ≥ 55`
- Dev overlay：`render submit` EMA **< 14 ms**，`post` 差额下降

---

### 4.2 阶段 2：高密度战斗余量（预期 min FPS **+5～15**，约 3～5 天）

| 优先级 | 改动 | 具体做法 |
|--------|------|----------|
| 5 | 关卡静态合批 | whitebox GLB 按材质 `mergeGeometries`，静态 mesh 合并 |
| 6 | 敌人材质合并 | 利用 overlay 的 `sig→` 统计，同签名 SkinnedMesh 共享材质实例 |
| 7 | Mixer 错峰 | 远距离敌人 `mixer.update` 每 2 帧一次；超上限敌人简模 |
| 8 | 弯曲世界分级 | 性能档 `uWarpStrength = 0`，地面 `tessellateGeometry(..., 4)` |
| 9 | 背景不参与阴影 | `userData.isBackground` mesh 关闭 cast/receive shadow |

**验证**：Final Swarm / Boss 战时 min FPS；overlay 中 `enemy` / `level` draw 下降。

---

### 4.3 阶段 3：加载与显存（与帧率并行，偏发布体验）

| 优先级 | 改动 | 具体做法 | 参考 |
|--------|------|----------|------|
| 10 | UI PNG 压缩 | 30 MB UI 纹理 WebP/AVIF | `art-assets-todo.md` §14.2 |
| 11 | 清理 dead assets | `public/**/_unused` 移出发布包 | §14.2 #2 |
| 12 | GLB Draco/meshopt | 玩家/敌人/关卡 glb 瘦身 | §14.2 #3/#4 |
| 13 | KTX2 纹理 | 降 GPU 显存与上传带宽 | §14.2 E |
| 14 | 部署 Brotli | `.js` / `.gltf` 传输压缩 | §15.3 #9 |

---

## 5. 诊断工具（桌面专用）

### 5.1 Dev Perf Overlay

**仅 `import.meta.env.DEV` 构建可用**。

1. `pnpm dev` 或 duko 开发模式启动。
2. 进入局内，按 **`` ` ``**（Backquote）打开左下角面板。
3. 关注字段：

| 字段 | 含义 |
|------|------|
| `FPS` | 瞬时帧率（0.25s 采样） |
| `Draw` | 本帧 WebGL draw calls |
| `Tris` | 三角形数（千） |
| `Enemies → draws` | 敌人数量 vs 子网格 draw |
| `merge tex→ / sig→` | 按贴图 / 材质签名可合并数 |
| `real draws (frustum)` | 视锥内分类：enemy / shadow / level / other |
| `+post` | 后处理 & shadow map 额外 draw |
| `outline` | `screenSpace` / `none` |
| `render: Xms (submit)` | CPU 端提交耗时 EMA，**>16.6 即危险** |

右上角 **风格化调参面板** 同 `` ` `` 切换；**O 键** 切换描边模式，便于 A/B。

### 5.2 Chrome DevTools

| 工具 | 用途 |
|------|------|
| **Performance** | 录制 10s，看 Main thread vs GPU raster |
| **Rendering → FPS meter** | 快速目视帧率 |
| **Memory** | 长时间对局是否泄漏（目标：destroy 后回落） |
| **Sensors → CPU throttling** | 模拟低配桌面（4× slowdown）验证分级策略 |

### 5.3 KubeeClient（duko 集成）

| API | 用途 |
|-----|------|
| `KubeeClient.fps.start()` | 开始 FPS 采样 |
| `KubeeClient.fps.getStats()` | avg / min / max / frameTime |
| `KubeeClient.getPerformanceScore()` | 综合分（对外汇报） |
| `KubeeClient.console.getStats()` | JS 错误、加载耗时 |
| `KubeeClient.perf.getSnapshot()` | 需引擎暴露 `__THREE_PERF__`（尚未接入） |

Studio iframe 内 FPS 会自动上报；直连 `/game/` 需手动 `fps.start()`。

---

## 6. 推荐测试矩阵

| 场景 | 目的 | 关注指标 |
|------|------|----------|
| 局内开局 60s | 基线对比 | avg FPS、render ms |
| 普通刷怪 3 min | 敌人递增 | Draw、enemy draws |
| Boss 战 | 单实体 + 大量 VFX | min FPS |
| Final Swarm | 极端 draw / mixer | min FPS、merge sig |
| 4K 外接屏全屏 | 填充率 | dpr、render ms |
| 连续 3 局 | 泄漏 | 堆内存、WebGL context |

记录时注明：**浏览器版本、是否硬件加速、窗口分辨率、dpr、画质档**。

---

## 7. 优化优先级清单

### 必做（冲稳定 60 FPS）

- [ ] 描边 Pass 可配置（默认品质 / 性能档关描边）
- [ ] 阴影 mapSize / 类型分级
- [ ] 基于 FPS 或 render ms 的动态 dpr（1.5 / 1 回落）

### 应做（高密度战斗）

- [ ] 关卡静态 mesh 合批
- [ ] 敌人材质签名合并 + mixer 错峰
- [ ] 背景 mesh 退出 shadow caster

### 可选（发布与长期）

- [ ] 资源体积优化（§4.3）
- [ ] 接入 `__THREE_PERF__` + `KubeeClient.game.loaded()`
- [ ] 补 `public/models/Textures/colormap.png`（消除 404）

---

## 8. 画质档设计建议（桌面）

与移动端共用 `getQualityTier()` 时，建议桌面分三档：

| 档位 | dpr 上限 | Outline | Shadow | 弯曲世界 | 目标用户 |
|------|----------|---------|--------|----------|----------|
| **Ultra** | 2 | screenSpace | 2048 PCF | 开 | 独显 / 高刷显示器 |
| **High**（默认） | 2 | screenSpace | 2048 PCF | 开 | 当前基线 |
| **Balanced** | 1.5 | none | 1024 Basic | 开 | 集显 / 4K 笔记本 |
| **Performance** | 1 | none | 关或 512 | 关 | 直播录屏 / 低配 |

检测信号：`navigator.gpu`（若可用）、初始 benchmark 5s、或用户手动设置。

---

## 9. 相关代码索引

| 模块 | 文件 | 说明 |
|------|------|------|
| 渲染主循环 | `game/client/source/index.ts` | `animate()`、`renderFrame()` |
| 后处理 | `index.ts` → `setupComposer()` | SceneOutline / Output / ColorGrade |
| 描边 Pass | `index.ts` → `SceneOutlinePass` | 二次场景渲染 |
| 光照阴影 | `index.ts` → `setupLighting()` | 2048 PCF |
| 弯曲世界 | `index.ts` ~130 行 | 全局 shader patch |
| 地面 | `index.ts` → `setupGround()` | 细分 + 关卡挂载 |
| 敌人 | `index.ts` → `renderEnemies()` | SkinnedMesh + Mixer |
| Instancing | `index.ts` → `setupProjectileMesh` 等 | 弹幕 / 拾取合批 |
| Blob 阴影 | `game/client/source/systems/blobShadows.ts` | 角色假影 |
| Perf Overlay | `index.ts` → `setupPerfStats()` | Dev 诊断 |
| 高 DPI | `packages/render-adapter/source/three.ts` | `installThreeHighDpi` |
| 像素比 | `packages/platform/source/display.ts` | `clampPixelRatio` max=2 |
| Core 物理 | `game/core/source/physics.ts` 等 | 平方距离、SpatialHash |
| 历史优化记录 | `docs/art-assets-todo.md` §14 | Bloom / MSAA 已关 |

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-06-18 | 初版：Mac Chrome 实测基线 + 代码审阅 + 分阶段优化方案 |
