
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
window.H.setFace = async (file) => { // loads, detects, picks the largest face as active; returns face
  const t = window.__diiTest; await window.T.load(file); const img = t.store.getState().image;
  const faces = await t.detectFaces(img.preview); if (!faces.length) return null;
  t.store.getState().setFaces(faces); const f = [...faces].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0]; t.store.getState().setActiveFace(f.id);
  return f;
};
window.H.smoothFrame = async (strength, keep) => {
  const t = window.__diiTest; t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().setCompare(false);
  if (strength !== null) t.store.getState().edit({ tool: 'smooth', params: { strength, keep, face: t.store.getState().activeFace } });
  await new Promise((r) => setTimeout(r, 250));
  return window.__dii.renderer.readOutHalf();
};
