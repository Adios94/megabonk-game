# Three.js 3D Template - AI Guide

This project is an **AI-facing web game template**, not a fully built production game.

The delivery target is still **one browser game**. The workspace layout exists only to keep a few reusable capabilities decoupled:

- `game/core/` holds shared gameplay state and rules
- `game/client/` holds Three.js rendering and input
- `packages/i18n` holds the lightweight i18n runtime and Vite plugin
- `packages/platform` holds cross-platform input helpers
- `packages/render-adapter` holds shared display-scaling helpers

Treat this as **single-product delivery with a small internal monorepo layout**, not as several independently shipped apps.

## What To Modify First

Most changes should happen here:

- `game/core/source/config.ts`
- `game/core/source/GameInstance.ts`
- `game/core/source/types.ts`
- `game/client/source/index.ts`
- `i18n/en.json`
- `i18n/zh.json`

Usually you should **not** need to change `packages/` unless you are extending shared infrastructure.

## Working Rules

Keep these rules simple:

1. Build gameplay in `game/core/source/` and render it from `game/client/source/index.ts`.
2. Keep user-visible text in `i18n/*.json` and read it with `t()`.
3. Prefer `@minigame/platform` for input so desktop and mobile stay aligned.
4. Keep the template easy for the next AI pass to read and extend.

## Project Shape

```text
threejs-3d/
├── index.html
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── vite.config.ts
├── i18n/
├── game/
│   ├── core/
│   │   └── source/
│   └── client/
│       ├── main.ts
│       └── source/
│           ├── index.ts
│           └── session/
└── packages/
    ├── i18n/
    ├── platform/
    └── render-adapter/
```

## Responsibilities

- `game/core/source/GameInstance.ts`: gameplay loop, scoring, and state updates.
- `game/core/source/config.ts`: tunable constants such as map size and win score.
- `game/client/source/index.ts`: Three.js scene, input handling, camera, and HUD.
- `game/client/main.ts`: bootstrap i18n and game start.
- `packages/i18n/`: translation runtime and build-time helper.
- `packages/platform/`: unified desktop/mobile input abstraction.
- `packages/render-adapter/`: shared display-scaling helpers for Three.js.

## i18n Guidance

All player-facing text should go through `@minigame/i18n`.

Example:

```ts
import { t } from '@minigame/i18n'

t('hud.goal', { score: String(score) })
```

When adding a key, update both:

- `i18n/en.json`
- `i18n/zh.json`

## Input Guidance

Use `PlatformInput` unless you have a strong reason not to.

```ts
const platformInput = new PlatformInput({
  mode: 'joystick',
  canvas: this.renderer.domElement,
})
```

The template already shows the intended pattern:

- mobile uses virtual controls through `@minigame/platform`
- desktop merges keyboard input in the game loop

## Engine Import Rules

Three.js requires a **namespace import**:

```ts
import * as THREE from 'three'
```

Do not use named imports. `import { Scene } from 'three'` will fail at runtime.

## Game Object Naming

All Three.js objects should have explicit `.name` values:

```ts
group.name = `Player_${player.id}`
mesh.name = `Collectible_${c.id}`
floor.name = 'Ground_Floor'
```

## Template Mindset

This repository is optimized for:

- fast iteration
- AI readability
- easy extension from a minimal playable example

It is not trying to pre-solve every production concern. Avoid turning the guide into a heavy process document unless the template genuinely needs that constraint.
