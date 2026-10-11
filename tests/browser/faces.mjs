// Face picker suite: recall per skin-tone group on the test grid, model cache on second load.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'spec/thresholds.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'testdata/manifest.json'), 'utf8')).photos.filter((p) => !process.env.ONLY || process.env.ONLY.split(',').includes(p.id));
const { server, port } = await serve(path.join(root, 'dist'), { mounts: { '/testdata/': path.join(root, 'testdata') } });
const base = `http://127.0.0.1:${port}/`;
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 428, height: 926 } });
let failed = false;
const check = (n, v, ok, x = {}) => { if (!ok) failed = true; console.log(ok ? 'PASS' : 'FAIL', n, JSON.stringify(v), JSON.stringify(x)); };

const run = async (second) => {
  const page = await ctx.newPage();
  const modelReqs = []; page.on('request', (r) => { if (r.url().includes('/models/')) modelReqs.push(r.url().split('/').pop()); });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(base);
  const out = [];
  const t0 = Date.now();
  for (const p of manifest) {
    const r = await page.evaluate(async (file) => {
      const blob = await (await fetch('/testdata/' + file)).blob();
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const t = performance.now();
      const faces = await window.__diiTest.detectFaces(bmp);
      return { n: faces.length, ms: Math.round(performance.now() - t), mesh: faces.map((f) => f.mesh.length), boxes: faces.map((f) => f.box.map(Math.round)), w: bmp.width, h: bmp.height };
    }, p.file);
    out.push({ id: p.id, group: p.mst_group_visual_estimate, labelled: p.faces, pose: p.pose, ...r });
    if (second) break;
  }
  await page.close();
  return { out, modelReqs, errs, secs: (Date.now() - t0) / 1000 };
};

const first = await run(false);
console.log('first load: model requests', first.modelReqs.length, 'total seconds', first.secs);
const groups = {};
for (const o of first.out) {
  const g = (groups[o.group] ??= { lab: 0, hit: 0, fp: 0, photos: 0 });
  g.lab += o.labelled; g.hit += Math.min(o.labelled, o.n); g.fp += Math.max(0, o.n - o.labelled); g.photos++;
  if (o.n !== o.labelled) console.log('  mismatch', o.id, 'labelled', o.labelled, 'detected', o.n, o.pose);
}
const rec = {};
for (const [g, v] of Object.entries(groups)) { rec[g] = v.hit / v.lab; check(`M_face_recall_frontal MST ${g}`, rec[g], rec[g] >= T.metrics.M_face_recall_frontal.min, { ...v }); }
const vals = Object.values(rec); const gap = Math.max(...vals) - Math.min(...vals);
check('M_face_recall_group_gap', gap, gap <= T.metrics.M_face_recall_group_gap.max);
const fp = Object.values(groups).reduce((n, g) => n + g.fp, 0); check('false_outlines', fp, fp === 0);
const meshOk = first.out.every((o) => o.mesh.every((m) => m >= 468)); check('mesh_468_points', meshOk, meshOk);
const slow = Math.max(...first.out.map((o) => o.ms)); console.log('max detect ms (software GPU)', slow);
// landmark remap through crop & rotate vs re-detection (single-face photos)
{
  const page = await ctx.newPage(); await page.goto(base);
  const ids = manifest.filter((p) => p.faces === 1).slice(0, 8).map((p) => p.file);
  // small rotations only: re-detecting a face turned 90 degrees is itself unreliable, so it is not a fair reference
  // (flips are excluded: a mirrored mesh has left/right indices swapped, so index-wise comparison is meaningless)
  const geos = [{ rot90: 0, flipH: false, flipV: false, angle: 9, aspect: null }, { rot90: 0, flipH: false, flipV: false, angle: -14, aspect: 1 }, { rot90: 0, flipH: false, flipV: false, angle: 0, aspect: 0.8 }];
  const errs = await page.evaluate(async ({ ids, geos }) => {
    const t = window.__diiTest, out = [];
    for (const file of ids) {
      const blob = await (await fetch('/testdata/' + file)).blob();
      const img = await t.loadImage(blob, file);
      const big = (fs) => fs.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0];
      const f0 = big(await t.detectFaces(img.preview)); if (!f0) { out.push({ file, miss: true }); continue; }
      for (const g of geos) {
        const res = await t.exportImage(img, { format: 'png', quality: 100, geometry: g });
        const bmp = await createImageBitmap(res.blob, { colorSpaceConversion: 'none' });
        const f1 = big(await t.detectFaces(bmp)); if (!f1) { out.push({ file, g: g.angle, miss: true }); continue; }
        const m = t.sourceToOut(g, img.width, img.height, res.width, res.height);
        const k = img.previewScale; let e = 0, n = 0;
        for (let i = 0; i < Math.min(f0.mesh.length, f1.mesh.length, 468); i++) { const [x, y] = t.apply(m, f0.mesh[i][0] / k, f0.mesh[i][1] / k); e += Math.hypot(x - f1.mesh[i][0], y - f1.mesh[i][1]); n++; }
        out.push({ file, g: g.angle, aspect: g.aspect, err: e / n / f1.box[2], box0: f0.box.map(Math.round), box1: f1.box.map(Math.round), out: [res.width, res.height] });
      }
    }
    return out;
  }, { ids, geos });
  const ok = errs.filter((e) => !e.miss); const mean = ok.reduce((a, e) => a + e.err, 0) / ok.length;
  console.log('remap detail', JSON.stringify(errs.map((e) => e.miss ? 'miss' : +e.err.toFixed(4))));
  for (const e of errs) if (e.err > 0.03) console.log('  large', JSON.stringify(e));
  check('M_landmark_remap_error_frac_fw', mean, mean <= T.metrics.M_landmark_remap_error_frac_fw.max, { n: ok.length, misses: errs.length - ok.length });
  await page.close();
}
const second = await run(true);
check('M_model_second_load_network_requests', second.modelReqs.length, second.modelReqs.length === 0, { reqs: second.modelReqs });
check('no_page_errors', [...first.errs, ...second.errs].slice(0, 3), first.errs.length + second.errs.length === 0);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
