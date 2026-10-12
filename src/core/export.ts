import { Renderer, type Plan } from '../gl/renderer';
import { rasterMask, rasterTeeth, rasterIris, rasterMakeup } from './facemask';
import { skinStats } from './skin';
import type { EditState } from './edit';
import { buildField } from './reshape';
import { buildLiquify } from './liquify';
import { BG_COLOURS } from './background';
import { buildPatches, applyPatches, type HealOp, type Patch } from './healer';
import { decodeFull, type LoadedImage } from './image';
import { outToSource, outputSize, apply, invert, type Affine, type Geometry } from './geometry';
import { JpegWriter } from './jpeg';
import { PngWriter } from './png';

export interface ExportOptions {
  format: 'jpeg' | 'png';
  quality: number;
  geometry: Geometry;
  bgAlpha?: { w: number; h: number; data: Uint8Array }; // refined person alpha at preview resolution (needed when edit.background is set)
  heal?: HealOp[]; // clean-up strokes in source px, applied before everything else
  edit?: EditState; // retouch + colour on top of the geometry; omitted = geometry only
  tile?: number; // output tile edge, default 2048
  maxTextureSize?: number; // enforced limit; iPhone-class default 4096
  onProgress?: (f: number) => void;
  renderer?: Renderer; // injected for tests
}

export interface ExportResult { blob: Blob; width: number; height: number; tiles: number; peakTextureBytes: number; }

const BAND = 256; // output rows per band; multiple of 8

/** Tiled, colour-preserving export at full resolution: geometry is replayed on the original per tile. */
export async function exportImage(img: LoadedImage, o: ExportOptions): Promise<ExportResult> {
  const [outW, outH] = outputSize(o.geometry, img.width, img.height);
  const m = outToSource(o.geometry, img.width, img.height, outW, outH);
  const canvas = new OffscreenCanvas(16, 16);
  const r = o.renderer ?? new Renderer(canvas, { colorSpace: img.colorMode, maxTextureSize: o.maxTextureSize ?? 4096 });
  const E = o.edit, hasPasses = !!(E && (E.smooth || E.light || E.whiten || E.eyes || E.filter || E.makeup || E.reshape || E.liquify.length > 0 || (E.background && o.bgAlpha)));
  let T = o.tile ?? (hasPasses ? 1024 : 2048);
  const k = img.previewScale;
  const fwFull = E?.face ? E.face.box[2] / k : 0; // face width in full-resolution px: every radius is a multiple of it
  // support of the widest pass (edge-aware base, fine blur, mask feather) plus slack, so tile seams cannot show
  const basePad = E?.smooth || E?.face || E?.eyes ? Math.ceil(Math.max(3 * 0.012 * fwFull, 3 * Math.max(1, 0.015 * fwFull) / 2)) + 4 : 0;
  // the warp samples up to maxDisp px away, so tiles need that much extra context on top of the retouch support
  const warpPad = E?.reshape && E.face ? (() => { const mesh = (E.face.mesh as [number, number, number][]).map((p) => { const [x, y] = apply(invert(outToSource(o.geometry, img.width, img.height, outW, outH)), p[0] / img.previewScale, p[1] / img.previewScale); return [x, y, 0] as [number, number, number]; }); const f = buildField(mesh, fwFull, E.reshape); return f ? Math.ceil(f.maxDisp) + 4 : 0; })() : 0;
  const liqR = E?.liquify.length ? Math.max(...E.liquify.map((q) => q.r)) : 0; // a liquify stroke moves content at most about one brush radius
  const bgBlurPx = E?.background && E.background.mode === 0 && o.bgAlpha ? (E.background.blur / 100) * 0.012 * Math.min(outW, outH) : 0;
  const pad = basePad + warpPad + Math.ceil(liqR * 1.1) + Math.ceil(bgBlurPx * 3);
  const margin = 2;
  // liquify: one grid for the whole output (same cell count as the preview), reused by every region with its origin shifted, so tiles match the preview exactly
  const liqGrid = E?.liquify.length ? (() => { const cell = 6 / k; const st = E.liquify.map((q) => ({ mode: q.mode, strength: q.strength, r: q.r, pts: q.pts.map((p) => { const [x, y] = apply(invert(outToSource(o.geometry, img.width, img.height, outW, outH)), p.x, p.y); return { x, y }; }) })); return buildLiquify(st, 0, 0, outW, outH, cell); })() : null;
  const skin = E?.face ? skinStats(img.preview, E.face.mesh as [number, number, number][], E.face.box[2]) : null;
  const full = await decodeFull(img);
  const patches: Patch[] = o.heal?.length ? buildPatches(full, o.heal, img.colorMode) : [];
  const crop = async (b: { x0: number; y0: number; w: number; h: number }) => applyPatches(await createImageBitmap(full, b.x0, b.y0, Math.max(1, b.w), Math.max(1, b.h), { premultiplyAlpha: 'none' }), b.x0, b.y0, patches, img.colorMode);
  try {
    // shrink tile until every tile's source bounding box fits the texture limit
    const bbox = (tx: number, ty: number, tw: number, th: number) => {
      const pts = [[tx, ty], [tx + tw, ty], [tx, ty + th], [tx + tw, ty + th]].map(([x, y]) => apply(m, x, y));
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - margin - pad)), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - margin - pad));
      const x1 = Math.min(full.width, Math.ceil(Math.max(...pts.map((p) => p[0])) + margin + pad)), y1 = Math.min(full.height, Math.ceil(Math.max(...pts.map((p) => p[1])) + margin + pad));
      return { x0, y0, w: x1 - x0, h: y1 - y0 };
    };
    const outSrcToOut = invert(m); // full-res source px -> output px
    const outputSizeSrcW = outW; // fw is measured in source px; output scale is 1:1 with the source here
    for (;;) {
      let ok = true;
      for (let ty = 0; ty < outH && ok; ty += T) for (let tx = 0; tx < outW && ok; tx += T) {
        const b = bbox(tx, ty, Math.min(T, outW - tx), Math.min(T, outH - ty));
        if (b.w > r.maxTex || b.h > r.maxTex) ok = false;
      }
      if (ok || T <= 64) break;
      T = T >> 1;
    }
    const writer = o.format === 'jpeg' ? new JpegWriter({ width: outW, height: outH, quality: o.quality, icc: img.icc }) : new PngWriter(outW, outH, img.icc);
    const band = new Uint8Array(outW * BAND * 4);
    let tiles = 0, peak = 0;
    for (let by = 0; by < outH; by += BAND) {
      const bh = Math.min(BAND, outH - by);
      for (let tx = 0; tx < outW; tx += T) {
        const tw = Math.min(T, outW - tx);
        // a band may span several tile rows when T < BAND; render in tile-height slices
        for (let ty = by; ty < by + bh; ty += T) {
          const th = Math.min(T, by + bh - ty);
          const b = bbox(tx, ty, tw, th);
          const bmp = hasPasses ? null : await crop(b);
          let px: Uint8Array;
          if (!hasPasses) {
            // tile px (u,v) -> output (tx+u, ty+v) -> source -> bbox-local
            const tm: Affine = [m[0], m[1], m[0] * tx + m[1] * ty + m[2] - b.x0, m[3], m[4], m[3] * tx + m[4] * ty + m[5] - b.y0];
            px = r.renderTilePixels(bmp!, tm, tw, th);
          } else {
            // render an enlarged region (tile + pad on every side that is not an image edge) so blurs see their full support
            const rx0 = Math.max(0, tx - pad), ry0 = Math.max(0, ty - pad), rx1 = Math.min(outW, tx + tw + pad), ry1 = Math.min(outH, ty + th + pad);
            const rw = rx1 - rx0, rh = ry1 - ry0;
            const rb = bbox(rx0, ry0, rw, rh);
            const bmp2 = await crop(rb);
            const rm: Affine = [m[0], m[1], m[0] * rx0 + m[1] * ry0 + m[2] - rb.x0, m[3], m[4], m[3] * rx0 + m[4] * ry0 + m[5] - rb.y0];
            const plan: Plan = { m: rm, w: rw, h: rh, light: E!.light, smooth: E!.smooth, whiten: E!.whiten, eyes: E!.eyes, filter: E!.filter, makeup: E!.makeup, face: null };
            if (E!.face && skin) {
              // mesh (preview px) -> full-res source px -> output px -> region px
              const toRegion = (x: number, y: number): [number, number] => { const [ox, oy] = apply(outSrcToOut, x / k, y / k); return [ox - rx0, oy - ry0]; };
              const mesh = E!.face.mesh as [number, number, number][];
              plan.face = { mask: rasterMask(mesh, rw, rh, toRegion), teeth: E!.whiten ? rasterTeeth(mesh, rw, rh, toRegion) : null, iris: E!.eyes ? rasterIris(mesh, rw, rh, toRegion) : null, makeup: E!.makeup ? rasterMakeup(mesh, fwFull, rw, rh, toRegion) : null, maskKey: `${tx},${ty}`, fw: fwFull * (outW / outputSizeSrcW), skin };
            }
            if (E!.reshape && E!.face) {
              const meshR = (E!.face.mesh as [number, number, number][]).map((q) => { const [ox, oy] = apply(outSrcToOut, q[0] / k, q[1] / k); return [ox - rx0, oy - ry0, 0] as [number, number, number]; });
              const field = buildField(meshR, fwFull, E!.reshape);
              if (field) plan.warp = { field, key: `${tx},${ty}` };
            }
            if (liqGrid) plan.liquify = { grid: { ...liqGrid, x0: liqGrid.x0 - rx0, x1: liqGrid.x1 - rx0, y0: liqGrid.y0 - ry0, y1: liqGrid.y1 - ry0 }, key: `${tx},${ty}` };
            if (E!.background && o.bgAlpha) {
              const c1 = BG_COLOURS[E!.background.colour] ?? BG_COLOURS[0], c2 = BG_COLOURS[(E!.background.colour + 2) % BG_COLOURS.length];
              plan.bg = { alpha: o.bgAlpha, key: `edge${E!.background.edge}`, m: rm.map((v) => v * k) as Affine, mode: E!.background.mode, blurPx: bgBlurPx, c1: c1.rgb, c2: c2.rgb };
            }
            px = r.renderRegionPixels(bmp2, plan, { x: tx - rx0, y: ty - ry0, w: tw, h: th });
            peak = Math.max(peak, bmp2.width * bmp2.height * 4 + rw * rh * 16 * 5);
            bmp2.close();
            for (let y = 0; y < th; y++) band.set(px.subarray(y * tw * 4, (y + 1) * tw * 4), ((ty - by + y) * outW + tx) * 4);
            tiles++;
            continue;
          }
          peak = Math.max(peak, bmp!.width * bmp!.height * 4 + tw * th * 4);
          bmp!.close();
          for (let y = 0; y < th; y++) band.set(px.subarray(y * tw * 4, (y + 1) * tw * 4), ((ty - by + y) * outW + tx) * 4);
          tiles++;
        }
      }
      // FBO rows are bottom-up in image terms only for the canvas; our targets keep row 0 = image top (see Renderer)
      writer.addRows(band, bh);
      o.onProgress?.(Math.min(1, (by + bh) / outH));
    }
    const blob = writer instanceof JpegWriter ? writer.finish() : await writer.finish();
    return { blob, width: outW, height: outH, tiles, peakTextureBytes: peak };
  } finally {
    full.close();
    if (!o.renderer) r.dispose();
  }
}
