// Heal: deterministic exemplar search + seamless (Poisson) clone, written from scratch.
// Works in place on an RGBA8 buffer. No randomness and no time dependence: the same input always gives the same bytes.

export interface Pixels { w: number; h: number; data: Uint8ClampedArray | Uint8Array; }
export interface Stroke { x: number; y: number; r: number; } // centre and brush radius, in pixels of the buffer being healed

export const BLEND_MARGIN = 0.25; // domain radius = r * (1 + BLEND_MARGIN); nothing beyond it is ever touched

const CTX_RADII = [1.05, 1.2, 1.4];
const CTX_ANGLES = 32;

/** Heal one disc. Returns the bounding box that was modified, or null if nothing was done. */
export function healDisc(img: Pixels, cx: number, cy: number, r: number): { x: number; y: number; w: number; h: number } | null {
  const { w, h, data } = img;
  const R = Math.max(2, r * (1 + BLEND_MARGIN));
  const x0 = Math.floor(cx - R), y0 = Math.floor(cy - R), x1 = Math.ceil(cx + R), y1 = Math.ceil(cy + R);
  if (x1 < 0 || y1 < 0 || x0 >= w || y0 >= h) return null;
  // context samples: points just outside the domain
  const ctx: [number, number][] = [];
  for (const k of CTX_RADII) for (let a = 0; a < CTX_ANGLES; a++) {
    const t = (a / CTX_ANGLES) * Math.PI * 2;
    ctx.push([Math.round(R * k * Math.cos(t)), Math.round(R * k * Math.sin(t))]);
  }
  const ext = Math.ceil(R * CTX_RADII[CTX_RADII.length - 1]) + 1;
  const px = (x: number, y: number, c: number) => data[(y * w + x) * 4 + c];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const ictx = Math.round(cx), icy = Math.round(cy);
  // target context values (clamped coordinates, so a brush at an image edge still has a context)
  const tgt = new Float32Array(ctx.length * 3);
  for (let i = 0; i < ctx.length; i++) {
    const x = Math.min(w - 1, Math.max(0, ictx + ctx[i][0])), y = Math.min(h - 1, Math.max(0, icy + ctx[i][1]));
    for (let c = 0; c < 3; c++) tgt[i * 3 + c] = px(x, y, c);
  }
  // search offsets: source centre must keep the whole source disc + context inside the image and clear of the domain
  const minD = Math.ceil(R * 1.9), maxD = Math.ceil(R * 4.5) + 8;
  const step = Math.max(1, Math.round(R / 14));
  let best = Infinity, bx = 0, by = 0;
  for (let dy = -maxD; dy <= maxD; dy += step) for (let dx = -maxD; dx <= maxD; dx += step) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < minD && dx * dx + dy * dy < minD * minD) continue;
    const sx = ictx + dx, sy = icy + dy;
    if (sx - ext < 0 || sy - ext < 0 || sx + ext >= w || sy + ext >= h) continue;
    let cost = 0;
    for (let i = 0; i < ctx.length && cost < best; i++) {
      const x = sx + ctx[i][0], y = sy + ctx[i][1];
      for (let c = 0; c < 3; c++) { const d = px(x, y, c) - tgt[i * 3 + c]; cost += d * d; }
    }
    cost += 0.02 * (dx * dx + dy * dy) / Math.max(1, R); // mild preference for nearby sources
    if (cost < best) { best = cost; bx = dx; by = dy; }
  }
  if (!isFinite(best)) return null;
  // Poisson solve on the domain bounding box (+1 px frame holding the fixed boundary)
  const bw = x1 - x0 + 3, bh = y1 - y0 + 3, ox = x0 - 1, oy = y0 - 1;
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const gx = ox + x, gy = oy + y;
    if (inside(gx, gy) && (gx - cx) * (gx - cx) + (gy - cy) * (gy - cy) <= R * R && x > 0 && y > 0 && x < bw - 1 && y < bh - 1) mask[y * bw + x] = 1;
  }
  const sget = (gx: number, gy: number, c: number) => px(Math.min(w - 1, Math.max(0, gx + bx)), Math.min(h - 1, Math.max(0, gy + by)), c);
  const oget = (gx: number, gy: number, c: number) => px(Math.min(w - 1, Math.max(0, gx)), Math.min(h - 1, Math.max(0, gy)), c);
  const out = new Float32Array(bw * bh * 3);
  for (let c = 0; c < 3; c++) {
    const f = new Float32Array(bw * bh), lap = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const gx = ox + x, gy = oy + y, i = y * bw + x;
      if (mask[i]) {
        f[i] = sget(gx, gy, c);
        lap[i] = sget(gx - 1, gy, c) + sget(gx + 1, gy, c) + sget(gx, gy - 1, c) + sget(gx, gy + 1, c) - 4 * sget(gx, gy, c);
      } else f[i] = oget(gx, gy, c);
    }
    // successive over-relaxation, fixed iteration count and scan order => deterministic
    const iters = Math.min(600, Math.round(30 + 6 * R)), om = 1.9;
    for (let it = 0; it < iters; it++) for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x; if (!mask[i]) continue;
      const nv = (f[i - 1] + f[i + 1] + f[i - bw] + f[i + bw] - lap[i]) / 4;
      f[i] += om * (nv - f[i]);
    }
    for (let i = 0; i < f.length; i++) out[i * 3 + c] = f[i];
  }
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x; if (!mask[i]) continue;
    const gx = ox + x, gy = oy + y, o = (gy * w + gx) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = Math.max(0, Math.min(255, Math.round(out[i * 3 + c])));
    minX = Math.min(minX, gx); maxX = Math.max(maxX, gx); minY = Math.min(minY, gy); maxY = Math.max(maxY, gy);
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Heal a stroke: a tap is one disc; a drag is discs spaced 0.5 r apart, applied in order. */
export function healStroke(img: Pixels, points: { x: number; y: number }[], r: number): void {
  let last: { x: number; y: number } | null = null;
  for (const p of points) {
    if (last) {
      const d = Math.hypot(p.x - last.x, p.y - last.y), n = Math.floor(d / (0.5 * r));
      for (let i = 1; i <= n; i++) healDisc(img, last.x + ((p.x - last.x) * i) / n, last.y + ((p.y - last.y) * i) / n, r);
    } else healDisc(img, p.x, p.y, r);
    last = p;
  }
}
