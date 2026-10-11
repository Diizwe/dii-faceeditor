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
      await window.T.load(file);
      const t = window.__diiTest; const img = t.store.getState().image;
      const faces = await t.detectFaces(img.preview); if (!faces.length) return null;
      const f = faces.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0];
      const base = await window.H.frame(file, null);
      const disk = (idx) => { const [cx, cy] = f.mesh[idx]; const rr = Math.max(3, f.box[2] * 0.04); const px = []; for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr && x >= 0 && y >= 0 && x < base.w && y < base.h) px.push([x, y]); return px; };
      // cheeks (left 205, right 425) and forehead-ish mid cheek (50 / 280) as skin samples
      const pts = [...disk(205), ...disk(425), ...disk(50), ...disk(280)];
      const meanHue = (fr) => { let sx = 0, sy = 0; for (const [x, y] of pts) { const i = (y * fr.w + x) * 4; const h = window.H.hue(fr.data[i], fr.data[i + 1], fr.data[i + 2]) * Math.PI / 180; sx += Math.cos(h); sy += Math.sin(h); } return Math.atan2(sy, sx) * 180 / Math.PI; };
      const h0 = meanHue(base); let worst = 0; window.__dbg = { n: pts.length, h0, sample: Array.from(base.data.slice(((base.h - 1 - pts[0][1]) * base.w + pts[0][0]) * 4, ((base.h - 1 - pts[0][1]) * base.w + pts[0][0]) * 4 + 4)), p0: pts[0], w: base.w, h: base.h, unflipped: Array.from(base.data.slice((pts[0][1] * base.w + pts[0][0]) * 4, (pts[0][1] * base.w + pts[0][0]) * 4 + 4)), nz: base.data.reduce((a, v) => a + (v > 0 ? 1 : 0), 0) / base.data.length };
      for (const L of [{ warmth: 50 }, { warmth: -50 }, { saturation: 50 }, { saturation: -50 }]) {
        const fr = await window.H.frame(file, { exposure: 0, contrast: 0, warmth: 0, saturation: 0, ...L });
        let d = meanHue(fr) - h0; d = ((d + 540) % 360) - 180; worst = Math.max(worst, Math.abs(d)); (window.__dbg.per ??= []).push([JSON.stringify(L), +d.toFixed(2)]);
      }
      return worst;
    }, p.file);
    if (r === null) continue;
    if (process.env.DBG) console.log(p.id, r, JSON.stringify(await page.evaluate(() => window.__dbg)));
    (hue[groupOf[p.id]] ??= []).push(r);
  }
  for (const [g, v] of Object.entries(hue)) { const mx = Math.max(...v); check(`M_skin_hue_shift_deg light MST ${g}`, mx, mx <= T.metrics.M_skin_hue_shift_deg.max, { n: v.length }); }
}

check('no_page_errors', errs.slice(0, 3), errs.length === 0);
await browser.close(); server.close();
fs.writeFileSync('/tmp/tools-report.json', JSON.stringify(results, null, 1));
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
