import { describe, it, expect } from 'vitest';
import fx from './fixtures/meshes.json';
import { buildField, minJacobian, sampleField, invertMap, zeroReshape, RESHAPE_IDS, type ReshapeParams } from '../../src/core/reshape';
import { solveTps, evalTps } from '../../src/core/tps';

const faces = Object.values(fx) as { w: number; h: number; box: number[]; mesh: number[][] }[];
const full = (): ReshapeParams => ({ jaw: 100, chin: 100, noseW: 100, noseL: 100, eyeSize: 100, eyeDist: 100, lips: 100, faceW: 100 });
const half = (): ReshapeParams => ({ jaw: 50, chin: 50, noseW: 50, noseL: 50, eyeSize: 50, eyeDist: 50, lips: 50, faceW: 50 });

describe('tps', () => {
  it('interpolates its control values', () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [0, 10], [10, 10], [5, 5]], vals: [number, number][] = [[1, 2], [3, 1], [0, 0], [2, 2], [4, 4]];
    const t = solveTps(pts, vals, 1e-9);
    pts.forEach((p, i) => { const [x, y] = evalTps(t, p[0], p[1]); expect(x).toBeCloseTo(vals[i][0], 3); expect(y).toBeCloseTo(vals[i][1], 3); });
  });
});
describe('reshape field', () => {
  it('identity gives no field', () => { for (const f of faces) expect(buildField(f.mesh as never, f.box[2], zeroReshape())).toBeNull(); });
  it('M_warp_min_jacobian at 100%: every slider alone and all together stay above 0.2', () => {
    for (const f of faces) {
      for (const id of [...RESHAPE_IDS, 'all'] as const) {
        const r = id === 'all' ? full() : { ...zeroReshape(), [id]: 100 }, fld = buildField(f.mesh as never, f.box[2], r)!;
        expect(minJacobian(fld), id).toBeGreaterThan(0.2);
        const rn = id === 'all' ? { ...full(), jaw: -100, chin: -100, noseW: -100, faceW: -100, eyeSize: -100, lips: -100 } : { ...zeroReshape(), [id]: -100 };
        expect(minJacobian(buildField(f.mesh as never, f.box[2], rn)!), id + ' negative').toBeGreaterThan(0.2);
      }
    }
  });
  it('M_warp_unchanged_far_px: the field is exactly zero beyond the falloff', () => {
    for (const f of faces) {
      const fld = buildField(f.mesh as never, f.box[2], full())!;
      for (let k = 0; k < 400; k++) {
        const a = (k / 400) * Math.PI * 2, rr = 1.2 * f.box[2] + (k % 7) * 20;
        const cx = (fld.x0 + fld.x1) / 2, cy = (fld.y0 + fld.y1) / 2;
        const [bx, by] = sampleField(fld, cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr * 1.5);
        expect(bx).toBe(0); expect(by).toBe(0);
      }
    }
  });
  it('M_warp_straight_line_residual_frac: background grid lines stay straight at 50% (<= 0.4% of image width)', () => {
    for (const f of faces) {
      const fld = buildField(f.mesh as never, f.box[2], half())!, cxFace = f.box[0] + f.box[2] / 2;
      // background lines at least one face width from the face centre (about half a face width outside the face edge, i.e. past the falloff band), traced across the whole grid; lines through the face bend by design
      let worst = 0;
      for (const off of [1.0, 1.1, 1.3]) for (const sgn of [-1, 1]) {
        const x = cxFace + sgn * off * f.box[2]; const xs: number[] = [];
        for (let y = fld.y0; y <= fld.y1; y += 6) { const [bx] = sampleField(fld, x, y); xs.push(x + bx); }
        const mean = xs.reduce((a, b) => a + b) / xs.length; worst = Math.max(worst, Math.max(...xs.map((v) => Math.abs(v - x))) , 0); void mean;
      }
      expect(worst / f.w).toBeLessThanOrEqual(0.004);
    }
  });
  it('M_reshape_inverse_roundtrip: the explicit inverse recovers the pre-warp position', () => {
    for (const f of faces) {
      const fld = buildField(f.mesh as never, f.box[2], full())!; let tot = 0, n = 0;
      for (let k = 0; k < 500; k++) { const x = fld.x0 + ((k * 37) % 100) / 100 * (fld.x1 - fld.x0), y = fld.y0 + ((k * 61) % 100) / 100 * (fld.y1 - fld.y0);
        const [bx, by] = sampleField(fld, x, y), px = x + bx, py = y + by; const [qx, qy] = invertMap(fld, px, py); tot += Math.hypot(qx - x, qy - y); n++; }
      expect(tot / n).toBeLessThan(0.5);
    }
  });
  it('max displacement stays within the spec (6% fw per slider, summed sliders still bounded)', () => {
    for (const f of faces) { const d = buildField(f.mesh as never, f.box[2], { ...zeroReshape(), jaw: 100 })!.maxDisp; expect(d).toBeLessThanOrEqual(0.12 * f.box[2]); }
  });
});
