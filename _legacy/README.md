# Legacy 资产 / 历史快照归档

> 本目录用于收纳 **不再随产品打包、但仍需保留版本历史** 的内容。Vite 构建不会引用此目录，发布体积不受影响。

## 目录说明

### `ui-archive/`

> 来源：原仓库根 `archive/`（2026-06-20 移入）。

旧版 UI 资源快照，主要是 SVG 设计文件（含 Figma 默认导出名）。运行时 UI 已切换到 `public/ui/`，本目录仅作历史比对参考。**可删除**（如确认未来不再需要回滚 UI 设计）。

子目录：

- `ui/bar/` — 老版血条/护盾/经验/任务条 SVG
- `ui/button/` — 按钮设计
- `ui/icon/` — 图标
- `ui/panel/` — 面板背景
- `ui/quests/` — 任务面板
- `ui/shop/svg/` — 商店面板（含 `Status=Completed.svg` 等 Figma 默认名，未做语义化重命名）

### `assets-archive/`

> 来源：原仓库根 `assets-archive/`（2026-06-20 移入）。

3D / 2D 资产冷存储 + 工作流原始素材。仅 blender 脚本和文档引用，**运行时不依赖**。

子目录：

- `models/` — KayKit 原始素材（`_kaykit-original/`）+ 已替换或未启用的 GLB / OBJ。被 [scripts/blender/merge-kaykit.py](../scripts/blender/merge-kaykit.py) 用作合并源；由 [scripts/assets/optimize-chest.mjs](../scripts/assets/optimize-chest.mjs) 用作宝箱贴图源。
- `models-pre-draco/` — 跑 [scripts/assets/draco-compress-all.mjs](../scripts/assets/draco-compress-all.mjs) **之前**的全量 GLB 备份，用于回滚 Draco 压缩。可删除（一旦 Draco 验证完毕）。
- `textures/` — 替换前的旧版贴图
- `ui/_unused/` — 已弃用的 UI 立绘 / 标题图（角色头像、final_swarm 中英文对照等），保留以备复用
- `fonts/_unused/` — 弃用字体源文件

## 引用本目录的脚本

更名时务必同步：

- [scripts/blender/merge-kaykit.py](../scripts/blender/merge-kaykit.py) → `_legacy/assets-archive/models/_kaykit-original`
- [scripts/blender/diag-transforms.py](../scripts/blender/diag-transforms.py)
- [scripts/blender/compare-bone-positions.py](../scripts/blender/compare-bone-positions.py)
- [scripts/blender/check-bones-deform.py](../scripts/blender/check-bones-deform.py)
- [scripts/assets/optimize-chest.mjs](../scripts/assets/optimize-chest.mjs)
- [scripts/assets/draco-compress-all.mjs](../scripts/assets/draco-compress-all.mjs)（注释说明）
- [docs/code-redundancy-audit.md](../docs/code-redundancy-audit.md)（历史叙述）

## 清理建议

| 子目录 | 体积 | 可否删除 |
|---|---|---|
| `ui-archive/` | ~0.25 MB | 视觉已替换，长期可全删 |
| `assets-archive/models-pre-draco/` | ~25 MB | 一旦 Draco 验证稳定可删（git 仍保留历史） |
| `assets-archive/models/_kaykit-original/` | ~30 MB | blender 合并工作流仍依赖，保留 |
| `assets-archive/ui/_unused/` | ~17 MB | 暂留作美术复用素材池 |
| `assets-archive/_kaykit-original` 之外的 `models/` | 视情况 | 未启用立绘/旧 boss 模型，可逐项核对后清 |

如需进一步压缩仓库体积，考虑迁出仓库（云盘）或启用 Git LFS。
