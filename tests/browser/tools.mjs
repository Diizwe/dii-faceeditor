// Tool suite (Phase 2): objective checks per tool and skin-tone group, on the test grid, SwiftShader WebGL2.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'spec/thresholds.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'testdata/manifest.json'), 'utf8')).photos.filter((p) => !process.env.ONLY || process.env.ONLY.split(',').includes(p.id));
const only = process.argv[2];
const { server, port } = await serve(path.join(root, 'dist'), { mounts: { '/testdata/': path.join(root, 'testdata') } });
const base = `http://127.0.0.1:${port}/`;
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(base);
let failed = false;
const results = [];
const check = (n, v, ok, x = {}) => { results.push({ n, v, ok }); if (!ok) failed = true; console.log(ok ? 'PASS' : 'FAIL', n, typeof v === 'number' ? +v.toFixed(4) : JSON.stringify(v), JSON.stringify(x)); };

// Load every photo once into the page: image, faces, and helpers.
await page.evaluate(() => {
  window.T = {
    imgs: {},
    async load(file) {
      const t = window.__diiTest; const blob = await (await fetch('/testdata/' + file)).blob();
      const img = await t.loadImage(blob, file); t.store.getState().setImage(img);
      await new Promise((r) => setTimeout(r, 400));
      return img;
    },
  };
});
const groupOf = {}; for (const p of manifest) groupOf[p.id] = p.mst_group_visual_estimate;

// ---- helper code that runs inside the page
await page.addScriptTag({ content: `
window.H = {
  hue(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d === 0) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; },
  async frame(file, light) { // returns half-float RGBA of the 'after' frame for given light params (no edits when null)
    const t = window.__diiTest; const st = t.store.getState();
    if (!st.image || st.image.name !== file) await window.T.load(file);
    const s = t.store.getState(); s.setCompare(false);
    t.store.setState({ history: { ops: [], ptr: 0, open: null } });
    if (light) t.store.getState().edit({ tool: 'light', params: light });
    await new Promise((r) => setTimeout(r, 150));
    return window.__dii.renderer.readOutHalf();
  },
};` });

await page.addScriptTag({ path: path.join(here, 'helpers.js') });
const light0 = { exposure: 0, contrast: 0, warmth: 0, saturation: 0 };

if (!only || only === 'light') {
  // identity: forcing the shader with zero settings must reproduce the input within 1 level; renders via store identity path too
  const id = await page.evaluate(async () => {
    const t = window.__diiTest; await window.T.load('photos/p05.jpg');
    const r = window.__dii.renderer; const st = t.store.getState();
    const before = (await window.H.frame('photos/p05.jpg', null));
    // force the light pass with zeros by using a tiny non-zero epsilon-free path: call renderWork directly with an explicit zero light
    const k = st.image.previewScale; const w = before.w, h = before.h;
    r.renderWork({ m: [1, 0, 0, 0, 1, 0], w, h, light: { exposure: 0, contrast: 0, warmth: 0, saturation: 0 } });
    const after = r.readOutHalf(); let mx = 0; for (let i = 0; i < after.data.length; i++) mx = Math.max(mx, Math.abs(after.data[i] - before.data[i]));
    return { maxLevels: mx * 255, w, h, k };
  });
  check('M_lc_identity_max_diff', id.maxLevels, id.maxLevels <= T.metrics.M_lc_identity_max_diff.max);

  // monotone sweeps (21 steps) on a real photo
  const sweep = await page.evaluate(async () => {
    const file = 'photos/p05.jpg'; const out = {};
    const metrics = {
      exposure: (d) => { let s = 0; for (let i = 0; i < d.length; i += 4 * 7) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s; },
      contrast: (d) => { let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 7) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += y; s2 += y * y; n++; } return s2 / n - (s / n) ** 2; },
      warmth: (d) => { let s = 0; for (let i = 0; i < d.length; i += 4 * 7) s += d[i] - d[i + 2]; return s; },
      saturation: (d) => { let s = 0; for (let i = 0; i < d.length; i += 4 * 7) s += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); return s; },
    };
    const ranges = { exposure: [-2, 2], contrast: [-100, 100], warmth: [-100, 100], saturation: [-100, 100] };
    for (const c of Object.keys(ranges)) {
      const vals = []; for (let i = 0; i <= 20; i++) {
        const v = ranges[c][0] + (ranges[c][1] - ranges[c][0]) * i / 20;
        const f = await window.H.frame(file, { exposure: 0, contrast: 0, warmth: 0, saturation: 0, [c]: v });
        vals.push(metrics[c](f.data));
      }
      let viol = 0; for (let i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1] - 1e-6) viol++;
      out[c] = viol; out[c + '_range'] = +(vals[20] - vals[0]).toFixed(3);
    }
    return out;
  });
  const flat = ['exposure', 'contrast', 'warmth', 'saturation'].filter((c) => !(Math.abs(sweep[c + '_range']) > 1e-3));
  check('sweeps_actually_change_output', flat, flat.length === 0);
  const viol = ['exposure', 'contrast', 'warmth', 'saturation'].reduce((a, c) => a + sweep[c], 0);
  check('M_lc_monotone_violations', viol, viol <= T.metrics.M_lc_monotone_violations.max, sweep);

  // skin hue shift: warmth +-50 and saturation +-50 (each alone), mean hue of cheek discs, per skin-tone group
  const hue = {};
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); if (!f) return null;
      const base = await window.H.frame(file, null);
      // skin-mask pixels: interior of the feathered face mask (built by the first light frame below)
      await window.H.frame(file, { exposure: 0, contrast: 0, warmth: 10, saturation: 0 });
      const mk = window.__dii.renderer.readMask(); const pts = [];
      for (let y = 0; y < mk.h; y += 3) for (let x = 0; x < mk.w; x += 3) if (mk.data[(y * mk.w + x) * 4] >= 0.99) pts.push([x, y]);
      const idxs = pts.map(([x, y]) => y * base.w + x); let worst = 0; window.__dbg = { n: pts.length };
      for (const L of [{ warmth: 50 }, { warmth: -50 }, { saturation: 50 }, { saturation: -50 }]) {
        const fr = await window.H.frame(file, { exposure: 0, contrast: 0, warmth: 0, saturation: 0, ...L });
        const d = window.H.hueShift(base, fr, idxs); worst = Math.max(worst, d); (window.__dbg.per ??= []).push([JSON.stringify(L), +d.toFixed(2)]);
      }
      return worst;
    }, p.file);
    if (r === null) continue;
    if (process.env.DBG) console.log(p.id, r, JSON.stringify(await page.evaluate(() => window.__dbg)));
    (hue[groupOf[p.id]] ??= []).push(r);
  }
  for (const [g, v] of Object.entries(hue)) { const mx = Math.max(...v); check(`M_skin_hue_shift_deg light MST ${g}`, mx, mx <= T.metrics.M_skin_hue_shift_deg.max, { n: v.length }); }
}


if (!only || only === 'smooth') {
  const groupRes = {};
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); if (!f) return { miss: true };
      const base = await window.H.smoothFrame(null, 70);
      const def = await window.H.smoothFrame(35, 70); const mask = window.__dii.renderer.readMask();
      const mx = await window.H.smoothFrame(100, 70);
      const w = base.w, h = base.h, N = w * h, m = new Float32Array(N); for (let i = 0; i < N; i++) m[i] = mask.data[i * 4];
      // outside mask: weight 0
      let outside = 0, ringSum = 0, ringN = 0, over = 0, overN = 0;
      const zero = new Uint8Array(N); for (let i = 0; i < N; i++) zero[i] = m[i] === 0 ? 1 : 0;
      const d3 = window.H.erode(zero, w, h, 3); // pixels whose 7x7 neighbourhood is all zero-weight
      const nearZero = new Uint8Array(N); // non-zero pixels within 3 px of a zero pixel
      const dil = new Uint8Array(N); { const inv = new Uint8Array(N); for (let i = 0; i < N; i++) inv[i] = zero[i] ? 0 : 1; const e = window.H.erode(inv, w, h, 3); for (let i = 0; i < N; i++) dil[i] = (!zero[i] && !e[i]) ? 1 : 0; }
      const mn5 = (arr, p, c) => { let lo = 9, hi = -9; const x = p % w, y = (p / w) | 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j)); const v = arr[(yy * w + xx) * 4 + c]; if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
      for (let i = 0; i < N; i++) {
        let dmax = 0; for (let c = 0; c < 3; c++) dmax = Math.max(dmax, Math.abs(def.data[i * 4 + c] - base.data[i * 4 + c]) * 255);
        if (zero[i] && dmax > 1) outside++;
        if (dil[i]) { ringSum += dmax; ringN++; }
        if (m[i] > 0 && m[i] < 1 && (i % 3 === 0)) { overN++; for (let c = 0; c < 3; c++) { const [lo, hi] = mn5(base.data, i, c); const v = def.data[i * 4 + c]; const ex = Math.max(lo - v, v - hi) * 255; if (ex > over) over = ex; } }
      }
      // skin region: mask >= 0.99, eroded by 4 px
      const inside = new Uint8Array(N); for (let i = 0; i < N; i++) inside[i] = m[i] >= 0.99 ? 1 : 0; const skin = window.H.erode(inside, w, h, 4);
      const yb = window.H.luma(base), yd = window.H.luma(def), ym = window.H.luma(mx);
      const vb = window.H.lapVar(yb, w, h, skin), vd = window.H.lapVar(yd, w, h, skin), vm = window.H.lapVar(ym, w, h, skin);
      const sc = f.box[2] / 600; const bp = (y) => { const a = window.H.gauss(y, w, h, 2 * sc), b = window.H.gauss(y, w, h, 6 * sc); let e = 0, n = 0; for (let i = 0; i < N; i++) if (skin[i]) { const d = a[i] - b[i]; e += d * d; n++; } return e / n; };
      const eb = bp(yb), em = bp(ym);
      const skinIdx = []; for (let i = 0; i < N; i += 3) if (skin[i]) skinIdx.push(i); const dh = window.H.hueShift(base, def, skinIdx);
      let clip = 0; for (let i = 0; i < N * 4; i += 4) for (let c = 0; c < 3; c++) { const o = base.data[i + c], v = def.data[i + c]; if ((v <= 0 && o > 0) || (v >= 1 && o < 1)) clip++; }
      return { skinPx: skin.reduce((a, v) => a + v, 0), outside, ring: ringN ? ringSum / ringN : 0, over, ret_def: vd / vb, ret_max: vm / vb, blem: 1 - em / eb, hue: dh, clip: clip / (N * 3) };
    }, p.file);
    if (r.miss) { console.log('no face', p.id); continue; }
    (groupRes[groupOf[p.id]] ??= []).push({ id: p.id, ...r });
    if (process.env.DBG) console.log(p.id, JSON.stringify(r));
  }
  const M = T.metrics;
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length, mx = (v) => Math.max(...v), mn = (v) => Math.min(...v);
  const spec = [
    ['M_outside_mask_changed_px', 'outside', mx, (v) => v <= M.M_outside_mask_changed_px.max],
    ['M_halo_ring_mean_abs_levels', 'ring', mean, (v) => v <= M.M_halo_ring_mean_abs_levels.max],
    ['M_halo_overshoot_levels', 'over', mx, (v) => v <= M.M_halo_overshoot_levels.max],
    ['M_detail_retention_default', 'ret_def', mean, (v) => v >= M.M_detail_retention_default.min],
    ['M_detail_retention_max', 'ret_max', mean, (v) => v >= M.M_detail_retention_max.min],
    ['M_blemish_energy_reduction_max', 'blem', mean, (v) => v >= M.M_blemish_energy_reduction_max.min],
    ['M_skin_hue_shift_deg (smooth)', 'hue', mx, (v) => v <= M.M_skin_hue_shift_deg.max],
    ['M_clipped_px_increase (smooth)', 'clip', mx, (v) => v <= M.M_clipped_px_increase.max],
  ];
  for (const [name, key, fn, ok] of spec) {
    const vals = {};
    for (const [g, arr] of Object.entries(groupRes)) { vals[g] = fn(arr.map((x) => x[key])); check(`${name} MST ${g}`, vals[g], ok(vals[g]), { n: arr.length }); }
  }
  // cross-group parity for ratio/level metrics (group mean vs all-group median)
  for (const [name, key, , ] of spec.filter((x) => ['ret_def', 'ret_max', 'blem', 'ring'].includes(x[1]))) {
    const gm = Object.entries(groupRes).map(([g, arr]) => [g, mean(arr.map((x) => x[key]))]); const sorted = gm.map((x) => x[1]).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
    const worst = gm.reduce((w, [g, v]) => (Math.abs(v - med) / Math.abs(med) > w[1] ? [g, Math.abs(v - med) / Math.abs(med)] : w), ['', 0]);
    check(`parity ${name}`, worst[1], worst[1] <= T.evaluation.parity_relative_max, { worst_group: worst[0], median: med });
  }
}

if (!only || only === 'parity') {
  const files = (process.env.PARITY_FILES || 'photos/p05.jpg,photos/p21.jpg,photos/p28.jpg').split(',');
  const cases = {
    smooth: [{ tool: 'smooth', params: { strength: 60, soften: 30, face: null } }],
    light: [{ tool: 'light', params: { exposure: 0.4, contrast: 25, warmth: 30, saturation: 20 } }],
    reshape: [{ tool: 'reshape', params: { jaw: 60, chin: 40, noseW: 50, noseL: 30, eyeSize: 40, eyeDist: 20, lips: 40, faceW: 50 } }],
    makeupfilter: [{ tool: 'makeup', params: { lip: 30, blush: 25, brow: 25, colour: 1, face: null } }, { tool: 'filters', params: { look: 4, strength: 50 } }],
    liquify: [{ tool: 'liquify', params: { pts: [{ x: 500, y: 700 }, { x: 560, y: 720 }, { x: 640, y: 740 }], r: 110, strength: 70, mode: 'push' } }, { tool: 'liquify', params: { pts: [{ x: 700, y: 560 }], r: 90, strength: 60, mode: 'bloat' } }, { tool: 'geometry', params: { rot90: 0, flipH: false, flipV: false, angle: 3, aspect: 0.85 } }],
    background: [{ tool: 'background', params: { mode: 0, blur: 60, edge: 40, colour: 0 } }],
    combo: [{ tool: 'geometry', params: { rot90: 0, flipH: false, flipV: false, angle: 6, aspect: 0.8 } }, { tool: 'smooth', params: { strength: 40, soften: 30, face: null } }, { tool: 'light', params: { exposure: -0.2, contrast: 10, warmth: -20, saturation: 10 } }],
  };
  const M = T.metrics;
  for (const [name, ops] of Object.entries(cases)) {
    const rows = [];
    for (const file of files) {
      const r = await page.evaluate(async ({ file, ops }) => {
        await window.H.setFace(file); const st = window.__diiTest.store.getState();
        const o = ops.map((op) => (op.tool === 'smooth' || op.tool === 'makeup' ? { ...op, params: { ...op.params, face: st.activeFace } } : op));
        const geo = (o.find((x) => x.tool === 'geometry') || { params: { rot90: 0, flipH: false, flipV: false, angle: 0, aspect: null } }).params;
        return window.H.parity(geo, o);
      }, { file, ops });
      rows.push(r); if (process.env.DBG) console.log(name, file, JSON.stringify(r));
    }
    const worst = (k, f) => f(...rows.map((x) => x[k]));
    check(`M_preview_vs_export_mean_abs_levels ${name}`, worst('mean', Math.max), worst('mean', Math.max) <= M.M_preview_vs_export_mean_abs_levels.max);
    check(`M_preview_vs_export_p99_levels ${name}`, worst('p99', Math.max), worst('p99', Math.max) <= M.M_preview_vs_export_p99_levels.max);
    check(`M_preview_vs_export_ssim ${name}`, worst('ssim', Math.min), worst('ssim', Math.min) >= M.M_preview_vs_export_ssim.min, { tiles: rows[0].tiles });
  }
}

if (!only || only === 'heal') {
  const M = T.metrics; const rowsAll = {};
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const t = window.__diiTest; const W = await window.H.withBlemish(file); if (!W) return null;
      const st = t.store.getState(), img = st.image; const k = img.previewScale; const rad = 0.02 * Math.min(img.width, img.height);
      t.store.setState({ history: { ops: [], ptr: 0, open: null } });
      const frame = async () => { await new Promise((r) => setTimeout(r, 500)); return window.__dii.renderer.readOutHalf(); };
      const before = await frame();
      const tap = { pts: [{ x: W.spot[0], y: W.spot[1] }], r: rad };
      t.store.getState().edit({ tool: 'heal', params: tap });
      let after = null; for (let i = 0; i < 40; i++) { after = await frame(); let diff = 0; for (let j = 0; j < after.data.length; j += 4 * 11) diff += Math.abs(after.data[j] - before.data[j]); if (diff > 0) break; }
      const w = before.w, h = before.h;
      const lum = (f, i) => 255 * (0.2126 * f.data[i * 4] + 0.7152 * f.data[i * 4 + 1] + 0.0722 * f.data[i * 4 + 2]);
      const [cx, cy] = W.spot, R = rad * 1.25; const rr = (x, y) => Math.hypot(x - cx, y - cy);
      let outside = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rr(x, y) > R + 1.5) { const i = y * w + x; for (let c = 0; c < 3; c++) if (Math.abs(after.data[i * 4 + c] - before.data[i * 4 + c]) * 255 > 1) { outside++; break; } }
      const stat = (sel) => { let s = 0, s2 = 0, n = 0; for (let y = Math.max(0, Math.floor(cy - 2.5 * rad)); y < Math.min(h, cy + 2.5 * rad); y++) for (let x = Math.max(0, Math.floor(cx - 2.5 * rad)); x < Math.min(w, cx + 2.5 * rad); x++) if (sel(rr(x, y))) { const v = lum(after, y * w + x); s += v; s2 += v * v; n++; } const m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); };
      const stdIn = stat((d) => d <= rad), stdRing = stat((d) => d > rad && d <= 1.5 * rad);
      const grad = (sel) => { let s = 0, n = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { if (Math.abs(y - cy) > 2.5 * rad || Math.abs(x - cx) > 2.5 * rad || !sel(rr(x, y))) continue; const i = y * w + x; s += Math.hypot(lum(after, i + 1) - lum(after, i - 1), lum(after, i + w) - lum(after, i - w)) / 2; n++; } return n ? s / n : 0; };
      const seam = grad((d) => Math.abs(d - R) <= 1.5) / Math.max(1e-6, grad((d) => d > R + 2 && d <= 1.5 * R + 2));
      // blemish removal: error in the brush circle vs the clean original (loaded from the unpainted photo)
      const clean = await (async () => { const blob = await (await fetch('/testdata/' + file)).blob(); const bm = await createImageBitmap(blob, { imageOrientation: 'from-image', colorSpaceConversion: 'none' }); const c = new OffscreenCanvas(w, h); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; })();
      // blemish removal is judged on the low-frequency colour (an exemplar fill replaces texture, so pixelwise error vs the clean photo is meaningless):
      // blur before / after / clean with sigma = half the blemish radius and compare inside the blemish disc
      const bx0 = Math.max(0, Math.floor(cx - 3 * W.R)), by0 = Math.max(0, Math.floor(cy - 3 * W.R)), bx1 = Math.min(w, Math.ceil(cx + 3 * W.R)), by1 = Math.min(h, Math.ceil(cy + 3 * W.R)), bw = bx1 - bx0, bh = by1 - by0;
      const chan = (src, c, scale) => { const a = new Float32Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) a[y * bw + x] = src[((by0 + y) * w + bx0 + x) * 4 + c] * scale; return window.H.gauss(a, bw, bh, Math.max(1, W.R / 2)); };
      let eb = 0, ea = 0, n = 0;
      for (let c = 0; c < 3; c++) { const B = chan(before.data, c, 255), A = chan(after.data, c, 255), C = chan(clean, c, 1); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (rr(bx0 + x, by0 + y) <= W.R * 1.2) { eb += Math.abs(B[y * bw + x] - C[y * bw + x]); ea += Math.abs(A[y * bw + x] - C[y * bw + x]); n++; } }
      // determinism: second run from the same state
      t.store.setState({ history: { ops: [], ptr: 0, open: null } }); await frame();
      t.store.getState().edit({ tool: 'heal', params: tap });
      let after2 = null; for (let i = 0; i < 40; i++) { after2 = await frame(); let diff = 0; for (let j = 0; j < after2.data.length; j += 4 * 11) diff += Math.abs(after2.data[j] - before.data[j]); if (diff > 0) break; }
      let det = 0; for (let i = 0; i < after.data.length; i++) if (after.data[i] !== after2.data[i]) det++;
      return { outside, stdRatio: stdIn / stdRing, seam, ea: n ? ea / n : 0, eb: n ? eb / n : 0, det, changed: eb > 0 };
    }, p.file);
    if (!r) continue;
    (rowsAll[groupOf[p.id]] ??= []).push({ id: p.id, ...r }); if (process.env.DBG) console.log(p.id, JSON.stringify(r));
  }
  for (const [g, rows] of Object.entries(rowsAll)) {
    const mx = (k) => Math.max(...rows.map((x) => x[k]));
    check(`M_outside_mask_changed_px heal MST ${g}`, mx('outside'), mx('outside') <= M.M_outside_mask_changed_px.max, { n: rows.length });
    check(`M_heal_interior_std_ratio MST ${g}`, mx('stdRatio'), mx('stdRatio') <= M.M_heal_interior_std_ratio.max);
    check(`M_heal_seam_gradient_ratio MST ${g}`, mx('seam'), mx('seam') <= M.M_heal_seam_gradient_ratio.max);
    check(`M_deterministic_diff_levels heal MST ${g}`, mx('det'), mx('det') <= M.M_deterministic_diff_levels.max);
    { const bad = rows.filter((x) => !(x.ea <= Math.max(4, 0.5 * x.eb))); check(`heal_removes_blemish (low-frequency error <= max(4 levels, half the blemish error)) MST ${g}`, Math.max(...rows.map((x) => x.ea)), bad.length === 0, { bad: bad.map((x) => x.id + ':' + x.ea.toFixed(1) + '/' + x.eb.toFixed(1)) }); }
  }
}

if (!only || only === 'whiten') {
  const M = T.metrics, rowsAll = {}, skipped = [];
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); if (!f) return { skip: 'no face' };
      const base = await window.H.toolFrame(null, null);
      const def = await window.H.toolFrame('whiten', { strength: 40 }); const mk = window.__dii.renderer.readMask('teeth');
      if (!mk) return { skip: 'no teeth mask' };
      const mx = await window.H.toolFrame('whiten', { strength: 100 });
      const N = base.w * base.h, sel = [];
      for (let i = 0; i < N; i++) if (mk.data[i * 4] >= 0.9) { const y = 0.2126 * base.data[i * 4] + 0.7152 * base.data[i * 4 + 1] + 0.0722 * base.data[i * 4 + 2]; if (y > 0.55) sel.push(i); }
      if (sel.length < 60) return { skip: 'teeth not visible (' + sel.length + ' px)' };
      const meanLab = (fr) => { let L = 0, a = 0, b = 0; for (const i of sel) { const l = window.H.lab(fr.data[i * 4], fr.data[i * 4 + 1], fr.data[i * 4 + 2]); L += l[0]; a += l[1]; b += l[2]; } return [L / sel.length, a / sel.length, b / sel.length]; };
      const lb = meanLab(base), ld = meanLab(def), lm = meanLab(mx);
      let outside = 0, clip = 0; for (let i = 0; i < N; i++) { const inMask = mk.data[i * 4] > 0; for (let c = 0; c < 3; c++) { const d = Math.abs(def.data[i * 4 + c] - base.data[i * 4 + c]) * 255; if (!inMask && d > 1) { outside++; break; } if ((def.data[i * 4 + c] >= 1 && base.data[i * 4 + c] < 1) || (def.data[i * 4 + c] <= 0 && base.data[i * 4 + c] > 0)) clip++; } }
      return { n: sel.length, Lmax: lm[0], bmax: lm[2], bBase: lb[2], yellowDrop: lb[2] > 6 ? (lb[2] - ld[2]) / lb[2] : null, outside, clip: clip / (N * 3) };
    }, p.file);
    if (r.skip) { skipped.push(`${p.id}: ${r.skip}`); continue; }
    (rowsAll[groupOf[p.id]] ??= []).push({ id: p.id, ...r }); if (process.env.DBG) console.log(p.id, JSON.stringify(r));
  }
  console.log('whiten skipped', skipped.length, 'of', manifest.length);
  for (const g of ['9-10', '7-8', '5-6', '3-4', '1-2']) {
    const rows = rowsAll[g] ?? []; if (!rows.length) { check(`whiten evidence MST ${g}`, 'no photo with visible teeth', false); continue; }
    const mx = (k) => Math.max(...rows.map((x) => x[k])), mn = (k) => Math.min(...rows.map((x) => x[k]));
    check(`M_whiten_teeth_L_max MST ${g}`, mx('Lmax'), mx('Lmax') <= M.M_whiten_teeth_L_max.max, { n: rows.length });
    const yel = rows.filter((x) => x.bBase >= 8); if (yel.length) { const v = Math.min(...yel.map((x) => x.bmax)); check(`M_whiten_teeth_b_min MST ${g}`, v, v >= M.M_whiten_teeth_b_min.min, { n: yel.length, note: 'photos whose teeth start at b* >= 8' }); }
    const yd = rows.filter((x) => x.yellowDrop !== null).map((x) => x.yellowDrop);
    if (yd.length) { const m = yd.reduce((a, b) => a + b) / yd.length; check(`M_whiten_yellow_reduction_default MST ${g}`, m, m >= M.M_whiten_yellow_reduction_default.min, { n: yd.length }); }
    check(`M_outside_mask_changed_px whiten MST ${g}`, mx('outside'), mx('outside') <= 0);
    check(`M_clipped_px_increase whiten MST ${g}`, mx('clip'), mx('clip') <= M.M_clipped_px_increase.max);
  }
}

if (!only || only === 'eyes') {
  const M = T.metrics, rowsAll = {}, skipped = [];
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); if (!f) return { skip: 'no face' };
      if (f.mesh.length < 478) return { skip: 'mesh has ' + f.mesh.length + ' points (no iris)' };
      const base = await window.H.toolFrame(null, null);
      const def = await window.H.toolFrame('eyes', { brighten: 30, clarity: 35 }); const im = window.__dii.renderer.readMask('iris'); if (!im) return { skip: 'no iris mask' };
      const cl = await window.H.toolFrame('eyes', { brighten: 0, clarity: 100 });
      const w = base.w, h = base.h, N = w * h;
      // eye outline raster (sclera = outline minus iris disc, never edited)
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff';
      for (const eye of [[362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398], [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]]) { g.beginPath(); eye.forEach((i, k) => (k ? g.lineTo(f.mesh[i][0], f.mesh[i][1]) : g.moveTo(f.mesh[i][0], f.mesh[i][1]))); g.closePath(); g.fill(); }
      const eyeD = g.getImageData(0, 0, w, h).data;
      const irisHard = new Uint8Array(N); for (let i = 0; i < N; i++) irisHard[i] = im.data[i * 4] > 0.001 ? 1 : 0;
      const sclera = []; for (let i = 0; i < N; i++) if (eyeD[i * 4] > 200 && !irisHard[i]) sclera.push(i);
      // sclera pixels farther than the feather width from the iris: leakage test (feather may legitimately touch the rim)
      let de = 0, dn = 0; for (const i of sclera) { de += window.H.de2000(window.H.lab(base.data[i * 4], base.data[i * 4 + 1], base.data[i * 4 + 2]), window.H.lab(def.data[i * 4], def.data[i * 4 + 1], def.data[i * 4 + 2])); dn++; }
      const iris = new Uint8Array(N); for (let i = 0; i < N; i++) iris[i] = im.data[i * 4] >= 0.99 ? 1 : 0;
      const yb = window.H.luma(base), yc = window.H.luma(cl);
      const vb = window.H.lapVar(yb, w, h, iris), vc = window.H.lapVar(yc, w, h, iris);
      let outside = 0, clip = 0; for (let i = 0; i < N; i++) for (let c2 = 0; c2 < 3; c2++) { const d = Math.abs(def.data[i * 4 + c2] - base.data[i * 4 + c2]) * 255; if (im.data[i * 4] === 0 && d > 1) { outside++; break; } if ((def.data[i * 4 + c2] >= 1 && base.data[i * 4 + c2] < 1) || (def.data[i * 4 + c2] <= 0 && base.data[i * 4 + c2] > 0)) clip++; }
      return { irisPx: iris.reduce((a, b) => a + b, 0), sclera: dn ? de / dn : 0, gain: vb > 0 ? vc / vb - 1 : 0, outside, clip: clip / (N * 3) };
    }, p.file);
    if (r.skip) { skipped.push(`${p.id}: ${r.skip}`); continue; }
    if (r.irisPx < 20) { skipped.push(`${p.id}: iris not visible (${r.irisPx} px)`); continue; }
    (rowsAll[groupOf[p.id]] ??= []).push({ id: p.id, ...r }); if (process.env.DBG) console.log(p.id, JSON.stringify(r));
  }
  console.log('eyes skipped', skipped.length, 'of', manifest.length, process.env.DBG ? skipped.join('; ') : '');
  for (const g of ['9-10', '7-8', '5-6', '3-4', '1-2']) {
    const rows = rowsAll[g] ?? []; if (!rows.length) { check(`eyes evidence MST ${g}`, 'no photo with a visible iris', false); continue; }
    const mx = (k) => Math.max(...rows.map((x) => x[k])), mean = (k) => rows.reduce((a, x) => a + x[k], 0) / rows.length;
    check(`M_eyes_sclera_shift_deltaE MST ${g}`, mean('sclera'), mean('sclera') <= M.M_eyes_sclera_shift_deltaE.max, { n: rows.length, worst: mx('sclera') });
    check(`M_eyes_iris_sharpness_gain_max MST ${g}`, mean('gain'), mean('gain') >= M.M_eyes_iris_sharpness_gain_max.min);
    check(`M_outside_mask_changed_px eyes MST ${g}`, mx('outside'), mx('outside') <= 0);
    check(`M_clipped_px_increase eyes MST ${g}`, mx('clip'), mx('clip') <= M.M_clipped_px_increase.max);
  }
}

if (!only || only === 'compare') {
  const M = T.metrics;
  const r = await page.evaluate(async () => {
    const t = window.__diiTest; const f = await window.H.setFace('photos/p05.jpg');
    // no edits: compare frame == original pixels
    t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().setCompare(false);
    await new Promise((r) => setTimeout(r, 300));
    const orig = window.__dii.renderer.readOutHalf();
    // heavy edit stack
    t.store.getState().edit({ tool: 'smooth', params: { strength: 80, soften: 30, face: f.id } });
    t.store.getState().edit({ tool: 'light', params: { exposure: 0.5, contrast: 30, warmth: 20, saturation: 20 } });
    t.store.getState().edit({ tool: 'geometry', params: { rot90: 0, flipH: false, flipV: false, angle: 4, aspect: 0.8 } });
    await new Promise((r) => setTimeout(r, 1500));
    const after = window.__dii.renderer.readOutHalf();
    // toggle latency: time from setCompare to the next present, measured with a forced readback
    const lat = [];
    for (let i = 0; i < 6; i++) {
      const before = window.__dii.renders; const t0 = performance.now();
      t.store.getState().setCompare(i % 2 === 0);
      while (window.__dii.renders === before) await new Promise((r) => setTimeout(r, 0));
      const gl = window.__dii.renderer.gl; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      lat.push(performance.now() - t0);
    }
    // compare view with edits must equal the geometry-only frame of the same edits (aligned, 0 levels)
    t.store.getState().setCompare(true); await new Promise((r) => setTimeout(r, 100));
    window.__dii.redraw();
    const gl = window.__dii.renderer.gl, c = window.__dii.renderer.canvas, px = new Uint8Array(c.width * c.height * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // reference: same geometry, no other edits
    t.store.setState({ history: { ops: [{ tool: 'geometry', params: { rot90: 0, flipH: false, flipV: false, angle: 4, aspect: 0.8 } }], ptr: 1, open: null } }); t.store.getState().setCompare(true);
    await new Promise((r) => setTimeout(r, 400)); window.__dii.redraw();
    const px2 = new Uint8Array(c.width * c.height * 4); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px2);
    let diff = 0; for (let i = 0; i < px.length; i++) diff = Math.max(diff, Math.abs(px[i] - px2[i]));
    let changed = 0; for (let i = 0; i < after.data.length; i += 4 * 13) changed += Math.abs(after.data[i] - orig.data[i % orig.data.length]);
    return { lat, diff, edited: after.w !== orig.w || changed > 0 };
  });
  const maxLat = Math.max(...r.lat);
  check('M_compare_identity_levels (compare view == geometry-only frame)', r.diff, r.diff <= M.M_compare_identity_levels.max);
  check('compare_toggle_latency_ms (limit 100)', maxLat, maxLat <= 100, { all: r.lat.map((v) => Math.round(v)) });
}

// ---- contact sheets for the reviewer agent (rubric scoring): before | after crops at 100% for every tool
if (only === 'sheets') {
  const outDir = process.env.SHEETS_DIR || '/tmp/claude-0/sheets'; fs.mkdirSync(outDir, { recursive: true });
  const ids = (process.env.SHEET_IDS || 'p05,p03,p10,p14,p21,p23,p28,p31').split(',');
  const tools = { smooth: { tool: 'smooth', params: { strength: 60, soften: 30 }, label: 'Smooth 60' }, light: { tool: 'light', params: { exposure: 0.3, contrast: 20, warmth: 25, saturation: 15 }, label: 'Light & colour' }, whiten: { tool: 'whiten', params: { strength: 100 }, label: 'Whiten 100' }, eyes: { tool: 'eyes', params: { brighten: 60, clarity: 60 }, label: 'Eyes 60/60' },
    reshape: { tool: 'reshape', params: { jaw: 60, chin: 40, noseW: 50, noseL: 0, eyeSize: 40, eyeDist: 0, lips: 40, faceW: 50 }, label: 'Reshape 60/40/50/40/40/50' },
    makeup: { tool: 'makeup', params: { lip: 30, blush: 25, brow: 25, colour: 1 }, label: 'Makeup coral 30/25/25' },
    filters: { tool: 'filters', params: { look: 4, strength: 60 }, label: 'Filter Film 60' },
    liquify: { tool: 'liquify', params: { rel: true }, label: 'Liquify: push jaw in, bloat eyes' } };
  for (const [name, spec] of Object.entries(tools)) {
    const tiles = [];
    for (const id of ids) {
      const p = manifest.find((m) => m.id === id) ?? JSON.parse(fs.readFileSync(path.join(root, 'testdata/manifest.json'), 'utf8')).photos.find((m) => m.id === id);
      const b64 = await page.evaluate(async ({ file, spec, label }) => {
        const f = await window.H.setFace(file); if (!f) return null;
        const base = await window.H.toolFrame(null, null);
        let aft;
        if (spec.params.rel) { const [bx, by, bw, bh] = f.box; const t = window.__diiTest; t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().setCompare(false);
          t.store.getState().edit({ tool: 'liquify', params: { pts: [{ x: bx + bw * 0.02, y: by + bh * 0.8 }, { x: bx + bw * 0.14, y: by + bh * 0.82 }], r: bw * 0.18, strength: 60, mode: 'push' } });
          t.store.getState().edit({ tool: 'liquify', params: { pts: [{ x: bx + bw * 0.98, y: by + bh * 0.8 }, { x: bx + bw * 0.86, y: by + bh * 0.82 }], r: bw * 0.18, strength: 60, mode: 'push' } });
          t.store.getState().edit({ tool: 'liquify', params: { pts: [{ x: bx + bw * 0.5, y: by + bh * 0.9 }], r: bw * 0.15, strength: 50, mode: 'pucker' } });
          await new Promise((r) => setTimeout(r, 400)); aft = window.__dii.renderer.readOutHalf(); }
        else aft = await window.H.toolFrame(spec.tool, spec.params);
        const [bx, by, bw, bh] = f.box; const pad = 0.25; const x0 = Math.max(0, Math.floor(bx - bw * pad)), y0 = Math.max(0, Math.floor(by - bh * pad)), x1 = Math.min(base.w, Math.ceil(bx + bw * (1 + pad))), y1 = Math.min(base.h, Math.ceil(by + bh * (1 + pad)));
        const w = x1 - x0, h = y1 - y0;
        const mk = (fr) => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); const im = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y0 + y) * fr.w + x0 + x) * 4, o = (y * w + x) * 4; for (let k = 0; k < 3; k++) im.data[o + k] = Math.round(Math.min(1, fr.data[i + k]) * 255); im.data[o + 3] = 255; } g.putImageData(im, 0, 0); return c; };
        const out = new OffscreenCanvas(w * 2 + 8, h + 22), g = out.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, out.width, out.height);
        g.drawImage(mk(base), 0, 22); g.drawImage(mk(aft), w + 8, 22); g.fillStyle = '#fff'; g.font = '14px sans-serif'; g.fillText(file + '   before | after: ' + label, 4, 15);
        const blob = await out.convertToBlob({ type: 'image/png' }); const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(bin);
      }, { file: p.file, spec, label: spec.label });
      if (b64) fs.writeFileSync(path.join(outDir, `${name}_${id}_${p.mst_group_visual_estimate}.png`), Buffer.from(b64, 'base64'));
    }
  }
  console.log('sheets written to', outDir);
}

if (!only || only === 'filters') {
  const M = T.metrics; const subset = manifest.filter((p, i) => i % 3 === 0); const rowsAll = {};
  const looks = ['Natural boost', 'Warm glow', 'Cool', 'Matte', 'Film', 'Mono', 'Vivid', 'Soft pastel'];
  const idOk = await page.evaluate(async () => {
    const f = await window.H.setFace('photos/p05.jpg'); const base = await window.H.toolFrame(null, null);
    let worst = 0; for (let l = 0; l < 8; l++) { const fr = await window.H.toolFrame('filters', { look: l, strength: 0 }); for (let i = 0; i < fr.data.length; i++) worst = Math.max(worst, Math.abs(fr.data[i] - base.data[i]) * 255); }
    // monotone: mean abs change from base grows with strength for each look
    let viol = 0; for (let l = 0; l < 8; l++) { let prev = -1; for (let st = 0; st <= 100; st += 5) { const fr = await window.H.toolFrame('filters', { look: l, strength: st }); let d = 0; for (let i = 0; i < fr.data.length; i += 4 * 9) d += Math.abs(fr.data[i] - base.data[i]) + Math.abs(fr.data[i + 1] - base.data[i + 1]) + Math.abs(fr.data[i + 2] - base.data[i + 2]); if (d < prev - 1e-6) viol++; prev = d; } }
    return { worst, viol };
  });
  check('M_lc_identity_max_diff filters (strength 0)', idOk.worst, idOk.worst <= M.M_lc_identity_max_diff.max);
  check('M_lc_monotone_violations filters', idOk.viol, idOk.viol <= M.M_lc_monotone_violations.max);
  for (const p of subset) {
    const r = await page.evaluate(async ({ file, n }) => {
      const f = await window.H.setFace(file); if (!f) return null;
      const base = await window.H.toolFrame(null, null);
      await window.H.toolFrame('filters', { look: 0, strength: 40 }); const mk = window.__dii.renderer.readMask(); if (!mk) return null;
      const idxs = []; for (let y = 0; y < mk.h; y += 3) for (let x = 0; x < mk.w; x += 3) if (mk.data[(y * mk.w + x) * 4] >= 0.99) idxs.push(y * mk.w + x);
      const out = [];
      for (let l = 0; l < n; l++) { const fr = await window.H.toolFrame('filters', { look: l, strength: 40 }); let clip = 0; for (let i = 0; i < fr.data.length; i += 4) for (let c = 0; c < 3; c++) if ((fr.data[i + c] >= 1 && base.data[i + c] < 1) || (fr.data[i + c] <= 0 && base.data[i + c] > 0)) clip++; out.push({ look: l, hue: window.H.hueShift(base, fr, idxs), clip: clip / (base.w * base.h * 3) }); }
      return out;
    }, { file: p.file, n: looks.length });
    if (!r) continue; (rowsAll[groupOf[p.id]] ??= []).push(...r.map((x) => ({ id: p.id, ...x }))); if (process.env.DBG) console.log(p.id, JSON.stringify(r.map((x) => +x.hue.toFixed(2))));
  }
  for (const [g, rows] of Object.entries(rowsAll)) {
    for (let l = 0; l < looks.length; l++) { const rr = rows.filter((x) => x.look === l); const lim = (l === 1 || l === 2) ? 8 : 3; const mx = Math.max(...rr.map((x) => x.hue)); check(`M_skin_hue_shift_deg filter ${looks[l]} MST ${g}`, mx, mx <= lim, { limit: lim, n: rr.length }); }
    const cl = Math.max(...rows.map((x) => x.clip)); check(`M_clipped_px_increase filters MST ${g}`, cl, cl <= M.M_clipped_px_increase.max);
  }
}

if (!only || only === 'makeup') {
  const M = T.metrics; const subset = manifest.filter((p, i) => i % 3 === 0); const rowsAll = {};
  for (const p of subset) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); if (!f) return null;
      const base = await window.H.toolFrame(null, null);
      const out = [];
      for (const colour of [0, 1, 2, 3, 4]) {
        const fr = await window.H.toolFrame('makeup', { lip: 24, blush: 20, brow: 20, colour }); const mk = window.__dii.renderer.readMask('makeup'); if (!mk) return null;
        const N = base.w * base.h; const sel = []; let outside = 0, clip = 0;
        for (let i = 0; i < N; i++) { const v = Math.max(mk.data[i * 4], mk.data[i * 4 + 1], mk.data[i * 4 + 2]); if (v >= 0.5) sel.push(i);
          for (let c = 0; c < 3; c++) { const d = Math.abs(fr.data[i * 4 + c] - base.data[i * 4 + c]) * 255; if (v === 0 && d > 1) { outside++; break; } if ((fr.data[i * 4 + c] >= 1 && base.data[i * 4 + c] < 1) || (fr.data[i * 4 + c] <= 0 && base.data[i * 4 + c] > 0)) clip++; } }
        if (sel.length < 30) { out.push({ colour, skip: true }); continue; }
        const L = (a, i) => 0.2126 * a.data[i * 4] + 0.7152 * a.data[i * 4 + 1] + 0.0722 * a.data[i * 4 + 2];
        let ma = 0, mb = 0; for (const i of sel) { ma += L(base, i); mb += L(fr, i); } ma /= sel.length; mb /= sel.length;
        let cov = 0, va = 0, vb = 0; for (const i of sel) { const a = L(base, i) - ma, b = L(fr, i) - mb; cov += a * b; va += a * a; vb += b * b; }
        out.push({ colour, corr: cov / Math.sqrt(Math.max(1e-12, va * vb)), outside, clip: clip / (N * 3), n: sel.length });
      }
      return out;
    }, p.file);
    if (!r) continue; (rowsAll[groupOf[p.id]] ??= []).push(...r.filter((x) => !x.skip).map((x) => ({ id: p.id, ...x }))); if (process.env.DBG) console.log(p.id, JSON.stringify(r.map((x) => x.corr && +x.corr.toFixed(3))));
  }
  for (const [g, rows] of Object.entries(rowsAll)) {
    const mn = Math.min(...rows.map((x) => x.corr)), mxo = Math.max(...rows.map((x) => x.outside)), mc = Math.max(...rows.map((x) => x.clip));
    check(`M_makeup_luma_correlation MST ${g}`, mn, mn >= M.M_makeup_luma_correlation.min, { n: rows.length });
    check(`M_outside_mask_changed_px makeup MST ${g}`, mxo, mxo <= 0);
    check(`M_clipped_px_increase makeup MST ${g}`, mc, mc <= M.M_clipped_px_increase.max);
  }
}

if (!only || only === 'background') {
  const M = T.metrics; const subset = manifest.filter((p, i) => i % 3 === 0); const rowsAll = {};
  for (const p of subset) {
    const r = await page.evaluate(async (file) => {
      const f = await window.H.setFace(file); const t = window.__diiTest;
      const base = await window.H.toolFrame(null, null);
      const out = [];
      for (const params of [{ mode: 1, blur: 0, edge: 40, colour: 1 }, { mode: 1, blur: 0, edge: 40, colour: 0 }, { mode: 0, blur: 70, edge: 40, colour: 0 }, { mode: 2, blur: 0, edge: 80, colour: 2 }]) {
        t.store.setState({ history: { ops: [], ptr: 0, open: null } }); t.store.getState().edit({ tool: 'background', params });
        for (let i = 0; i < 600 && !t.store.getState().bgRaw; i++) await new Promise((r) => setTimeout(r, 100));
        await new Promise((r) => setTimeout(r, 700));
        const fr = window.__dii.renderer.readOutHalf(); const st = t.store.getState(); const alpha = t.refinedAlpha(st.image.preview, st.bgRaw, params.edge);
        const N = base.w * base.h; let core = 0, coreN = 0, bgChanged = 0, bgN = 0;
        for (let i = 0; i < N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(fr.data[i * 4 + c] - base.data[i * 4 + c]) * 255);
          if (alpha[i] > 250) { coreN++; if (d > 1) core++; } else if (alpha[i] < 5) { bgN++; if (d > 3) bgChanged++; } }
        out.push({ core, coreN, bgFrac: bgN ? bgChanged / bgN : 0, bgN, black: params.colour === 1 && params.mode === 1 });
      }
      return out;
    }, p.file);
    if (!r) continue; (rowsAll[groupOf[p.id]] ??= []).push(...r.map((x) => ({ id: p.id, ...x }))); if (process.env.DBG) console.log(p.id, JSON.stringify(r));
  }
  for (const [g, rows] of Object.entries(rowsAll)) {
    const mx = Math.max(...rows.map((x) => x.core)); check(`M_bg_person_core_changed_px MST ${g}`, mx, mx <= M.M_bg_person_core_changed_px.max, { n: rows.length });
    const withBg = rows.filter((x) => x.black && x.bgN > 2000); const eff = withBg.length ? Math.min(...withBg.map((x) => x.bgFrac)) : 1; check(`background_visibly_changed (black replace: >=20% of background px differ) MST ${g}`, eff, withBg.length === 0 || eff >= 0.2, { n: withBg.length });
  }
}

check('no_page_errors', errs.slice(0, 3), errs.length === 0);
await browser.close(); server.close();
fs.writeFileSync('/tmp/tools-report.json', JSON.stringify(results, null, 1));
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
