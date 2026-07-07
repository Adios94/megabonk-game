# MegaBonk · Godot 4 版本

3D 类幸存者 / 类 Vampire Survivors，从原 Three.js 版本完整迁移到 Godot。

## 状态

**早期骨架** — 项目刚从 Three.js 迁到 Godot 4.x + GDScript。所有 gameplay 代码在重写中。

## 环境要求

- Godot 4.3+（Standard 版本，不需要 .NET）
- Git

## 打开项目

```bash
godot -e project.godot   # 或 Godot Editor 里 Import 这个目录
```

主场景：`scenes/main.tscn`

## 目录结构

```
scenes/          Godot 场景 (.tscn)
  entities/      玩家、敌人、投射物、拾取物
  ui/            HUD、菜单、升级卡
scripts/         GDScript
  autoload/      单例 (GameManager / EventBus / SaveGame)
  entities/      挂在场景节点上的行为脚本
  systems/       独立子系统 (spawner / economy / i18n adapter)
  data/          数据表 (武器 / 敌人 / 升级 / 波次)
assets/          Godot import 后的运行时素材
  models/ textures/ audio/ fonts/ ui/
public/          迁移自 Three.js 版本的原始素材 —— 参考用，按需重导入到 assets/
i18n/            en.json / zh.json —— 与旧版共享文案，通过运行时 adapter 加载
docs/            原 Three.js 版本的设计与契约文档，作为规格参考
```

## 从 Three.js 版本迁移过来的资源

- `public/models/` — GLTF 角色 / 敌人 / 关卡白盒。Godot 原生支持 `.glb`；Draco 压缩的会由 Godot 内置 importer 自动处理。
- `public/textures/` — VFX 与 baseColor。webp/png 都能直接 import。
- `public/audio/` — 音乐 / SFX。ogg / wav 直用；mp3 建议转 ogg。
- `public/ui/` — HUD 图片，可用作 Sprite2D / TextureButton 底图。
- `i18n/*.json` — 文案，通过 `scripts/systems/i18n.gd` 载入（待写）。

## 参考旧版本

原 Three.js + TypeScript 代码在分支 `stable` / `main`（迁移之前的 commit）。设计文档、GDD、平衡数值在 `docs/`。

## 提交前

- 编辑器里能开工程无红字
- 主场景能 F5 运行
- 提交请 squash 掉无关的 `.godot/` cache 变动

## 契约

原版有严格的锁定文件契约（见 `docs/contract.md`），Godot 版本**没有**沿用 —— 项目还在骨架阶段，等 gameplay 稳定后再定。
