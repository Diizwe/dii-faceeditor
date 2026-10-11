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
const second = await run(true);
check('M_model_second_load_network_requests', second.modelReqs.length, second.modelReqs.length === 0, { reqs: second.modelReqs });
check('no_page_errors', [...first.errs, ...second.errs].slice(0, 3), first.errs.length + second.errs.length === 0);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
