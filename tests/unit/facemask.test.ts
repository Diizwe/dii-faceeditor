import { describe, it, expect } from 'vitest';
import { FACE_OVAL, EYE_L, EYE_R, LIPS_OUTER, BROW_L, BROW_R, NOSTRILS, regions } from '../../src/core/facemask';
describe('facemask', () => {
  it('index lists stay inside the 468-point mesh and have no duplicates', () => {
    for (const l of [FACE_OVAL, EYE_L, EYE_R, LIPS_OUTER, BROW_L, BROW_R, NOSTRILS]) { expect(Math.max(...l)).toBeLessThan(468); expect(new Set(l).size).toBe(l.length); }
  });
  it('regions returns one skin polygon and six holes', () => {
    const mesh = Array.from({ length: 468 }, (_, i) => [i, i * 2, 0] as [number, number, number]);
    const r = regions(mesh); expect(r.skin.length).toBe(1); expect(r.holes.length).toBe(6);
  });
});
