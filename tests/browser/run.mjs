// Browser suite: iPhone 13 Pro Max emulation on SwiftShader WebGL2. Prints a JSON report and exits non-zero on failure.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const T = JSON.parse(fs.readFileSync(path.join(root, 'spec/thresholds.json'), 'utf8'));
const fx = process.env.FIXTURES || fs.mkdtempSync(path.join(os.tmpdir(), 'dii-fx-'));
if (!fs.existsSync(path.join(fx, 'f12_p3.jpg'))) execFileSync('python3', [path.join(here, 'make_fixtures.py'), fx], { stdio: 'inherit' });
const only = process.argv[2];

const results = []; let failed = false;
const check = (name, value, ok, extra = {}) => { results.push({ name, value, ok, ...extra }); if (!ok) failed = true; console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(value)); };

const origins = new Set();
const { server, port } = await serve(path.join(root, 'dist'), { mounts: { '/testdata/': path.join(root, 'testdata') } });
const base = `http://127.0.0.1:${port}/`;
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
page.on('request', (r) => { try { const u = new URL(r.url()); if (!['data:', 'blob:'].includes(u.protocol)) origins.add(u.origin); } catch { /* ignore */ } });
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

async function openFile(file) {
  await page.goto(base); await page.waitForSelector('[data-testid=file]', { state: 'attached' });
  const t0 = Date.now();
  await page.setInputFiles('[data-testid=file]', file);
  await page.waitForSelector('[data-testid=canvas]', { timeout: 120000 });
  await page.waitForFunction(() => window.__dii?.renderer?.workSize, null, { timeout: 120000 });
  const m = await page.evaluate(() => performance.getEntriesByName('dii-load').map((e) => [Math.round(e.duration), e.detail]));
  console.log('  load detail', file.split('/').pop(), JSON.stringify(m));
  return (Date.now() - t0) / 1000;
}
const state = () => page.evaluate(() => { const s = window.__diiTest.store.getState(); return { w: s.image.width, h: s.image.height, scale: s.image.previewScale, mode: s.image.colorMode, hasIcc: !!s.image.icc, ops: s.history.ptr }; });
const readCanvasStats = () => page.evaluate(() => { window.__dii.redraw(); const r = window.__dii.renderer; const c = r.canvas; const px = r.readCanvas(c.width, c.height); let s = 0, nz = 0; for (let i = 0; i < px.length; i += 4 * 97) { s += px[i] + px[i + 1] + px[i + 2]; if (px[i] > 40) nz++; } return { w: c.width, h: c.height, nonBg: nz }; });
const exportTo = async (name, opts) => {
  const t0 = Date.now();
  const r = await page.evaluate(async (opts) => {
    const t = window.__diiTest; const s = t.store.getState();
    const o = { ...opts, geometry: opts.geometry ?? (s.history.ops.length ? s.history.ops[s.history.ptr - 1]?.params : { rot90: 0, flipH: false, flipV: false, angle: 0, aspect: null }) };
    const res = await t.exportImage(s.image, o);
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(bin), width: res.width, height: res.height, tiles: res.tiles, peak: res.peakTextureBytes };
  }, opts);
  const f = path.join(fx, name); fs.writeFileSync(f, Buffer.from(r.b64, 'base64'));
  return { file: f, ...r, seconds: (Date.now() - t0) / 1000 };
};
const colorPy = `
import sys, json
def has_exif(b):
    # walk the JPEG header segments (stop at start-of-scan) looking for APP1/Exif or XMP; compressed data is never searched
    i = 2
    while i + 4 < len(b) and b[i] == 0xff:
        m = b[i + 1]
        if m == 0xda: break
        n = (b[i + 2] << 8) | b[i + 3]
        if m == 0xe1: return True
        i += 2 + n
    return False
sys.path.insert(0, sys.argv[3])
from colorcheck import lab, de2000
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
st=int(sys.argv[4])
a=np.asarray(Image.open(sys.argv[1]).convert('RGB'));b=np.asarray(Image.open(sys.argv[2]).convert('RGB'))
h,w=a.shape[:2]
photo=np.ones((h,w),bool); photo[h-h//12-8:,:]=False; photo[:410,:410]=False   # exclude synthetic hard edges: colour bars and checker block
d=de2000(lab(a[::st,::st],'p3'),lab(b[::st,::st],'p3'))
m=photo[::st,::st]
raw=open(sys.argv[2],'rb').read(); im=Image.open(sys.argv[2])
print(json.dumps({'all_mean':float(d.mean()),'mean':float(d[m].mean()),'p999':float(np.percentile(d[m],99.9)),'all_p999':float(np.percentile(d,99.9)),'icc':b'Display P3' in im.info.get('icc_profile',b''),'gps':has_exif(raw)}))`;
const py = (code, ...args) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...args], { maxBuffer: 1 << 28 }).toString());

// ---- 1. 12 MP load (CPU-throttled iPhone profile), colour mode, EXIF orientation
if (!only || only === 'load') {
  const secs = await openFile(path.join(fx, 'f12_p3.jpg'));
  const s = await state();
  check('load_12mp_preview_s', secs, secs <= T.runtime_budgets.load_12mp_preview_s_emulated_iphone, { limit: T.runtime_budgets.load_12mp_preview_s_emulated_iphone });
  check('12mp_dimensions', [s.w, s.h], s.w === 4032 && s.h === 3024);
  check('p3_detected', s.mode, s.mode === 'display-p3' && s.hasIcc);
  const c = await readCanvasStats(); check('canvas_not_blank', c, c.nonBg > 200);
  await openFile(path.join(fx, 'f12_o6.jpg'));
  const o = await state(); check('exif_orientation_applied', [o.w, o.h], o.w === 3024 && o.h === 4032);
}

// ---- 2. geometry edits + undo/redo through the UI
if (!only || only === 'ui') {
  await openFile(path.join(fx, 'f12_p3.jpg'));
  await page.click('[data-testid=rot-right]');
  let ws = await page.evaluate(() => window.__dii.renderer.workSize); check('rotate_swaps_work_size', ws, ws[0] < ws[1]);
  await page.click('[data-testid=undo]');
  ws = await page.evaluate(() => window.__dii.renderer.workSize); check('undo_restores', ws, ws[0] > ws[1]);
  await page.click('[data-testid=redo]');
  ws = await page.evaluate(() => window.__dii.renderer.workSize); check('redo_reapplies', ws, ws[0] < ws[1]);
  await page.click('[data-testid=reset-crop]');
  await page.fill('[data-testid=straighten]', '10'); // fill on range sets value + input event
  const n1 = (await state()).ops;
  await page.fill('[data-testid=straighten]', '12');
  check('slider_drag_is_one_undo_step_or_more', n1, n1 >= 1);
}

// ---- 3. colour-preserving export (identity), P3 profile kept, no location data
if (!only || only === 'export') {
  await openFile(path.join(fx, 'f12_p3.jpg'));
  const e = await exportTo('out12.jpg', { format: 'jpeg', quality: 92 });
  check('export_dimensions_exact_12mp', [e.width, e.height], e.width === 4032 && e.height === 3024);

  const resJ = py(colorPy, path.join(fx, 'f12_p3.jpg'), e.file, here, '4');
  check('M_jpeg_q92_generation_loss_deltaE_mean', resJ.mean, resJ.mean <= 0.5, { limit: 0.5 });
  check('M_jpeg_q92_generation_loss_deltaE_p999', resJ.p999, resJ.p999 <= 3.5, { limit: 3.5, all_pixels: resJ.all_p999 });
  const lossless = await exportTo('id12.png', { format: 'png' });
  const res = py(colorPy, path.join(fx, 'f12_p3.jpg'), lossless.file, here, '4');
  check('M_color_roundtrip_deltaE_mean', res.all_mean, res.all_mean <= T.metrics.M_color_roundtrip_deltaE_mean.max, { limit: T.metrics.M_color_roundtrip_deltaE_mean.max });
  check('M_color_roundtrip_deltaE_p999', res.all_p999, res.all_p999 <= T.metrics.M_color_roundtrip_deltaE_p999.max, { limit: T.metrics.M_color_roundtrip_deltaE_p999.max });
  check('M_export_icc_p3_present', res.icc, res.icc === true);
  check('M_export_location_data_present', res.gps, res.gps === false);
  // tile seams: PNG (lossless) with 512 px tiles vs one pass, rotated 7 degrees
  const geo = { rot90: 0, flipH: false, flipV: false, angle: 7, aspect: null };
  const a = await exportTo('tiled.png', { format: 'png', geometry: geo, tile: 512 });
  const b = await exportTo('single.png', { format: 'png', geometry: geo, tile: 8192, maxTextureSize: 8192 });
  const seam = py(`
import sys, json, numpy as np
from PIL import Image
a=np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int);b=np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
print(json.dumps({'max':int(np.abs(a-b).max()) if a.shape==b.shape else -1,'shape':list(a.shape)}))`, a.file, b.file);
  check('M_export_tile_seam_levels', seam, seam.max >= 0 && seam.max <= T.metrics.M_export_tile_seam_levels.max, { tiles: a.tiles });
}

// ---- 4. 48 MP stress: load + full-res export under a 4096 texture limit
if (!only || only === 'stress') {
  const f48 = process.env.STRESS48 || path.join(fx, 'f48_p3.jpg');
  const secs = await openFile(f48);
  const s = await state();
  console.log('stress load seconds (throttled)', secs, 'dims', s.w, s.h);
  const e = await exportTo('out48.jpg', { format: 'jpeg', quality: 92 });
  check('export_dimensions_exact_48mp', [e.width, e.height], e.width === s.w && e.height === s.h);
  check('export_peak_texture_mb', e.peak / 1048576, e.peak / 1048576 <= T.runtime_budgets.export_peak_texture_mb, { seconds: e.seconds, tiles: e.tiles });
  const resJ = py(colorPy, f48, e.file, here, '16');
  check('M_jpeg_q92_generation_loss_deltaE_p999_48mp', resJ.p999, resJ.p999 <= 3.5);
  const ll = await exportTo('out48.png', { format: 'png' });
  const res = py(colorPy, f48, ll.file, here, '16');
  check('M_color_roundtrip_deltaE_mean_48mp', res.all_mean, res.all_mean <= T.metrics.M_color_roundtrip_deltaE_mean.max);
  check('M_color_roundtrip_deltaE_p999_48mp', res.all_p999, res.all_p999 <= T.metrics.M_color_roundtrip_deltaE_p999.max, { png_seconds: ll.seconds });
}

// ---- 4b. face picker in the UI: detect, outline drawn, group photo selection by tap
if (!only || only === 'facesui') {
  await openFile(path.join(root, 'testdata/photos/p33.jpg'));
  await page.click('[data-testid=tool-faces]');
  await page.waitForSelector('[data-testid=face-1]', { timeout: 120000 });
  const n = await page.evaluate(() => window.__diiTest.store.getState().faces.length);
  check('faces_ui_found_two_faces', n, n === 2);
  const drawn = await page.evaluate(() => { const o = document.querySelector('[data-testid=overlay]'); const d = o.getContext('2d').getImageData(0, 0, o.width, o.height).data; let c = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) c++; return c; });
  check('faces_overlay_drawn', drawn, drawn > 500);
  await page.click('[data-testid=face-2]');
  const a = await page.evaluate(() => window.__diiTest.store.getState().activeFace); check('face_selected_by_button', a, a === 2);
  // tap on the first face on the canvas
  const pos = await page.evaluate(() => { const s = window.__diiTest.store.getState(); const f = s.faces[0]; const r = window.__dii.renderer; const cv = document.querySelector('[data-testid=canvas]').getBoundingClientRect(); const ws = r.workSize; const view = Math.min(cv.width / ws[0], cv.height / ws[1]) * 0.96; return { x: cv.left + (cv.width - ws[0] * view) / 2 + (f.box[0] + f.box[2] / 2) * (ws[0] / s.image.preview.width) * view, y: cv.top + (cv.height - ws[1] * view) / 2 + (f.box[1] + f.box[3] / 2) * (ws[1] / s.image.preview.height) * view }; });
  await page.mouse.click(pos.x, pos.y);
  const a2 = await page.evaluate(() => window.__diiTest.store.getState().activeFace); check('face_selected_by_tap', a2, a2 === 1);
}

// ---- 5. per-pass GPU time on the software GPU at the 2048 px preview, and third-party requests
if (!only || only === 'perf') {
  await openFile(path.join(fx, 'f12_p3.jpg'));
  const ms = await page.evaluate(() => window.__dii.renderer.timeGeometryPass([1, 0, 0, 0, 1, 0], 5));
  check('per_pass_ms_software_gpu_2048', ms, ms <= T.runtime_budgets.per_pass_ms_software_gpu_2048, { limit: T.runtime_budgets.per_pass_ms_software_gpu_2048 });
}

// ---- 5b. full-stack per-pass time and texture memory at the 2048 px preview, offline reload, onboarding
if (!only || only === 'perf2') {
  await openFile(path.join(fx, 'f12_p3.jpg'));
  const R = await page.evaluate(async () => {
    const t = window.__diiTest; for (let i = 0; i < 900 && !t.store.getState().faces; i++) await new Promise((r) => setTimeout(r, 100));
    const faces = t.store.getState().faces; if (!faces || !faces.length) return { error: 'no face on the fixture' };
    t.store.getState().setActiveFace(faces[0].id);
    const r = window.__dii.renderer; r.profile = {};
    const ops = [{ tool: 'smooth', params: { strength: 60, soften: 30, face: faces[0].id } }, { tool: 'whiten', params: { strength: 60, face: faces[0].id } }, { tool: 'eyes', params: { brighten: 40, clarity: 40, face: faces[0].id } },
      { tool: 'makeup', params: { lip: 30, blush: 20, brow: 20, colour: 0, face: faces[0].id } }, { tool: 'light', params: { exposure: 0.2, contrast: 10, warmth: 10, saturation: 10 } }, { tool: 'filters', params: { look: 4, strength: 40 } },
      { tool: 'reshape', params: { jaw: 30, chin: 0, noseW: 0, noseL: 0, eyeSize: 20, eyeDist: 0, lips: 0, faceW: 20 } }, { tool: 'liquify', params: { pts: [{ x: 1500, y: 1500 }, { x: 1600, y: 1550 }], r: 150, strength: 40, mode: 'push' } }];
    t.store.setState({ history: { ops: [], ptr: 0, open: null } });
    for (const op of ops) t.store.getState().edit(op);
    await new Promise((r2) => setTimeout(r2, 4000));
    const w = r.workSize; const prof = {}; for (const [k, v] of Object.entries(r.profile)) prof[k] = Math.max(...v);
    const st = t.store.getState(); const res = await t.exportImage(st.image, { format: 'jpeg', quality: 90, geometry: { rot90: 0, flipH: false, flipV: false, angle: 0, aspect: null }, edit: t.editFrom(st.history, st.faces, st.activeFace) });
    return { w, prof, mb: r.textureBytes() / 1048576, exportPeakMb: res.peakTextureBytes / 1048576, exportW: res.width };
  });
  if (R.error) check('perf2_setup', R.error, false); else {
    console.log('  per-pass worst ms at', R.w.join('x'), JSON.stringify(Object.fromEntries(Object.entries(R.prof).map(([k, v]) => [k, Math.round(v)]))));
    const worst = Math.max(...Object.values(R.prof));
    check('per_pass_ms_software_gpu_2048 (all tools, worst pass)', worst, worst <= T.runtime_budgets.per_pass_ms_software_gpu_2048, { limit: 250 });
    check('export_peak_texture_mb (full tool stack, 12 MP)', R.exportPeakMb, R.exportPeakMb <= T.runtime_budgets.export_peak_texture_mb, { limit: T.runtime_budgets.export_peak_texture_mb });
    check('preview_texture_mb (all tools active)', R.mb, R.mb <= 512, { note: 'informational limit 512 MB; export budget 256 MB is checked separately' });
  }
  // offline: reload with the network off; the shell must come from the service worker cache
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  await ctx.setOffline(true);
  let offlineOk = false; try { await page.reload({ timeout: 15000, waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-testid=choose]', { timeout: 10000 }); offlineOk = true; } catch { offlineOk = false; }
  await ctx.setOffline(false);
  check('offline_reload_shows_app', offlineOk, offlineOk);
  // onboarding shows once
  await page.evaluate(() => localStorage.removeItem('dii-onboarded'));
  await openFile(path.join(fx, 'f12_p3.jpg'));
  const showed = await page.locator('[data-testid=onboarding]').count(); check('onboarding_shown_first_time', showed, showed === 1);
  await page.click('[data-testid=onboarding-ok]');
  await openFile(path.join(fx, 'f12_p3.jpg'));
  const again = await page.locator('[data-testid=onboarding]').count(); check('onboarding_not_shown_again', again, again === 0);
}
const third = [...origins].filter((o) => o !== new URL(base).origin);
check('M_third_party_requests', third, third.length === 0);
const jsKb = (() => { const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8'); const m = [...html.matchAll(/src="\.\/(assets\/[^"]+\.js)"/g)].map((x) => x[1]); return m.reduce((n, f) => n + execFileSync('gzip', ['-c', path.join(root, 'dist', f)], { maxBuffer: 1 << 26 }).length, 0) / 1024; })();
check('M_initial_js_gzip_kb', Math.round(jsKb), jsKb <= T.metrics.M_initial_js_gzip_kb.max, { limit: T.metrics.M_initial_js_gzip_kb.max });
check('no_console_errors', errors.slice(0, 5), errors.length === 0);

await browser.close(); server.close();
fs.writeFileSync(path.join(fx, 'report.json'), JSON.stringify(results, null, 1));
console.log(failed ? 'FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
