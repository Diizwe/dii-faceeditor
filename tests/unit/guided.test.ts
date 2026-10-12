import { describe, it, expect } from 'vitest';
import { guidedFilter } from '../../src/core/guided';

describe('guided filter', () => {
  const w = 120, h = 40;
  // image: dark left half, bright right half; true edge at x = 60. Raw alpha: same step but displaced by 5 px and blurred.
  const guide = new Float32Array(w * h), raw = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { guide[y * w + x] = x < 60 ? 0.2 : 0.8; const d = x - 65; raw[y * w + x] = Math.min(1, Math.max(0, 0.5 + d / 8)); }
  const edgePos = (a: Float32Array) => { for (let x = 0; x < w; x++) if (a[20 * w + x] >= 0.5) return x; return -1; };
  it('moves a displaced alpha edge onto the image edge (edge-adherence gain)', () => {
    const out = guidedFilter(guide, raw, w, h, 16, 1e-4);
    expect(Math.abs(edgePos(raw) - 60)).toBeGreaterThanOrEqual(4);
    expect(Math.abs(edgePos(out) - 60)).toBeLessThan(Math.abs(edgePos(raw) - 60)); // relative gain; a displaced mask cannot be fully recovered
  });
  it('stays within 0..1 and leaves flat regions alone', () => {
    const out = guidedFilter(guide, raw, w, h, 8, 1e-3);
    for (const v of out) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(out[20 * w + 2]).toBeLessThan(0.05); expect(out[20 * w + 117]).toBeGreaterThan(0.95);
  });
  it('is deterministic', () => { expect(Array.from(guidedFilter(guide, raw, w, h, 6, 1e-3))).toEqual(Array.from(guidedFilter(guide, raw, w, h, 6, 1e-3))); });
});
