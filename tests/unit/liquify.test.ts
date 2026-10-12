import { describe, it, expect } from 'vitest';
import { buildLiquify, minJacobian, sampleGrid, type LiquifyStroke, type LiquifyMode } from '../../src/core/liquify';

const W = 1000, H = 800, cell = 8;
const stroke = (mode: LiquifyMode, strength = 100): LiquifyStroke => ({ mode, strength, r: 60, pts: mode === 'push' ? [{ x: 300, y: 300 }, { x: 360, y: 320 }, { x: 420, y: 330 }, { x: 470, y: 400 }] : [{ x: 300, y: 300 }, { x: 330, y: 310 }] });
describe('liquify', () => {
  it('M_warp_min_jacobian at 100% for every mode and a heavy overlapping stack', () => {
    for (const mode of ['push', 'pucker', 'bloat', 'reconstruct'] as LiquifyMode[]) expect(minJacobian(buildLiquify([stroke(mode)], 0, 0, W, H, cell)!), mode).toBeGreaterThanOrEqual(0.29);
    const stack = (['push', 'bloat', 'push', 'pucker', 'push', 'bloat'] as LiquifyMode[]).map((m) => stroke(m));
    expect(minJacobian(buildLiquify(stack, 0, 0, W, H, cell)!)).toBeGreaterThanOrEqual(0.29);
  });
  it('M_warp_unchanged_far_px: exactly zero beyond brush radius of every stroke', () => {
    const g = buildLiquify([stroke('push'), stroke('bloat')], 0, 0, W, H, cell)!;
    for (let x = 0; x < W; x += 5) for (let y = 0; y < H; y += 5) {
      const P = [[300, 300], [360, 320], [420, 330], [470, 400]], dseg = (a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)); };
      const near = P.slice(1).some((q, i) => dseg(P[i], q) <= 60 + cell * 2);
      if (!near) { const [bx, by] = sampleGrid(g, x, y); expect(bx).toBe(0); expect(by).toBe(0); }
    }
  });
  it('push drags content along the stroke direction (backward map points against it)', () => {
    const g = buildLiquify([{ mode: 'push', strength: 60, r: 60, pts: [{ x: 300, y: 300 }, { x: 380, y: 300 }] }], 0, 0, W, H, cell)!;
    const [bx] = sampleGrid(g, 340, 300); expect(bx).toBeLessThan(0);
  });
  it('bloat samples from nearer the centre, pucker from farther; reconstruct shrinks the field', () => {
    const b = buildLiquify([{ mode: 'bloat', strength: 80, r: 60, pts: [{ x: 300, y: 300 }] }], 0, 0, W, H, cell)!, p = buildLiquify([{ mode: 'pucker', strength: 80, r: 60, pts: [{ x: 300, y: 300 }] }], 0, 0, W, H, cell)!;
    expect(sampleGrid(b, 330, 300)[0]).toBeLessThan(0); expect(sampleGrid(p, 330, 300)[0]).toBeGreaterThan(0);
    const base = stroke('push'), rec = buildLiquify([base, { mode: 'reconstruct', strength: 100, r: 80, pts: [{ x: 360, y: 320 }] }], 0, 0, W, H, cell)!, only = buildLiquify([base], 0, 0, W, H, cell)!;
    const at = (g: ReturnType<typeof buildLiquify>) => Math.hypot(...sampleGrid(g!, 360, 320));
    expect(at(rec)).toBeLessThan(at(only));
  });
  it('is deterministic', () => {
    const a = buildLiquify([stroke('push'), stroke('pucker')], 0, 0, W, H, cell)!, b = buildLiquify([stroke('push'), stroke('pucker')], 0, 0, W, H, cell)!;
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});
