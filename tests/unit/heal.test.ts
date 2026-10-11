import { describe, it, expect } from 'vitest';
import { healDisc, BLEND_MARGIN, type Pixels } from '../../src/core/heal';

// deterministic synthetic "skin": smooth gradient + fine hash noise, with a dark blemish
function skin(w: number, h: number, blemish?: { x: number; y: number; r: number }): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = ((x * 73856093) ^ (y * 19349663)) >>> 0, noise = ((n % 1000) / 1000 - 0.5) * 8;
    let r = 205 + x * 0.05 - y * 0.03 + noise, g = 150 + noise, b = 125 + noise;
    if (blemish) { const d = Math.hypot(x - blemish.x, y - blemish.y); if (d < blemish.r) { const a = 1 - d / blemish.r; r -= 70 * a; g -= 70 * a; b -= 40 * a; } }
    const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  return { w, h, data };
}
const luma = (p: Pixels, x: number, y: number) => { const o = (y * p.w + x) * 4; return 0.2126 * p.data[o] + 0.7152 * p.data[o + 1] + 0.0722 * p.data[o + 2]; };

describe('heal', () => {
  const W = 160, H = 160, B = { x: 80, y: 80, r: 7 };
  it('removes a blemish and matches the clean texture closely', () => {
    const clean = skin(W, H), img = skin(W, H, B);
    const before = luma(img, 80, 80);
    healDisc(img, 80, 80, 10);
    expect(Math.abs(luma(img, 80, 80) - luma(clean, 80, 80))).toBeLessThan(Math.abs(before - luma(clean, 80, 80)) * 0.25);
  });
  it('is deterministic (byte-identical on two runs)', () => {
    const a = skin(W, H, B), b = skin(W, H, B);
    healDisc(a, 80, 80, 10); healDisc(b, 80, 80, 10);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
  it('leaves every pixel beyond radius + blend margin untouched', () => {
    const img = skin(W, H, B), ref = skin(W, H, B), r = 10, R = r * (1 + BLEND_MARGIN);
    healDisc(img, 80, 80, r);
    let changed = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 80, y - 80) > R + 1) for (let c = 0; c < 4; c++) if (img.data[(y * W + x) * 4 + c] !== ref.data[(y * W + x) * 4 + c]) changed++;
    expect(changed).toBe(0);
  });
  it('keeps texture: interior std is close to the surrounding ring', () => {
    const img = skin(W, H, B), r = 10; healDisc(img, 80, 80, r);
    const std = (sel: (d: number) => boolean) => { const v: number[] = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sel(Math.hypot(x - 80, y - 80))) v.push(luma(img, x, y)); const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
    expect(std((d) => d <= r) / std((d) => d > r && d <= 1.5 * r)).toBeLessThan(1.25);
  });
  it('works at an image corner without reading outside the buffer', () => {
    const img = skin(W, H, { x: 3, y: 3, r: 5 });
    expect(() => healDisc(img, 3, 3, 8)).not.toThrow();
  });
});
