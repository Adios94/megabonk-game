# MegaBonk · Godot 4 版本

> ⚠️ 分支 `godot`：从 Three.js 完整迁移到 Godot 4.x + GDScript。旧代码在 `main`/`stable`。

## 项目定位

- 引擎：Godot 4.3+ Standard（GDScript，不用 .NET/C#）
- 目标平台：PC (Windows/Mac/Linux)
- 游戏类型：3D 类幸存者 / 类 Vampire Survivors
- 主场景：`scenes/main.tscn`

## 目录约定

| 目录 | 用途 |
|---|---|
| `scenes/` | `.tscn` 场景 |
| `scenes/entities/` | 玩家、敌人、投射物、拾取物场景 |
| `scenes/ui/` | HUD、菜单、升级卡 |
| `scripts/autoload/` | 单例（`project.godot` 里注册） |
| `scripts/entities/` | 场景节点的行为脚本 |
| `scripts/systems/` | 独立子系统（spawner / economy / i18n adapter） |
| `scripts/data/` | `.gd` 或 `.tres` 数据表 |
| `assets/` | 已 import 到 Godot 的运行时素材 |
| `public/` | 旧版 Three.js 时代的**原始**素材，参考用，需要时再 import 到 `assets/` |
| `i18n/` | `en.json` / `zh.json`，两文件必须同步键 |
| `docs/` | 旧版设计文档，作为需求规格 |

## 迁移原则

- **不复用**：TS/JS 逻辑、Vite/Vitest/pnpm 生态、Three.js material/shader 代码 —— 全部重写为 GDScript。
- **可复用**：GLTF 模型、纹理、音频、字体、UI 图、i18n JSON、`docs/` 里的数值与设计。
- **旧契约不沿用**：`docs/contract.md` 里的锁定文件规则针对 TS monorepo，Godot 版本没有对应结构。等 gameplay 稳定再定新契约。

## 常见改动前的检查

1. 改 `i18n/*.json` → **en 和 zh 必须同步键**（这条从旧版沿用）。
2. 加素材 → 放 `assets/<类别>/`，让 Godot 自动生成 `.import`。原始素材要留档就往 `public/` 放。
3. 加单例 → 写在 `scripts/autoload/`，然后在 `project.godot` 的 `[autoload]` 段注册。
4. 加数据表 → 优先用 `Resource` 子类（`.tres`）而不是散落 JSON。

## 运行

```bash
godot -e project.godot        # 打开编辑器
godot --headless --check-only # 校验脚本无语法错
```

编辑器里 F5 运行主场景。

## 参考旧版

设计规格：`docs/design.md`、`docs/index.html`（原契约页现已不适用）。
数值/内容：`docs/` 与旧版分支 `main`。
