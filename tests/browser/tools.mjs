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
    smooth: [{ tool: 'smooth', params: { strength: 60, keep: 70, face: null } }],
    light: [{ tool: 'light', params: { exposure: 0.4, contrast: 25, warmth: 30, saturation: 20 } }],
    combo: [{ tool: 'geometry', params: { rot90: 0, flipH: false, flipV: false, angle: 6, aspect: 0.8 } }, { tool: 'smooth', params: { strength: 40, keep: 70, face: null } }, { tool: 'light', params: { exposure: -0.2, contrast: 10, warmth: -20, saturation: 10 } }],
  };
  const M = T.metrics;
  for (const [name, ops] of Object.entries(cases)) {
    const rows = [];
    for (const file of files) {
      const r = await page.evaluate(async ({ file, ops }) => {
        await window.H.setFace(file); const st = window.__diiTest.store.getState();
        const o = ops.map((op) => (op.tool === 'smooth' ? { ...op, params: { ...op.params, face: st.activeFace } } : op));
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
      let eb = 0, ea = 0, n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rr(x, y) <= W.R * 1.2) { const i = y * w + x; for (let c = 0; c < 3; c++) { eb += Math.abs(before.data[i * 4 + c] * 255 - clean[i * 4 + c]); ea += Math.abs(after.data[i * 4 + c] * 255 - clean[i * 4 + c]); } n++; }
      // determinism: second run from the same state
      t.store.setState({ history: { ops: [], ptr: 0, open: null } }); await frame();
      t.store.getState().edit({ tool: 'heal', params: tap });
      let after2 = null; for (let i = 0; i < 40; i++) { after2 = await frame(); let diff = 0; for (let j = 0; j < after2.data.length; j += 4 * 11) diff += Math.abs(after2.data[j] - before.data[j]); if (diff > 0) break; }
      let det = 0; for (let i = 0; i < after.data.length; i++) if (after.data[i] !== after2.data[i]) det++;
      return { outside, stdRatio: stdIn / stdRing, seam, residual: n ? ea / Math.max(1e-6, eb) : 0, det, changed: eb > 0 };
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
    check(`heal_removes_blemish (residual error / original error) MST ${g}`, mx('residual'), mx('residual') <= 0.5);
  }
}

check('no_page_errors', errs.slice(0, 3), errs.length === 0);
await browser.close(); server.close();
fs.writeFileSync('/tmp/tools-report.json', JSON.stringify(results, null, 1));
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
