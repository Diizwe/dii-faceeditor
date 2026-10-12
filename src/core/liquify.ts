// Liquify: strokes painted into a coarse backward-displacement grid (out(p) = in(p + B(p))). Brush kernels have compact support,
// so the field is exactly zero beyond every brush; a final guard rescales it if the map would fold.
export type LiquifyMode = 'push' | 'pucker' | 'bloat' | 'reconstruct';
export interface LiquifyStroke { pts: { x: number; y: number }[]; r: number; strength: number; mode: LiquifyMode; } // pts and r in the grid's pixel space
export interface Grid { Gx: number; Gy: number; x0: number; y0: number; x1: number; y1: number; data: Float32Array; }

const falloff = (d: number, r: number) => { const t = d / r; return t >= 1 ? 0 : (1 - t * t) * (1 - t * t); };

export function emptyGrid(x0: number, y0: number, x1: number, y1: number, cell: number): Grid {
  const Gx = Math.max(2, Math.ceil((x1 - x0) / cell) + 1), Gy = Math.max(2, Math.ceil((y1 - y0) / cell) + 1);
  return { Gx, Gy, x0, y0, x1: x0 + (Gx - 1) * cell, y1: y0 + (Gy - 1) * cell, data: new Float32Array(Gx * Gy * 2) };
}

function dab(g: Grid, cx: number, cy: number, r: number, k: number, mode: LiquifyMode, dx: number, dy: number) {
  const cw = (g.x1 - g.x0) / (g.Gx - 1), ch = (g.y1 - g.y0) / (g.Gy - 1);
  const i0 = Math.max(0, Math.floor((cx - r - g.x0) / cw)), i1 = Math.min(g.Gx - 1, Math.ceil((cx + r - g.x0) / cw));
  const j0 = Math.max(0, Math.floor((cy - r - g.y0) / ch)), j1 = Math.min(g.Gy - 1, Math.ceil((cy + r - g.y0) / ch));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = g.x0 + i * cw, y = g.y0 + j * ch, d = Math.hypot(x - cx, y - cy), f = falloff(d, r); if (f === 0) continue;
    const o = (j * g.Gx + i) * 2;
    if (mode === 'push') { g.data[o] -= dx * k * f; g.data[o + 1] -= dy * k * f; }
    else if (mode === 'pucker') { g.data[o] += (x - cx) * k * f * 0.25; g.data[o + 1] += (y - cy) * k * f * 0.25; }
    else if (mode === 'bloat') { g.data[o] -= (x - cx) * k * f * 0.25; g.data[o + 1] -= (y - cy) * k * f * 0.25; }
    else { const keep = 1 - Math.min(1, k * f * 1.5); g.data[o] *= keep; g.data[o + 1] *= keep; }
  }
}

export function paintStroke(g: Grid, s: LiquifyStroke) {
  const k = (s.strength / 100) * 0.9, spacing = Math.max(1, s.r * 0.25);
  const pts = s.pts; if (!pts.length) return;
  if (s.mode === 'push') {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dist = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(dist / spacing));
      for (let m = 1; m <= n; m++) { const t = m / n; dab(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, s.r, k, 'push', (b.x - a.x) / n, (b.y - a.y) / n); }
    }
  } else {
    // pucker/bloat/reconstruct act while the brush rests and as it moves; amount scales with dabs, kept small per dab
    const kk = k * 0.35; let last = pts[0]; dab(g, last.x, last.y, s.r, kk, s.mode, 0, 0);
    for (let i = 1; i < pts.length; i++) { const b = pts[i], dist = Math.hypot(b.x - last.x, b.y - last.y), n = Math.floor(dist / spacing);
      for (let m = 1; m <= n; m++) dab(g, last.x + ((b.x - last.x) * m) / n, last.y + ((b.y - last.y) * m) / n, s.r, kk, s.mode, 0, 0); last = b; }
  }
}

export function minJacobian(g: Grid): number {
  const sx = (g.x1 - g.x0) / (g.Gx - 1), sy = (g.y1 - g.y0) / (g.Gy - 1); let mn = Infinity;
  const v = (i: number, j: number, c: number) => g.data[(j * g.Gx + i) * 2 + c];
  for (let j = 0; j < g.Gy - 1; j++) for (let i = 0; i < g.Gx - 1; i++) {
    const a = 1 + (v(i + 1, j, 0) - v(i, j, 0)) / sx, b = (v(i, j + 1, 0) - v(i, j, 0)) / sy, c = (v(i + 1, j, 1) - v(i, j, 1)) / sx, d = 1 + (v(i, j + 1, 1) - v(i, j, 1)) / sy;
    mn = Math.min(mn, a * d - b * c);
  }
  return mn;
}

/** Scale the whole field down just enough that the map stays a diffeomorphism (min Jacobian >= floor). */
export function guard(g: Grid, floor = 0.3) {
  if (minJacobian(g) >= floor) return;
  let lo = 0, hi = 1; const base = g.data.slice();
  for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; for (let i = 0; i < base.length; i++) g.data[i] = base[i] * mid; if (minJacobian(g) >= floor) lo = mid; else hi = mid; }
  for (let i = 0; i < base.length; i++) g.data[i] = base[i] * lo;
}

export function buildLiquify(strokes: LiquifyStroke[], x0: number, y0: number, x1: number, y1: number, cell: number): Grid | null {
  if (!strokes.length) return null;
  const g = emptyGrid(x0, y0, x1, y1, cell);
  for (const s of strokes) paintStroke(g, s);
  guard(g);
  return g;
}

export function sampleGrid(g: Grid, x: number, y: number): [number, number] {
  const u = ((x - g.x0) / (g.x1 - g.x0)) * (g.Gx - 1), v = ((y - g.y0) / (g.y1 - g.y0)) * (g.Gy - 1);
  if (u < 0 || v < 0 || u > g.Gx - 1 || v > g.Gy - 1) return [0, 0];
  const i = Math.min(g.Gx - 2, Math.floor(u)), j = Math.min(g.Gy - 2, Math.floor(v)), a = u - i, b = v - j, q = (ii: number, jj: number, c: number) => g.data[(jj * g.Gx + ii) * 2 + c];
  const L = (c: number) => (q(i, j, c) * (1 - a) + q(i + 1, j, c) * a) * (1 - b) + (q(i, j + 1, c) * (1 - a) + q(i + 1, j + 1, c) * a) * b;
  return [L(0), L(1)];
}
