
window.H.gauss = (a, w, h, sigma) => { // separable gaussian on Float32Array w*h
  const r = Math.max(1, Math.ceil(sigma * 3)), k = new Float32Array(2 * r + 1); let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); sum += k[i + r]; } for (let i = 0; i < k.length; i++) k[i] /= sum;
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += a[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r]; t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let i = -r; i <= r; i++) v += t[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r]; o[y * w + x] = v; }
  return o;
};
window.H.luma = (f) => { const o = new Float32Array(f.w * f.h); for (let i = 0; i < o.length; i++) o[i] = 0.2126 * f.data[i * 4] + 0.7152 * f.data[i * 4 + 1] + 0.0722 * f.data[i * 4 + 2]; return o; };
window.H.lapVar = (y, w, h, sel) => { let s = 0, s2 = 0, n = 0; for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const p = j * w + i; if (!sel[p]) continue; const l = 4 * y[p] - y[p - 1] - y[p + 1] - y[p - w] - y[p + w]; s += l; s2 += l * l; n++; } return n ? s2 / n - (s / n) ** 2 : 0; };
window.H.erode = (m, w, h, r) => { // m: Uint8Array 0/1; chebyshev erosion by r
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w; x++) { run = m[y * w + x] ? run + 1 : 0; t[y * w + x] = run >= 1 ? 1 : 0; } }
  const cnt = new Int32Array(w * h); // horizontal run lengths both sides via min over window using prefix sums
  const pre = new Int32Array((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pre[y * (w + 1) + x + 1] = pre[y * (w + 1) + x] + (m[y * w + x] ? 1 : 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = Math.max(0, x - r), b = Math.min(w, x + r + 1); cnt[y * w + x] = (pre[y * (w + 1) + b] - pre[y * (w + 1) + a]) === (2 * r + 1) ? 1 : 0; }
  const pre2 = new Int32Array(w * (h + 1)); for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) pre2[(y + 1) * w + x] = pre2[y * w + x] + cnt[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = Math.max(0, y - r), b = Math.min(h, y + r + 1); o[y * w + x] = (pre2[b * w + x] - pre2[a * w + x]) === (2 * r + 1) ? 1 : 0; }
  return o;
};
window.H.waitFaces = async () => { const t = window.__diiTest; for (let i = 0; i < 600; i++) { const f = t.store.getState().faces; if (f) return f; await new Promise((r) => setTimeout(r, 100)); } throw new Error('face detection timeout'); };
window.H.setFace = async (file) => { // loads, detects, picks the largest face as active; returns face
  const t = window.__diiTest; await window.T.load(file); const img = t.store.getState().image;
  const faces = await window.H.waitFaces(); if (!faces.length) return null; const f = [...faces].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0]; t.store.getState().setActiveFace(f.id);
  return f;
};
window.H.smoothFrame = async (strength, keep) => {
  const t = window.__diiTest; t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().setCompare(false);
  if (strength !== null) t.store.getState().edit({ tool: 'smooth', params: { strength, soften: 100 - keep, face: t.store.getState().activeFace } });
  await new Promise((r) => setTimeout(r, 250));
  return window.__dii.renderer.readOutHalf();
};

// mean absolute per-pixel hue shift (degrees) over the pixel list; pixels with chroma < 0.02 have no meaningful hue and are skipped
window.H.hueShift = (a, b, idxs) => { let s = 0, n = 0; for (const i of idxs) { const ca = Math.max(a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]) - Math.min(a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]); if (ca < 0.02) continue; let d = window.H.hue(b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]) - window.H.hue(a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]); d = ((d + 540) % 360) - 180; s += Math.abs(d); n++; } return n ? s / n : 0; };

// SSIM on luma over non-overlapping 8x8 windows (values 0..255)
window.H.ssim = (a, b, w, h) => { const C1 = 6.5025, C2 = 58.5225; let tot = 0, n = 0; for (let by = 0; by + 8 <= h; by += 8) for (let bx = 0; bx + 8 <= w; bx += 8) { let ma = 0, mb = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (by + y) * w + bx + x; ma += a[i]; mb += b[i]; } ma /= 64; mb /= 64; let va = 0, vb = 0, cv = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (by + y) * w + bx + x; va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; cv += (a[i] - ma) * (b[i] - mb); } va /= 63; vb /= 63; cv /= 63; tot += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++; } return tot / n; };
// compare the live preview frame with a full-resolution export of the same edit (PNG, lossless)
window.H.parity = async (geometry, ops) => {
  const t = window.__diiTest; const st = t.store.getState();
  t.store.setState({ history: { ops: [], ptr: 0, open: null } });
  for (const op of ops) t.store.getState().edit(op);
  await new Promise((r) => setTimeout(r, 400));
  const pv = window.__dii.renderer.readOutHalf();
  const s2 = t.store.getState();
  const res = await t.exportImage(s2.image, { format: 'png', quality: 100, geometry, edit: t.editFrom(s2.history, s2.faces, s2.activeFace) });
  const bmp = await createImageBitmap(res.blob, { colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(pv.w, pv.h); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, pv.w, pv.h); const ex = g.getImageData(0, 0, pv.w, pv.h).data;
  const N = pv.w * pv.h, d = []; let sum = 0; const yp = new Float32Array(N), ye = new Float32Array(N);
  for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < 3; k++) { const v = Math.abs(Math.round(pv.data[i * 4 + k] * 255) - ex[i * 4 + k]); sum += v; m = Math.max(m, v); } d.push(m); yp[i] = 255 * (0.2126 * pv.data[i * 4] + 0.7152 * pv.data[i * 4 + 1] + 0.0722 * pv.data[i * 4 + 2]); ye[i] = 0.2126 * ex[i * 4] + 0.7152 * ex[i * 4 + 1] + 0.0722 * ex[i * 4 + 2]; }
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, nbad = 0; for (let i = 0; i < N; i++) if (d[i] > 8) { const x = i % pv.w, y = (i / pv.w) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); nbad++; }
  const sorted = Float32Array.from(d).sort(); 
  return { mean: sum / (N * 3), p99: sorted[Math.floor(N * 0.99)], max: sorted[N - 1], ssim: window.H.ssim(yp, ye, pv.w, pv.h), size: [res.width, res.height, pv.w, pv.h], tiles: res.tiles, bad: { n: nbad, box: [bx0, by0, bx1, by1] } };
};

// Paint a synthetic blemish (soft dark-red spot) on a skin pixel of the photo and reload the result as a lossless image.
window.H.withBlemish = async (file) => {
  const t = window.__diiTest; const blob = await (await fetch('/testdata/' + file)).blob();
  const img0 = await t.loadImage(blob, file); t.store.getState().setImage(img0);
  const faces = await window.H.waitFaces(); if (!faces.length) return null;
  const f = [...faces].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0];
  const mk = (() => { return null; })();
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const [cx, cy] = f.mesh[205]; const R = Math.max(4, f.box[2] * 0.03);
  const im = g.getImageData(0, 0, c.width, c.height);
  for (let y = Math.floor(cy - R * 2); y <= cy + R * 2; y++) for (let x = Math.floor(cx - R * 2); x <= cx + R * 2; x++) {
    const d = Math.hypot(x - cx, y - cy) / R; if (d >= 1 || x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
    const a = (1 - d) ** 1.5 * 0.75, o = (y * c.width + x) * 4; im.data[o] = im.data[o] * (1 - a) + 120 * a; im.data[o + 1] = im.data[o + 1] * (1 - a) + 30 * a; im.data[o + 2] = im.data[o + 2] * (1 - a) + 35 * a;
  }
  g.putImageData(im, 0, 0);
  const blob2 = await c.convertToBlob({ type: 'image/png' });
  const img = await t.loadImage(blob2, file + '#blemish'); t.store.getState().setImage(img);
  await window.H.waitFaces();
  return { spot: [cx, cy], R, fw: f.box[2], w: c.width, h: c.height, blemished: im };
};

// CIELAB (sRGB D65) and CIEDE2000 on 0..1 RGB triples
window.H.lab = (r, g, b) => { const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const R = f(r), G = f(g), B = f(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const h = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116); return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))]; };
window.H.de2000 = (l1, l2) => { const rad = Math.PI / 180, deg = 180 / Math.PI; const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1 = (Math.atan2(b1, a1p) * deg + 360) % 360, h2 = (Math.atan2(b2, a2p) * deg + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p; let dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; if (C1p * C2p === 0) dh = 0;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2; if (C1p * C2p === 0) hb = h1 + h2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const Sl = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)), Rt = -Math.sin(2 * dth * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh)); };
window.H.toolFrame = async (tool, params) => {
  const t = window.__diiTest; t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().setCompare(false);
  if (params) t.store.getState().edit({ tool, params: { ...params, face: t.store.getState().activeFace } });
  await new Promise((r) => setTimeout(r, 250));
  return window.__dii.renderer.readOutHalf();
};
