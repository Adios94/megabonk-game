# 代码冗余审计报告

> 日期：2026-06-15 · 范围：`game/core` + `game/client` + `public/` + workspace 依赖
> 方法：4 个角度并行调研（重复文件 / 死代码 / 复制粘贴 / 资源依赖）+ 1 轮人工抽样验证（关键结论已逐条核实）
> 性质：审计为只读结论；零风险 + 低风险清理项已落地（见下「落地进展」）。
>
> ⚠️ 落地任何清理前，先读 [`docs/contract.md`](./contract.md)：凡涉及 `game/core/source/index.ts` 公开导出、
> `index.html`/`vite.config.ts`/`packages/*` 等锁定文件的改动，必须走 `[CONTRACT]` 流程 + `scripts/harness/check-contract.sh`。

---

## 0. 落地进展（2026-06-15）

> 验证基线：`tsc --noEmit` ✅ · core 测试 48 文件 / 422 例全过 ✅ · `pnpm build` ✅。均未触碰锁定文件 / 公开 API。

### ✅ 已完成（零风险）

- **`public/**/_unused/` 整树移出 `public/` → 仓库根 `assets-archive/`**（74 文件 / 17.29 MB）。`git mv` 保留历史，不再进 `dist/`；发布体积 ~68 MB → ~51.6 MB。
- **删除 client 死方法 / 死字段**：`emitBlackHoleVortex`、`spawnSlideDust`、`gridLines`、`bossDeathPlayed`、`screenFlashEl`、`xpNumbers`、`consumableLabel`（含各自的创建 / 清理残留）。

### ✅ 已完成（低风险）

- **删 core 死文件 `systems/teleporters.ts`**（零引用）；清理 `GameInstance.ts`/`chests.ts` 过时注释。
- **删 core 死文件 `systems/terrain.ts`**；`terrain.test.ts` 改指 `collision.ts` 的 `getTerrainHeightAt(NEON_CRUCIBLE_GEOMETRY, …)`，保留 8 例地形高度覆盖。
- **合并 5 组字节级重复 VFX 贴图**：`flame_aura→light`、`scorch_boots→scorch`、`lightning→spark`、`slash_fill→portal_swirl`、`enemy_bullet→muzzle`（重指 key + 删副本 ~377 KB + 注释「特效分化时需放回独立文件」）。
- **删 client Legacy 渲染路径**：`weaponOrbMesh`/`MAX_WEAPON_ORBS`/`enemyMeshes` 字段、`setupWeaponOrbs`/`setupEnemyMeshes`/`renderWeaponOrbs`、构造期 setup 调用、每帧 `count=0` 清零（~120 行 + 每帧矩阵更新 + 常驻 mesh 显存）。
- **修升级 VFX 双播**：`spawnLevelUpBurst` 移除与 `emitCompensationBurst('gold')` 重复的 star+light billboard（升级星光/光柱原被画两遍）。

### ⏸️ 暂缓（中风险 / 触契约，需专项）

- **findNearest 合并 / 死导出清理**：`helpers.findNearestEnemyExcluding` 实际在用；`getCompletedQuestCount`/`spendSilver` 属 core `index.ts` 公开契约；`findNearestEnemy`/`findEnemyById` 仅测试用，删除要改测试。
- **根 `weapons.ts` 遗留**（`fireWeapon` 等）：在公开契约里，需走 `[CONTRACT]` 流程。
- **client 大件去重**（武器注册表 / Canvas 工厂 / loader 归一 / HUD 样式常量）：量大、需较多回归测试。
- **资源进一步瘦身**：UI PNG 压缩、GLTF→GLB+Draco、关卡 glb gltfpack、`tsx` 依赖删除。

---

## 1. 结论速览

| 维度 | 量级 | 风险 |
|---|---|---|
| Core 死文件 / 死模块 | 2 个死文件 + 根 `weapons.ts` ~370 行遗留 | 低（删除安全，但部分挂在锁定契约上） |
| Core 死导出 / 重复实现 | ~10 个死导出 + `findNearest` 3 份拷贝 | 低 |
| Client `index.ts` 可去重 | 约 **750–1050 行**（占该文件 7–9%）+ 多个零调用方法 | 低～中 |
| `public/` 死资源 | **17.29 MB**（占 public 约 25%）+ 5 组字节级重复贴图 ~377 KB | 零（纯归档资源） |
| 冗余依赖 | `tsx` 可删；`pixi.js`/`@eebuk/cli` 需确认 | 低～中 |

最大杠杆：**清 `_unused` 死资源（17 MB 下载体积）** 与 **删除 client 端 Legacy 渲染路径**。

---

## 2. Core 包（`game/core/source`）

### 2.1 ✅ 确定冗余（已验证）

1. **死文件 `systems/terrain.ts`** — 文件头自标 `@deprecated`，仅 `terrain.test.ts` 引用，生产代码全走 `collision.ts` 的 `getTerrainHeightAt`。
2. **死文件 `systems/teleporters.ts`** — `@deprecated` shim，全仓库**零 import**（仅 `chests.ts`/`GameInstance.ts` 注释提及），功能已拆到 `altars.ts`/`chests.ts`。
3. **根 `weapons.ts` 主体遗留**（~370 行）— `fireWeapon` / `applyBounce` / `applyGravitationalPull` 及内部私有 `findNearest*` 无任何调用点；ECS 路径已由 `systems/weapons.ts → weaponFiring.ts → behaviors/` 接管。⚠️ **注意**：这三个函数被 `index.ts` 公开 re-export（锁定契约），删除需走 `[CONTRACT]` 流程，不能直接删。文件里**仅 `updateOrbitingProjectile` 仍活跃**。
4. **死导出**：`helpers.findNearestEnemy`、`helpers.findEnemyById`、`relics.getRelicDef`、`consumables.makeConsumablePickup`、`save.getShopLevel`、`quests.getCompletedQuestCount`、`save.spendSilver`（连带 `shop.ts:5` 的无效 import）。
5. **`findNearest` 三份重复实现**：`behaviors/queries.ts`（活跃，8 个武器行为用）、`systems/helpers.ts`（基本闲置）、`weapons.ts`（已死）。建议统一到 `queries.ts`。

### 2.2 ⚠️ 疑似冗余 / 重复常量

- `RARITY_STEP_MULT`（`systems/weapons.ts`）与 `TOME_RARITY_STEP_MULT`（`tomeProgression.ts`）四档倍率 `{1.0,1.3,1.6,2.0}` **完全相同**。
- `BOSS_SPAWN_TIME` 与 `REGULAR_GAME_DURATION` 同值 540，前者生产零引用。
- `collisions.ts:35-36` 两个 `1.5` 常量（`PROJECTILE_HIT_MAX_Y_DELTA`/`PLAYER_PROJECTILE_HIT_MAX_Y_DELTA`）同值，只用后者。
- `ENEMY_RADIUS`/`CHARGE_RADIUS`/`ENEMY_SPAWN_RADIUS` 均为 `0.4`，命名分散。
- `PLAYER_HIT_CENTER_OFFSET_Y`（0.8）应复用 `combatHeight.TARGET_HIT_CENTER_OFFSET_Y`。

### 2.3 🔵 命名隐患（非冗余，但易误读）

- `collision.ts`（关卡几何/地形）vs `collisions.ts`（战斗碰撞）— 单复数差一字，职责完全不同（已核实无重复函数）。建议重命名（如 `levelGeometry.ts` / `combatCollision.ts`）。
- 根 `weapons.ts` vs `systems/weapons.ts` — 同名不同路径，前者遗留后者 ECS。
- `behaviors/`（玩家武器）vs `ai/behaviors/`（敌人 brain）— 目录名易混，职责正确。

---

## 3. Client 渲染层（`game/client/source/index.ts`，约 11520 行）

### 3.1 ✅ 确定死代码（已验证：仅有定义行，零调用）

- `emitBlackHoleVortex`（:6486）、`spawnSlideDust`（:4916）— 私有方法，从未被调用。
- 未挂载/只写不读的成员：`consumableLabel`、`xpNumbers`（创建后未 `appendChild`）、`screenFlashEl`（从未赋值）、`bossDeathPlayed`（只 reset 不读）、`gridLines`（永久 `visible=false`）。

### 3.2 ✅ 高价值可去重（收益大）

1. **Legacy 敌人 InstancedMesh 整条路径**（`setupEnemyMeshes` 3455–3517 + 每帧 `count=0` 清零）— 已不参与渲染，~70 行 + 6 个常驻 mesh 显存。
2. **Legacy Weapon Orbs**（`setupWeaponOrbs` 3444–3452 + `renderWeaponOrbs` 4503–4534）— mesh 隐藏但每帧仍跑矩阵更新，~50 行。
3. **武器 type→模型/行为 多处 switch**（`buildFloaterModel`/`renderWeaponFloaters`/`getWeaponModel`/弹丸 scale，共 4 处 ~80+ 行）— 三套映射表不一致，易出 bug，应合并为单一注册表。
4. **Canvas 程序化贴图工厂**（354–573 的 6 个 `getXxxTexture` + 金币 mote，~220 行）— 倒三角/径向渐变结构高度重复，可抽 `createCanvasTexture()`。
5. **模型加载 4 件套**（2193–2385，~190 行）— 都含 `Box3→maxDim→scale` 归一化，可抽公共函数。
6. **升级 VFX 双播**（疑似 bug 级冗余）：`spawnLevelUpBurst`（4937）与 `emitCompensationBurst('gold')`（6188）导致 star/light billboard **播两次**。

### 3.3 🟡 中/低优先去重

- 敌人 `AnimationMixer` 初始化双份（5045/5073）、`playEnemyAnim`/`playBossAnim` 可泛化为 `crossfade`。
- Sprite 池模式 4 处（~150 行）、弹丸 Map purge 三连、地面贴花 `PlaneGeometry(2,2)` 5 处。
- **武器颜色三套表**：`WEAPON_PROJECTILE_COLORS`(hex) / `WEAPON_VFX_COLORS`([r,g,b]) / `PICKUP_COLORS` 语义重叠，改 1 个颜色要改 2–3 处。
- **HUD `cssText` 重复**：全文件约 100 处内联样式，「居中 flex」「全屏 overlay」「slot 底标」等片段各重复 9+ 次，可抽 ~15–20 个 CSS 常量。

---

## 4. 静态资源（`public/`）

### 4.1 ✅ 确定可剥离（已验证）

- **全部 `_unused/` 子目录 = 17.29 MB / 74 文件**（占 public 约 25%），Vite 原样打进 `dist/`，即玩家白下载量：
  - `models/_unused` 13.79 MB · `ui/_unused` 2.42 MB（单个「副本(2).png」）· `models/items/_unused` 0.23 MB · `monsters/_unused` 0.45 MB · `textures/_unused` 0.40 MB。
  - **建议**：整树移出 `public/`（如挪到仓库根 `assets-archive/`），Git 保留但不再进 dist。
- **5 组字节级重复 VFX 贴图**（MD5 已核验完全一致，~377 KB）：
  - `light.png`=`flame_aura.png`、`scorch.png`=`scorch_boots.png`、`spark.png`=`lightning.png`、`muzzle.png`=`enemy_bullet.png`、`portal_swirl.png`=`slash_fill.png`。两键都被 `index.ts` 引用，需先在代码里合并引用再删文件。

### 4.2 ⚪ 在用但属优化项（非删除）

- `level_whitebox.glb` + `_col.glb` ≈ 7.89 MB，whitebox 关卡异常大，建议 gltfpack 瘦身（已在 `art-assets-todo.md §14` 记录）。
- 活跃区资源引用干净，未发现大块游离死文件（`.mtl`/`.bin`/glTF sidecar 贴图均为间接依赖）。

---

## 5. 依赖

| 依赖 | 位置 | 判定 |
|---|---|---|
| `tsx` | 根 devDep | **确定可删** — 源码/scripts/CI 零引用 |
| `@eebuk/cli` | 根 dep | **需确认** — KUBEE 发布工具链，非运行时 |
| `pixi.js` | render-adapter | **需确认** — 当前 Three 游戏未走 Pixi 路径，但删会破坏适配层导出契约 |
| `three`(render-adapter) | render-adapter dep | **需确认** — 仅类型化，可降 peerDep（动 package 触契约） |
| `gsap`/`miniplex`/`vitest`/`rollup-plugin-visualizer` | 各包 | 在用，非冗余 |

---

## 6. 建议的处理优先级

| 顺序 | 动作 | 收益 | 风险 | 是否碰契约 |
|---|---|---|---|---|
| 1 | `public/**/_unused/` 移出 public | −17.3 MB 下载 | 零 | 否 |
| 2 | 删 client 死方法/死字段（`emitBlackHoleVortex` 等） | 代码整洁 | 零 | 否 |
| 3 | 删 client Legacy 渲染路径（敌人 InstancedMesh + weapon orbs） | −120 行 + 显存/每帧开销 | 低 | 否 |
| 4 | 合并 5 组重复 VFX 贴图引用 + 删副本 | −377 KB | 低（改 index.ts 映射） | 否 |
| 5 | 删 core 死文件 `terrain.ts`/`teleporters.ts` + 死导出 | 代码整洁 | 低（注意改测试） | 否 |
| 6 | 统一 `findNearest` / 重复常量 | 维护性 | 低 | 否 |
| 7 | 抽 client 武器注册表 / Canvas 工厂 / loader / HUD 样式常量 | −600+ 行 | 中（量大需测试） | 否 |
| 8 | 删 `tsx`；确认 `@eebuk/cli`/`pixi.js` | 依赖瘦身 | 中 | 部分触 package |
| — | 修升级 VFX 双播 | 行为修正 | 低 | 否 |
| — | 剥离根 `weapons.ts` 遗留 | −370 行 | **高** | **是**（`fireWeapon` 等在公开契约） |

> ⚠️ 所有 `game/core/source/index.ts` 公开导出（`fireWeapon` 等）、`packages/*` 的 package.json 都属**锁定契约**，清理需走 `[CONTRACT]` Issue + `scripts/harness/check-contract.sh`。其余均在自由区，可直接动手。

---

## 7. 复现命令（Windows PowerShell）

```powershell
# _unused 各目录体积
Get-ChildItem "public" -Recurse -Directory -Filter "_unused" |
  ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Path=$_.FullName; MB=[math]::Round($s/1MB,2) }
  }

# 校验 VFX 贴图字节级重复
$pairs = @(@('light.png','flame_aura.png'),@('scorch.png','scorch_boots.png'),
           @('spark.png','lightning.png'),@('muzzle.png','enemy_bullet.png'),
           @('portal_swirl.png','slash_fill.png'))
foreach ($p in $pairs) {
  $a = Get-FileHash "public\textures\vfx\$($p[0])" -Algorithm MD5
  $b = Get-FileHash "public\textures\vfx\$($p[1])" -Algorithm MD5
  Write-Output "$($p[0]) <=> $($p[1]) : $($a.Hash -eq $b.Hash)"
}
```
