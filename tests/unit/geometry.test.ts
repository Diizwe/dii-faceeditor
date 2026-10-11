import { describe, it, expect } from 'vitest';
import { identityGeometry, outToSource, apply, outputSize, isInside, fitCrop, type Geometry } from '../../src/core/geometry';

const W = 400, H = 300;
describe('geometry', () => {
  it('identity maps output to source 1:1', () => {
    const g = identityGeometry();
    const [w, h] = outputSize(g, W, H);
    expect([w, h]).toEqual([W, H]);
    const m = outToSource(g, W, H, w, h);
    expect(apply(m, 10, 20)).toEqual([10, 20]);
  });
  it('rot90 swaps size and rotates clockwise', () => {
    const g: Geometry = { ...identityGeometry(), rot90: 1 };
    const [w, h] = outputSize(g, W, H);
    expect([w, h]).toEqual([H, W]);
    const m = outToSource(g, W, H, w, h);
    const [x, y] = apply(m, 0, 0);
    expect(x).toBeCloseTo(0); expect(y).toBeCloseTo(H);
    const [x2, y2] = apply(m, w, 0);
    expect(x2).toBeCloseTo(0); expect(y2).toBeCloseTo(0);
  });
  it('rot90 sizes', () => {
    expect(outputSize({ ...identityGeometry(), rot90: 3 }, W, H)).toEqual([H, W]);
    expect(outputSize({ ...identityGeometry(), rot90: 2 }, W, H)).toEqual([W, H]);
  });
  it('flipH mirrors x', () => {
    const m = outToSource({ ...identityGeometry(), flipH: true }, W, H, W, H);
    expect(apply(m, 0, 5)).toEqual([W, 5]);
  });
  it('flipV mirrors y', () => {
    const m = outToSource({ ...identityGeometry(), flipV: true }, W, H, W, H);
    expect(apply(m, 7, 0)).toEqual([7, H]);
  });
  it('straightened crop stays inside the image for many angles and aspects', () => {
    for (const rot90 of [0, 1, 2, 3] as const)
      for (const angle of [-45, -20, -3, 0, 7, 33, 45])
        for (const aspect of [null, 1, 0.8, 0.75, 9 / 16, 16 / 9])
          expect(isInside({ ...identityGeometry(), rot90, angle, aspect }, W, H)).toBe(true);
  });
  it('fitCrop at zero angle with free aspect is the whole image', () => {
    const f = fitCrop(W, H, 0, null);
    expect(f.w).toBeCloseTo(W); expect(f.h).toBeCloseTo(H);
  });
  it('scaling output size scales sampling', () => {
    const m = outToSource(identityGeometry(), W, H, W / 2, H / 2);
    expect(apply(m, 10, 10)).toEqual([20, 20]);
  });
});
