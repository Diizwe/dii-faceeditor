import { Renderer } from '../gl/renderer';
import { decodeFull, type LoadedImage } from './image';
import { outToSource, outputSize, apply, type Affine, type Geometry } from './geometry';
import { JpegWriter } from './jpeg';
import { PngWriter } from './png';

export interface ExportOptions {
  format: 'jpeg' | 'png';
  quality: number;
  geometry: Geometry;
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
  let T = o.tile ?? 2048;
  const margin = 2;
  const full = await decodeFull(img);
  try {
    // shrink tile until every tile's source bounding box fits the texture limit
    const bbox = (tx: number, ty: number, tw: number, th: number) => {
      const pts = [[tx, ty], [tx + tw, ty], [tx, ty + th], [tx + tw, ty + th]].map(([x, y]) => apply(m, x, y));
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - margin)), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - margin));
      const x1 = Math.min(full.width, Math.ceil(Math.max(...pts.map((p) => p[0])) + margin)), y1 = Math.min(full.height, Math.ceil(Math.max(...pts.map((p) => p[1])) + margin));
      return { x0, y0, w: x1 - x0, h: y1 - y0 };
    };
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
          const bmp = await createImageBitmap(full, b.x0, b.y0, Math.max(1, b.w), Math.max(1, b.h), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
          // tile affine: tile px (u,v) -> output (tx+u, ty+v) -> source -> bbox-local
          const tm: Affine = [m[0], m[1], m[0] * tx + m[1] * ty + m[2] - b.x0, m[3], m[4], m[3] * tx + m[4] * ty + m[5] - b.y0];
          const px = r.renderTilePixels(bmp, tm, tw, th);
          peak = Math.max(peak, bmp.width * bmp.height * 4 + tw * th * 4);
          bmp.close();
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
