/**
 * shrines.generateShrines 单元测试。
 */
import { describe, expect, it } from 'vitest';
import { SHRINE_COUNT } from '../../config.ts';
import { generateShrines } from '../shrines.ts';
import { makeEngine } from './_fixtures.ts';

describe('generateShrines', () => {
  it('无关卡时生成固定数量的程序化神殿', () => {
    const shrines = generateShrines(makeEngine().config);
    expect(shrines).toHaveLength(SHRINE_COUNT);
    expect(shrines.every(shrine => shrine.phase === 'charging')).toBe(true);
  });

  it('关卡模式从 chestSpawns 固定选四角和中心 5 个点', () => {
    const expected = [
      { x: -100, y: 1, z: -100 },
      { x: -100, y: 2, z: 100 },
      { x: 100, y: 3, z: -100 },
      { x: 100, y: 4, z: 100 },
      { x: 0, y: 5, z: 0 },
    ];
    const config = makeEngine().config;
    config.level = {
      collisionRects: [],
      walls: [],
      climbVolumes: [],
      ramps: [],
      spawnPoints: {},
      chestSpawns: [
        ...expected,
        ...Array.from({ length: 20 }, (_, i) => ({ x: -50 + i * 5, y: 0, z: 30 })),
      ],
    };

    const shrines = generateShrines(config);
    expect(shrines).toHaveLength(5);
    expect(shrines.map(shrine => ({ x: shrine.x, y: shrine.y, z: shrine.z }))).toEqual(expected);
    expect(shrines.every(shrine => shrine.phase === 'charging')).toBe(true);
  });
});
