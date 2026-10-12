// Guided filter (He, Sun, Tang 2010), written from scratch: edge-aware smoothing of `p` using `guide` (both w*h, values 0..1).
function box(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // running-sum box mean with clamped borders
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w; let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[row + x] = sum / (2 * r + 1); sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = sum / (2 * r + 1); sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

export function guidedFilter(guide: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number): Float32Array {
  const N = w * h;
  const mI = box(guide, w, h, r), mP = box(p, w, h, r);
  const II = new Float32Array(N), IP = new Float32Array(N);
  for (let i = 0; i < N; i++) { II[i] = guide[i] * guide[i]; IP[i] = guide[i] * p[i]; }
  const mII = box(II, w, h, r), mIP = box(IP, w, h, r);
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) { const varI = mII[i] - mI[i] * mI[i], cov = mIP[i] - mI[i] * mP[i]; a[i] = cov / (varI + eps); b[i] = mP[i] - a[i] * mI[i]; }
  const mA = box(a, w, h, r), mB = box(b, w, h, r), out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = Math.min(1, Math.max(0, mA[i] * guide[i] + mB[i]));
  return out;
}

/** Refine a raw person alpha with the photo's luma as guide. edge 0-100: more = tighter radius-weighted adherence to image edges. */
export function refineAlpha(alpha: Float32Array, rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, edge: number): Float32Array {
  const guide = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) guide[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  const e = Math.min(100, Math.max(0, edge)) / 100, r = Math.max(2, Math.round(Math.min(w, h) * (0.004 + 0.012 * (1 - e) )));
  return guidedFilter(guide, alpha, w, h, r, 0.0004 + 0.02 * (1 - e) * (1 - e));
}
