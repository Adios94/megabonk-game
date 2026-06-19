# 性能优化总报告（汇总）

> 这是 megabonk 性能优化的**单一入口**，合并自：
> - `docs/mobile-performance.md`（iPhone Safari 实测，2026-06-18）
> - `docs/desktop-performance.md`（Mac Chrome 实测，2026-06-18）
> - `docs/art-assets-todo.md` §14（资源体积 + 渲染优化历史）/ §15（移动端清单）
> - `game/client/source/index.ts` + `game/core/source/**` 全文静态扫描
> - 桌面 vsync-off 实测（M3 / Chromium / DPR=2）补出的 late-combat 退化曲线
>
> 旧的 `mobile-performance.md` / `desktop-performance.md` 仍保留作历史归档，新工作只看本文。
>
> 最后更新：2026-06-18

---

## 0. 快速结论

| 平台 | 现状 | 主瓶颈 | 目标 |
|---|---|---|---|
| **iPhone iOS18.7 Safari** | avg **10.9 fps** / min 7.3 / 帧时 ~126 ms | 像素填充率 + 后处理 + 阴影（**基础渲染管线**，不是后期） | 阶段 1+2 后 **avg ≥ 25 fps** |
| **Mac Chrome 集显** | avg 58.3 / **min 48** / 帧时 ~17 ms | OutlinePass + 2048 PCFSoft 阴影 | 阶段 3 后 **avg ≥ 59.5 / min ≥ 55** |
| **M3 / vsync 解锁** | mid_combat 155 fps，late_combat **91 fps**（draw 634→873，帧时 6.2→10.8） | sim tick CPU（spatial-hash 5 处缺位） | 阶段 4 后 late_combat draw <700/帧、p50 <8 ms |

**核心动作**：用一个 `getQualityTier()` 总开关把所有改动门控住，桌面 4 档（Ultra/High/Balanced/Performance）+ Mobile 1 档，避免桌面回退画质。

---

## 1. 实测基线（三方数据合并）

### 1.1 测量环境

| 来源 | 设备 | 模式 | 工具 |
|---|---|---|---|
| ① mobile | iPhone iOS 18.7 Safari，局内开局 | Retina DPR≈2 | `KubeeClient.fps.start({intervalMs:1000})` + `getStats()` |
| ② desktop | Mac Chrome，局内 9 分钟 | DPR 钳到 2 | `KubeeClient` 同上 |
| ③ vsync-off | M3 / Chromium / 头戴 / DPR=2 | 手动驱动 RAF + 解 vsync | Playwright + `WebGL2RenderingContext` patch 计 draw call |

### 1.2 关键指标对比

| 指标 | iPhone | Mac Chrome | M3 vsync-off mid | M3 vsync-off late |
|---|---:|---:|---:|---:|
| 平均 FPS | **10.9** | **58.3** | 155 | **91** |
| 最低 FPS | 7.3 | **48** | — | — |
| 帧时 p50 | ~126 ms | ~17 ms | 6.2 ms | **10.8 ms** |
| 帧时 p95 | — | — | 7.9 ms | 13.3 ms |
| draw call/帧 | n/a | n/a | 634 | **873**（+37%） |
| heap | n/a | 120 MB | 89 MB | 94 MB |
| 综合分（KubeeClient） | 70 | 87 | — | — |

### 1.3 三个判断

1. **iPhone 11 fps 是基础管线问题，不是后期** —— 同套页面在 iPhone 上帧率约 Mac 的 1/5；开局敌人很少时也只有 11 fps。
2. **桌面也未稳 60** —— Mac Chrome min=48，离 60 还差 ~12 帧余量；Final Swarm / Boss / 满屏 VFX 时进一步下探。
3. **武器堆叠是普遍恶化源** —— vsync-off 实测从 mid 到 late，draw call +37%、帧时 +74%（不成比例 → CPU sim tick 有一笔涨）。

### 1.4 数据采集脚本（保留备用）

duko `/game/` iframe 内一键导出：

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
  console.log(JSON.stringify(data, null, 2));
  try { copy(JSON.stringify(data, null, 2)); } catch {}
  return data;
})();
```

直连 `/game/` 时 FPS 不会自动启动，需先：

```javascript
KubeeClient.fps.start({ intervalMs: 1000 })
// 局内玩 30~60 秒
KubeeClient.fps.getStats()
```

iframe（duko Studio 内）会自动启动 FPS 上报。

---

## 2. 已完成的优化（保持，不要回滚）

| 项 | 位置 | 效果 |
|---|---|---|
| **关闭 Bloom** | `setupComposer()` → `BLOOM_ENABLED = false` | 去掉半分辨率高斯模糊 + mip RT |
| **关闭 canvas MSAA** | `WebGLRenderer({ antialias: false })` | 离屏 Composer 管线下 MSAA 几乎无效 |
| **像素比封顶 dpr ≤ 2** | `installThreeHighDpi` + `clampPixelRatio` | Retina/4K 不会无限放大 |
| **InstancedMesh 合批** | 弹幕 / 拾取 / 经验球 / 部分 VFX | 同类物体 1~N draw |
| **Blob 阴影池** | `BlobShadowPool` (`systems/blobShadows.ts`) | 角色脚下贴图圆影，不参与 shadow map |
| **Core 逻辑层热路径** | `game/core/source/`（部分系统） | `distanceSqBetween`、SpatialHash 池 + 复用 Set、StatBlock scratch、投射物 id O(1) 索引 |
| **WebGL context lost** | canvas 事件 + 浮层 | 切 Tab / 显卡驱动恢复时不黑屏 |
| **Dev perf overlay** | `setupPerfStats()`，`` ` `` / `O` 键 | FPS / Draw / Tris / 分类拆解 / render submit ms |
| **启动 loading 进度条** | `bootLoadingManager` | 加载期不再纯蓝白屏 |

---

## 3. 瓶颈分析

按"对哪类设备最致命"分类。每个条目给文件:行号 + 数据支撑。

### 3.1 移动端致命项（同时也是桌面 P0）

#### A. 像素填充率 — 移动端第一瓶颈

**位置**：`installThreeHighDpi()` (`index.ts:4283-4294`) + `packages/platform/source/display.ts` `clampPixelRatio`

**机制**：
- iPhone Retina 实际渲染像素 ≈ 逻辑分辨率 × 2，dpr=2 时填充率 ×4
- `EffectComposer` 默认用 **HalfFloat** 离屏 RT，带宽 ×2 于 8-bit 直出（bloom 关掉后 HalfFloat 已无收益）

#### B. SceneOutlinePass — 每帧 2× 场景渲染

**位置**：`setupComposer()` `index.ts:4527-4532`

**机制**（2026-06-20 重读源码后核实）：
- Pass 1：`SceneOutlinePass` 内部 `renderer.render(scene, camera)` 一次到 HalfFloat RT + DepthTexture（**只有 1× 场景几何**，不是 2×）
- Pass 2：同一 pass 末段做 4-tap Roberts-cross 全屏边缘检测合成
- 之后链上还有 `OutputPass`（tonemap）+ `ColorGradePass`（调色）+ `DarkComicPass`（去饱和+噪点）
- 实际等效 **1× 场景几何 + 4× HalfFloat 全屏 blit**，移动端真正吃填充率的是后面这串末端 LDR pass 累加，单独描边 shader 本身只 5 tap 不重

**已有开关**：`outlinePass.mode = 'none'` 时只 blit 颜色（dev `O` 键 A/B）；注意 `mode='none'` 仍然走完整条 composer 链，并不省 pass，只是 alpha=0 不叠边。

**注意**：`OutputPass` / `ColorGradePass` / `DarkComicPass` 三个末端 LDR pass 全部是单 sample 全屏 blit，可数学等价合并为 1 个 shader（详见 §4.5）。

#### C. 2048 PCFSoft 阴影

**位置**：`setupLighting()` `index.ts:4174-4416`

```ts
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
dir.shadow.mapSize.width = 2048;
dir.shadow.mapSize.height = 2048;
```

每帧额外 shadow pass，2048² + PCF 软阴影在移动端是单项大头之一；桌面集显也是 P0。

#### D. 全局弯曲世界 vshader + 高密度地面（vshader 双重压力）

**位置**：
- `THREE.Material.prototype.onBeforeCompile` 全局 patch (`index.ts:~139`)，所有 Toon/Basic 在顶点端做 sin/cos 球面弯曲（`uWarpStrength = 0.015`）
- `setupGround()`：400×400 地面经 `tessellateGeometry(baseGeo, 1.8)` → ~50K+ 顶点

桌面 GPU 能扛，移动端是显著开销。两道叠加最痛。

### 3.2 sim tick CPU（解释 late-combat 曲线）

vsync-off 实测：mid → late combat 帧时 +4.6 ms，按 GPU 端 draw call 增量只能解释 ~1.5 ms，**剩下 ~3 ms 在 CPU sim tick**。

`SpatialHash.queryRef` (`game/core/source/spatial-hash.ts:86-89`) 是已写好的零分配版本，但只在 `collisions.ts`（投射物→敌人）一处用上。其余 5 处全是裸 O(N) 扫敌人：

| 系统 | 文件:行号 | 问题 |
|---|---|---|
| `tickAreaEffects` 三 case（gas/ripple/scorch） | `areaEffects.ts:55, 84, 118` | 中后期同时 3-5 AOE × ~150 敌人 ≈ 750 dist op/tick |
| `pickups.ts` thorns 反伤 | `pickups.ts:245-253` | 全敌人 1.5 单位扫 ≈ 150 op/tick |
| `bone_bouncer` 跳弹 nearest 查找 | `collisions.ts:131-142` | bounce × N，scaling 差 |
| `projectilePathBlocked` 路径回溯 | `projectiles.ts:24-103` | 投射物 × √dist × box 数 ≈ 20K op/tick |
| `spawning.ts` 邻域校验 | `spawning.ts:287-319` | spawn wave 期 8 ray × 全几何 ≈ 2K op |

### 3.3 Draw Call / 蒙皮敌人（中后期加重）

**位置**：`renderEnemies()`

- 每个敌人 `cloneSkeleton()` + 独立 `AnimationMixer` + 多子网格 SkinnedMesh
- 关卡 GLB 多 mesh、多 `MeshToonMaterial`，**静态几何未合批**
- vsync-off 实测 late_combat 873 draw/帧 = 每秒 ~80K draw call

dev overlay 里 `Enemies → draws` / `merge tex→ / sig→` 字段量化合批潜力。

### 3.4 资源体积 / 显存（来自 art-assets-todo §14）

| 项 | 现状 | 收益 |
|---|---|---|
| `public/ui` PNG 未压缩 | 30.7 MB / 60 张 | WebP/AVIF：30 MB → 4-6 MB |
| `public/models/_unused` 死资源 | 13.8 MB | 移出 public/ → 0 |
| 玩家/敌人 GLTF（文本，base64） | ~7.9 MB | Draco/meshopt：→ 2-3 MB |
| `level_whitebox.glb` | 7.9 MB | gltfpack -cc → ~3-4 MB |
| UI 纹理 GPU 显存 | 30 MB PNG 解码 = RGBA 显存 | KTX2(Basis) 大幅降显存 + 上传带宽 |

### 3.5 其它 P2

| 项 | 说明 |
|---|---|
| ColorGradePass | 单全屏 pass，开销远小于 OutlinePass，可保留；但与 OutputPass 合并 shader 可省一道 blit |
| EffectComposer HalfFloat RT | bloom 关后无收益，可改 `UnsignedByteType` 省 50% 带宽 |
| Hit Stop 顿帧 | 逻辑层仍 `renderFrame()`，不影响 FPS 统计但体感卡顿 |
| `MAX_BILLBOARDS = 64` | 满屏时额外 draw |
| `ghost.glb` 引用 `colormap.png` 404 | 单贴图缺失，影响极小 |
| `KubeeClient.game.loaded()` 未调用 | 平台生命周期警告，不影响 FPS |
| `__THREE_PERF__` 未暴露 | 无法用 `KubeeClient.perf.getSnapshot()` 做远程 draw call 级分析 |

---

## 4. 总盘优化方案（按阶段执行）

> **基础设施**：先做 `getQualityTier()` + `isMobile()` 总开关；`GameScene.start()` 一次读，分发到所有改动。这是后续所有 P0 改动的前置。

### 阶段 1：画质档总开关（1 天）

| # | 改动 | 文件 |
|---|---|---|
| 1.1 | 新增 `getQualityTier(): 'mobile' \| 'performance' \| 'balanced' \| 'high' \| 'ultra'` + `isMobile()` | 新文件，建议放 `game/client/source/quality.ts` 或 `packages/platform/source/quality.ts` |
| 1.2 | `GameScene.start()` 调一次，把档位传给 `setupComposer / setupLighting / setupGround / installThreeHighDpi` | `index.ts:4255-4266` |

档位定义见 §6。检测信号：`isMobile()`（ua/touch）→ Mobile；桌面默认 High，初始 5s benchmark 看 `perfRenderMs` 自动降到 Balanced；用户可手动覆盖。

### 阶段 2：移动端 P0（1-2 天，目标 iPhone 11 → 25 fps）

| # | 改动 | 文件:行号 | 收益估计 |
|---|---|---|---|
| 2.1 | `installThreeHighDpi({ maxPixelRatio: isMobile ? 1 : 2 })` | `index.ts:~4283-4294` | mobile 填充率 −75% |
| 2.2 | **替代原"移动端关描边"方案**：上线 `FinalCompositePass`（合 Outline+Output+Grade+DarkComic 4→1），移动端 sceneRT 改 `UnsignedByteType` + `uOutlineTapScale=2.0`。详见 §4.5 | `setupComposer()` / `SceneOutlinePass` 拆分 `index.ts:2196-2273` | 末端 4 全屏 blit → 1，HalfFloat 中间 RT 消失；保留全部描边视觉 |
| 2.3 | 移动端 `mapSize=1024` + `BasicShadowMap`，或 `castShadow=false` + 仅留 BlobShadow | `setupLighting()` `index.ts:4174-4416` | shadow pass −50~100% |
| 2.4 | 移动端 `curvedWorldUniforms.uWarpStrength.value = 0` | `index.ts:~135` | 全部材质 vshader 减负 |
| 2.5 | 移动端地面 `tessellate(4)` 或不细分 | `setupGround()` | mobile vshader −30~50% |

**验收**：iPhone 局内开局 30s `KubeeClient.fps.getStats().avgFps ≥ 25`。

### 阶段 3：桌面稳 60（1-2 天，目标 avg 58→60、min 48→55+）

| # | 改动 | 文件:行号 |
|---|---|---|
| 3.1 | **Balanced/Performance 档配置 `FinalCompositePass.uOutlineTapScale`**（Performance=1.5）。原"`mode='none'`"方案被 §4.5 取代，描边全档保留 | `setupComposer()` |
| 3.2 | Balanced 档 `mapSize=1024 BasicShadow`；Performance 档 `castShadow=false` | `setupLighting()` |
| 3.3 | **动态 DPR 反馈环**：监 `perfRenderMs` EMA，连续 60 帧 >14ms 时 dpr 2→1.5→1，恢复后回升 | `installThreeHighDpi` 调用处 `index.ts:4283-4294` |
| 3.4 | sceneRT 改 `UnsignedByteType`（已并入 §4.5 FinalCompositePass 重构） | — |
| 3.5 | OutputPass + ColorGrade + DarkComic 合并（已并入 §4.5 FinalCompositePass 重构） | — |

**验收**：Mac Chrome 局内 60 秒 `avgFps ≥ 59.5 / minFps ≥ 55`；dev overlay `render submit` EMA `<14 ms`。

### 阶段 4：sim tick CPU（2-3 天，目标 late_combat 不退化）

| # | 改动 | 文件:行号 |
|---|---|---|
| 4.1 | `tickAreaEffects` 三 case 改 `spatialHash.queryRef` | `areaEffects.ts:55, 84, 118` |
| 4.2 | `spawning.ts` 邻域校验接 `geo.grid`（已存在） | `spawning.ts:287-319` |
| 4.3 | `pickups.ts` thorns 改 spatial query | `pickups.ts:245-253` |
| 4.4 | `bone_bouncer` 跳弹改 spatial query + filter | `collisions.ts:131-142` |
| 4.5 | `projectilePathBlocked` 改 swept-AABB + grid（动作较大，可推到阶段 5） | `projectiles.ts:24-103` + `collision.ts:519-529` |
| 4.6 | （次优）`weapons.ts:82-85` 每次开火 `{...baseStats}` 改 mutate 复用对象 | `weapons.ts` |

**验收**：vsync-off `/tmp/perf-probeB.cjs` late_combat draw <700/帧、p50 <8ms；iPhone 中后期 FPS 不掉到 <25。

### 阶段 5：高密度战斗余量（3-5 天）

| # | 改动 |
|---|---|
| 5.1 | 关卡 whitebox 加载后按材质 `mergeGeometries` 合批静态 mesh |
| 5.2 | 敌人材质签名合并（用 dev overlay `sig→` 字段定位） |
| 5.3 | Mixer 错峰：远距离敌人每 2 帧 update / 超上限简模 |
| 5.4 | 背景 mesh `userData.isBackground` 退出 shadow caster |
| 5.5 | `MAX_BILLBOARDS` 64→24（Mobile/Performance 档），粒子池减半 |
| 5.6 | `state.gameTime` 不变时跳过 transform 写（高刷屏 RAF 重复 work） |

**验收**：Final Swarm / Boss 战 min FPS（Mac）≥ 50；iPhone 中后期 FPS ≥ 25。

### 阶段 6：发布体验 / 资源（与帧率并行）

来自 `art-assets-todo.md §14.2`：

| # | 改动 | 收益 |
|---|---|---|
| 6.1 | UI PNG 压缩（背景 JPEG/WebP，立绘 WebP q80） | 30.7 MB → 4-6 MB |
| 6.2 | 删除 / 移出 `public/**/_unused` | −16 MB |
| 6.3 | 玩家/敌人 GLTF → GLB + Draco/meshopt | ~8 MB → 2-3 MB |
| 6.4 | `level_whitebox.glb` `gltfpack -cc` | 7.9 → ~3-4 MB |
| 6.5 | UI/VFX 关键纹理 KTX2(Basis) | 显存 + 上传带宽双降 |
| 6.6 | 部署 Brotli/gzip | `.gltf` / `.js` 文本资源再降 60-70% |

### 阶段 7：可观测性 / 工程债

| # | 改动 |
|---|---|
| 7.1 | boot/主菜单完成时调 `KubeeClient.game.loaded()` |
| 7.2 | 补 `public/models/Textures/colormap.png`（消除 ghost.glb 404） |
| 7.3 | `window.__THREE_RENDERER__ = renderer`（让 KubeeClient 识别） |
| 7.4 | 接 `__THREE_PERF__` → `KubeeClient.perf.getSnapshot()` 远程 draw call 快照 |

---

## 4.5 移动端保留 SceneOutlinePass 的具体实施（2026-06-20 决策）

> 上下文：whitebox 关卡的折角描边是核心表现力，**inverted-hull 反法线挤出方案被否**（只描角色轮廓，不描关卡折角）。需要在移动端保留屏幕空间深度边缘描边，同时把后处理预算压下来。

### 4.5.1 视觉前提（不可丢）

| 边类型 | 是否必须保留 | 备注 |
|---|---|---|
| 角色轮廓（前景对背景） | ✅ | 玩家 / 敌人 / boss / 宠物 |
| 物体之间深度突变 | ✅ | 敌人遮挡敌人、武器特效遮挡角色 |
| **whitebox 折角**（同物体内部硬折边） | ✅ | **关卡风格核心**，inverted-hull 拿不到 |
| 同物体内部材质交界 | ❌ | 现状也不描，无变化 |
| 远处天边 | ❌ | `depthMask` 已抑制 |

可接受的损失：移动端边缘像素粗细 1px → 1.2~1.5px（半分辨率核），快速旋转相机时边缘有亚像素抖动。

### 4.5.2 核心方案：FinalCompositePass 合 4 → 1

把 `SceneOutlinePass`（合成段）+ `OutputPass` + `ColorGradePass` + `DarkComicPass` **彻底合并为单个 `FinalCompositePass`**。`SceneOutlinePass` 退化为只负责"把场景渲到 sceneRT"（保留 DepthTexture 输出），不再做合成。

新链路：

```
SceneRenderPass（场景 → sceneRT，含 DepthTexture）
  ↓
FinalCompositePass（吃 tColor + tDepth，单 shader 一次性做完）
   1. 边缘检测（线性空间，mix to black）
   2. ACES tonemap + sRGB encode（HDR → LDR）
   3. contrast / brightness / saturation
   4. desaturate + noise（DarkComic ramp）
  ↓ 写到屏幕
```

**收益**：4 个全屏 blit → 1 个全屏 blit；HalfFloat 中间 RT 全部消失（除场景 sceneRT 一张）。

**视觉等价性**：
- 描边由"线性 HDR 里 mix to black"改为"tonemap 后 mix to black"。toon 材质本来就 ≤1 无 HDR 内容，**无可见差异**
- sceneRT type 移动端可以 `UnsignedByteType`，桌面 Ultra/High 也建议（bloom 已关，HDR 路径无人吃）

### 4.5.3 移动端额外瘦身：shader 内放大 tap 间距

**不开半分辨率 RT**（多一张 RT 反而费），改在 FinalCompositePass 的 fragment shader 里把描边采样间距乘 2：

```glsl
// uOutlineTapScale: Mobile=2.0 / Performance=1.5 / Balanced..Ultra=1.0
vec2 texel = (uThickness * uOutlineTapScale) / uResolution;
float n = sampleZ(vUv + vec2(0.0,  texel.y));
// ... 4-tap 保持不变
```

效果等同半分辨率核，但实现复杂度大降、显存少一张 RT。视觉上边缘从 1px 锐线变成 1.2~1.5px 略钝，关卡折角和角色轮廓全部保留。

### 4.5.4 各档位描边参数

| 档位 | sceneRT type | tap scale | 描边强度 `uOutlineAlpha` |
|---|---|---:|---:|
| Ultra / High | UnsignedByte（bloom 关，HDR 无收益） | 1.0 | 0.85（现状） |
| Balanced | UnsignedByte | 1.0 | 0.85 |
| Performance | UnsignedByte | 1.5 | 0.80 |
| **Mobile** | UnsignedByte | **2.0** | 0.85 |

`renderer.outputColorSpace = SRGB`，sceneRT 用 `LinearSRGBColorSpace`，tonemap 在 FinalCompositePass 内做（与现状 OutputPass 等价）。

### 4.5.5 实施切片

按以下三刀提交，每刀独立可验证：

| 刀 | 改动 | 文件 | 验证 |
|---|---|---|---|
| **第一刀** | 新增 `game/client/source/quality.ts`（`getQualityTier()` + `isMobile()` + 5s benchmark 自动降档），`GameScene.start()` 调一次 | 新增 + `index.ts:~4255-4266` | 桌面/iPhone 控制台打印当前档位无报错 |
| **第二刀** | 实现 `FinalCompositePass`（合 4→1），`SceneOutlinePass` 拆成 `SceneRenderPass`（仅渲场景到 RT），`setupComposer()` 重接两段 | `index.ts:2196-2273`（重构）+ `2304-2500`（新 pass）+ `setupComposer()` | 桌面 dev overlay `+post` 数下降；视觉与原版 diff < 1 LSB |
| **第三刀** | 档位接到：`installThreeHighDpi`（移动 dpr=1）/ `setupLighting`（mobile 1024 Basic）/ `curvedWorldUniforms.uWarpStrength`（mobile=0）/ `setupGround` tessellate（mobile=4）/ `FinalCompositePass.uOutlineTapScale`（按档位） | `index.ts:~135 / ~4174 / ~4283 / setupGround` | iPhone `KubeeClient.fps.getStats().avgFps ≥ 25`；Mac min ≥ 55 |

每刀做完跑 `npx tsc --noEmit && pnpm build && bash scripts/harness/check-contract.sh`。不动锁定文件，不改 `@minigame/core` 公开 API。

### 4.5.6 dev 验证工具扩展

- `O` 键扩展为档位切换（Ultra / High / Balanced / Performance / Mobile 五档循环），方便实机 A/B
- dev overlay 多打一行 `tier=mobile rt=8bit tap=2.0`
- 保留现有 `outline mode = none` 的紧急关闭路径（合并后变成 shader uniform `uOutlineAlpha = 0`）

### 4.5.7 风险登记

| 风险 | 缓解 |
|---|---|
| FinalCompositePass shader 过长导致编译慢/移动端 GPU register spill | 用 `#define` 把 grade / darkcomic / outline 三段做成可编译期裁剪，移动档位不会用到的代码段直接 `#if 0` 掉 |
| sceneRT 8bit 后角色发光 / 武器特效爆白 | 实测前先 grep `bloom` / `emissive` / `intensity > 1` 区域；如有发光特效保留独立 HDR 路径，移动档关闭该特效 |
| half-res tap 在窄 mesh（栏杆类）边缘抖动 | tap scale 上限钳到 2.0；如出现明显闪烁回退到 1.5 |
| 弯曲世界关闭后水平视野感不一致 | 接受：移动档原本就是简化档，画面"平"是预期 |

---

## 5. 优先级清单（一页纸视图）

### 🔴 必做

- [ ] **阶段 1** `getQualityTier()` 总开关（前置）
- [ ] **阶段 2** 移动端 5 件 P0（DPR / Outline / Shadow / 弯曲世界 / 地面细分）
- [ ] **阶段 3.1-3.3** 桌面 OutlinePass 分级 + Shadow 分级 + 动态 DPR
- [ ] **阶段 4.1-4.4** sim tick spatial-hash 4 处接入

### 🟡 应做

- [ ] **阶段 5.1-5.4** 关卡合批 + 敌人 LOD + 背景退出 shadow
- [ ] **阶段 6.1-6.2** UI 压缩 + 清死资源（首屏体验最大杠杆）
- [ ] **阶段 7.1-7.2** `game.loaded()` + 补 colormap.png

### 🟢 可选

- [ ] 阶段 4.5-4.6 swept-AABB / weapons stats 复用
- [ ] 阶段 5.5-5.6 VFX 上限 / gameTime 跳过
- [ ] 阶段 6.3-6.6 资源压缩深度优化
- [ ] 阶段 7.3-7.4 远程 perf 快照

---

## 6. 画质档表

| 档位 | dpr 上限 | Outline（tap scale）| Shadow | 弯曲世界 | 地面 tessellate | 后处理（合并后）| 目标用户 |
|---|---:|---|---|---|---|---|---|
| **Ultra** | 2 | screenSpace 1.0 | 2048 PCFSoft | 开 | 1.8 | FinalComposite（含 darkcomic）| 独显 / 高刷 |
| **High**（默认） | 2 | screenSpace 1.0 | 2048 PCFSoft | 开 | 1.8 | FinalComposite（含 darkcomic）| 当前桌面基线 |
| **Balanced** | 动态 1~1.5 | screenSpace 1.0 | 1024 Basic | 开 | 1.8 | FinalComposite（darkcomic 可关）| 集显 / 4K 笔记本 |
| **Performance** | 1 | screenSpace 1.5 | 512 或关 | 关 | 4 | FinalComposite（无 darkcomic）| 录屏 / 低配 |
| **Mobile** | 1 | screenSpace **2.0** | 1024 Basic 或关 | 关 | 4 | FinalComposite（无 darkcomic）| iPhone / Android |

> 描边在所有档位都保留（whitebox 折角是核心表现力，inverted-hull 路线被否）。详见 §4.5。

**自动检测信号**：
- `isMobile()` (ua + `'ontouchstart' in window`) → Mobile
- 桌面默认 High
- 启动 5s benchmark 看 `perfRenderMs` 平均，>14ms 自动降到 Balanced
- 用户可在设置页手动覆盖

---

## 7. 测试矩阵 / 验收

| 场景 | 设备 | 工具 | 通过线 |
|---|---|---|---|
| 局内开局 30s | iPhone | `KubeeClient.fps.getStats()` | avg ≥ 25 fps（阶段 2 后） |
| 局内中后期 60s（武器堆叠） | iPhone | 同上 | avg ≥ 25 fps（阶段 4 后） |
| 局内开局 60s | Mac Chrome | 同上 | avg ≥ 59.5 / min ≥ 55（阶段 3 后） |
| Final Swarm / Boss 战 | Mac Chrome | 同上 + dev overlay | min ≥ 50（阶段 5 后） |
| 4K 外接屏全屏 | Mac Chrome | dev overlay `render submit` | <14 ms（阶段 3.3 动态 dpr 后） |
| late_combat（>2 min） | M3 vsync-off | `/tmp/perf-probeB.cjs` | draw <700/帧 / p50 <8 ms（阶段 4 后） |
| 连续 3 局不退出 | 任意 | Chrome Memory | destroy 后 heap 回落 |

记录时注明：**机型 / iOS 或浏览器版本 / 是否硬件加速 / 窗口分辨率 / dpr / 当前画质档 / 是否低电量模式**。

---

## 8. 诊断工具

### 8.1 Dev Perf Overlay（仅 DEV 构建）

1. `pnpm dev` 进入局内
2. 按 **`` ` ``**（Backquote）开启左下角面板
3. 关注字段：

| 字段 | 含义 |
|---|---|
| `FPS` | 瞬时帧率（0.25s 采样） |
| `Draw` | 本帧 WebGL draw calls |
| `Tris` | 三角形数（千） |
| `Enemies → draws` | 敌人数 vs 子网格 draw |
| `merge tex→ / sig→` | 按贴图 / 材质签名可合并数 |
| `real draws (frustum)` | 视锥内分类：enemy / shadow / level / other |
| `+post` | 后处理 + shadow map 额外 draw |
| `outline` | `screenSpace` / `none` |
| `render: Xms (submit)` | CPU 端提交耗时 EMA，**>16.6 即危险** |

**O 键** 切换描边模式（A/B 验证 OutlinePass 收益）。

### 8.2 Chrome DevTools

| 工具 | 用途 |
|---|---|
| Performance | 录制 10s，看 Main thread vs GPU raster |
| Rendering → FPS meter | 快速目视帧率 |
| Memory | 长对局是否泄漏（destroy 后回落） |
| Sensors → CPU throttling | 4× slowdown 模拟低配桌面，验证分级策略 |

### 8.3 KubeeClient（duko 集成）

| API | 用途 |
|---|---|
| `KubeeClient.fps.start()` | 开始 FPS 采样 |
| `KubeeClient.fps.getStats()` | avg / min / max / frameTime |
| `KubeeClient.getPerformanceScore()` | 综合分（对外汇报） |
| `KubeeClient.console.getStats()` | JS 错误、加载耗时 |
| `KubeeClient.perf.getSnapshot()` | 需引擎暴露 `__THREE_PERF__`（阶段 7.4） |

Studio iframe 内 FPS 会自动上报；直连 `/game/` 需手动 `fps.start()`。

### 8.4 vsync-off 实测脚本

`/tmp/perf-probeB.cjs`（Playwright headed，本地 dev 服务器）：自动点 Start Game → Confirm → 难度 → 自动选升级 → 采 idle/move/mid_combat/late_combat 四段，输出 fps / 帧时 p50/p95/p99/max / draw call mean+max / heap。

### 8.5 iPhone 远程调试

1. iPhone：**设置 → Safari → 高级 → Web 检查器** 打开
2. USB 连 Mac，Safari **开发 → [iPhone] → 游戏页**
3. Mac Web 检查器控制台执行 §1.4 一键导出脚本

**局域网注意**：Mac 与 iPhone 须同网段才能 `http://<Mac IP>:5193/game/`。跨网段用 iPhone 热点或 cloudflared/ngrok 隧道。

---

## 9. 相关代码索引

| 模块 | 文件 |
|---|---|
| 渲染主循环 | `game/client/source/index.ts` → `animate()` `5844-5940` / `renderFrame()` `4554-4563` |
| 后处理 | `index.ts` → `setupComposer()` `4518-4551` |
| 描边 Pass | `index.ts` → `SceneOutlinePass` (~`2138`) |
| 光照 / 阴影 | `index.ts` → `setupLighting()` `4393-4436` |
| 弯曲世界 | `index.ts` → `onBeforeCompile` patch (~`139`) |
| 地面 / 关卡 | `index.ts` → `setupGround()` / `tryLoadLevel()` |
| 敌人渲染 | `index.ts` → `renderEnemies()` |
| Instancing | `index.ts` → `setupProjectileMesh()` 等 |
| Blob 阴影 | `game/client/source/systems/blobShadows.ts` |
| Perf Overlay | `index.ts` → `setupPerfStats()` |
| 高 DPI | `packages/render-adapter/source/three.ts` |
| 像素比 | `packages/platform/source/display.ts` |
| Spatial Hash | `game/core/source/spatial-hash.ts` |
| 待接入 spatial-hash 的系统 | `game/core/source/systems/{areaEffects,pickups,collisions,spawning,projectiles}.ts` |
| 资源体积优化 | `docs/art-assets-todo.md` §14 |
| 移动端清单（历史） | `docs/mobile-performance.md` |
| 桌面清单（历史） | `docs/desktop-performance.md` |

---

## 10. 修订记录

| 日期 | 说明 |
|---|---|
| 2026-06-18 | v1：合并 mobile-performance.md + desktop-performance.md + art-assets-todo §14-15 + 静态扫描 + vsync-off 实测，统一为单一入口；旧文档保留作历史归档 |
| 2026-06-20 | v1.1：核实 SceneOutlinePass 实际开销（1× 场景 + 4 全屏 blit，原"2× 场景几何"表述偏差已修正）；新增 §4.5 移动端保留描边方案（FinalCompositePass 合 4→1 + shader 内放大 tap 间距），inverted-hull 路线因 whitebox 折角描边丢失被否；§4 阶段 2.2 / 3.1 / 3.4 / 3.5 收敛至 §4.5；§6 画质档表 Outline 列更新（全档保留 screenSpace，移动 tapScale=2.0） |
