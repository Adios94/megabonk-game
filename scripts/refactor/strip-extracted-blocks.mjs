// One-shot script: remove extracted code blocks from game/client/source/index.ts
// after their content has been moved to materials/toon.ts and materials/postProcessPasses.ts.
//
// Each entry below specifies a unique "anchor" line (must appear exactly once)
// and a "stop" line (must appear exactly once, AFTER the anchor). The script
// removes [anchorIdx, stopIdx) — i.e. keeps the stop line.
//
// Run from repo root: `node scripts/refactor/strip-extracted-blocks.mjs`

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('game/client/source/index.ts');
let lines = readFileSync(file, 'utf8').split(/\r?\n/);

const removals = [
  {
    label: 'Toon section (constants → STYLIZED_TOON_GLSL → applyStylizedToonShading)',
    fromStartsWith: '// Toon/Cel-Shading Utilities',
    /** stop must be the FIRST line AFTER the block to drop. */
    untilStartsWith: '/**',
    /** Disambiguate: stop must be followed by this within 1 line. */
    untilNextContains: '游戏内风格化调参面板',
  },
  {
    label: 'Outline + SceneOutlinePass',
    fromStartsWith: '/**',
    fromNextContains: '描边模式：',
    untilStartsWith: '/**',
    untilNextContains: '末端调色 pass',
  },
  {
    label: 'GRADE_* constants (keep WEATHER_*)',
    fromStartsWith: '/**',
    fromNextContains: '末端调色 pass',
    untilStartsWith: 'const WEATHER_DAY_EXPOSURE',
  },
  {
    label: 'ColorGradePass class',
    fromStartsWith: 'class ColorGradePass extends Pass {',
    untilStartsWith: '/**',
    untilNextContains: '末端"暗黑漫画"',
  },
  {
    label: 'DarkComicPass jsdoc + class',
    fromStartsWith: '/**',
    fromNextContains: '末端"暗黑漫画"',
    untilStartsWith: 'function convertToToonMaterials',
  },
  {
    label: 'convertToToonMaterials / brightenWeaponMaterials / applyChestGoldMaterials',
    fromStartsWith: 'function convertToToonMaterials',
    untilStartsWith: 'const WEAPON_ICONS:',
  },
];

function findUnique(predicate, descr) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (predicate(i)) hits.push(i);
  }
  if (hits.length === 0) throw new Error(`No match for ${descr}`);
  if (hits.length > 1) throw new Error(`Ambiguous matches (${hits.length}) for ${descr}: lines ${hits.map((n) => n + 1).join(', ')}`);
  return hits[0];
}

function predicateOf(spec, suffix = '') {
  return (i) => {
    if (!lines[i].startsWith(spec[`${suffix}StartsWith`])) return false;
    const nextContains = spec[`${suffix}NextContains`];
    if (!nextContains) return true;
    // look up to 5 lines ahead for the disambiguator
    for (let k = 1; k <= 5 && i + k < lines.length; k++) {
      if (lines[i + k].includes(nextContains)) return true;
    }
    return false;
  };
}

// Process removals in forward order so each removal's "until" anchor still
// exists when needed (lines shift, but the predicates re-scan the live array).
for (const spec of removals) {
  const from = findUnique(predicateOf(spec, 'from'), `${spec.label} (from)`);
  const until = findUnique(predicateOf(spec, 'until'), `${spec.label} (until)`);
  if (until <= from) throw new Error(`${spec.label}: until (${until + 1}) must be after from (${from + 1})`);
  console.log(`[strip] ${spec.label}: remove lines ${from + 1}..${until} (kept: ${until + 1})`);
  lines.splice(from, until - from);
}

writeFileSync(file, lines.join('\n'), 'utf8');
console.log(`[strip] done. new line count: ${lines.length}`);
