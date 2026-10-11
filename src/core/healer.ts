import type { Op } from './history';
import type { HealJob } from './heal.worker';

export interface HealOp { pts: { x: number; y: number }[]; r: number; } // source (full-resolution, oriented) pixels

export const healOps = (ops: Op[]): HealOp[] => ops.filter((o) => o.tool === 'heal').map((o) => o.params as HealOp);

/** Heals the preview bitmap in a worker; keeps the last result so adding a stroke only heals that stroke. */
export class PreviewHealer {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (d: Uint8ClampedArray) => void>();
  private base: ImageData | null = null;
  private state: { key: string; ops: HealOp[]; pixels: Uint8ClampedArray } | null = null;

  constructor(private preview: ImageBitmap, private k: number, private colorSpace: 'srgb' | 'display-p3') {}

  private getWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./heal.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; data: Uint8ClampedArray }>) => { this.pending.get(e.data.id)?.(e.data.data); this.pending.delete(e.data.id); };
    }
    return this.worker;
  }

  private baseData(): ImageData {
    if (!this.base) {
      const c = new OffscreenCanvas(this.preview.width, this.preview.height);
      const g = c.getContext('2d', { colorSpace: this.colorSpace, willReadFrequently: true })!;
      g.drawImage(this.preview, 0, 0);
      this.base = g.getImageData(0, 0, c.width, c.height, { colorSpace: this.colorSpace });
    }
    return this.base;
  }

  private run(pixels: Uint8ClampedArray, strokes: HealOp[]): Promise<Uint8ClampedArray> {
    const id = ++this.seq, w = this.preview.width, h = this.preview.height;
    const job: HealJob = { id, w, h, data: pixels, strokes: strokes.map((s) => ({ x: 0, y: 0, r: s.r * this.k, pts: s.pts.map((p) => ({ x: p.x * this.k, y: p.y * this.k })) })) };
    return new Promise((res) => { this.pending.set(id, res); this.getWorker().postMessage(job, [pixels.buffer]); });
  }

  /** Returns a bitmap with the ops applied (the original preview when there are none). */
  async apply(ops: HealOp[]): Promise<ImageBitmap> {
    if (!ops.length) { this.state = null; return this.preview; }
    const key = JSON.stringify(ops);
    let start: { pixels: Uint8ClampedArray; from: number };
    if (this.state && this.state.key === key) start = { pixels: this.state.pixels, from: ops.length };
    else if (this.state && ops.length > this.state.ops.length && JSON.stringify(ops.slice(0, this.state.ops.length)) === this.state.key) start = { pixels: this.state.pixels.slice(), from: this.state.ops.length };
    else start = { pixels: this.baseData().data.slice(), from: 0 };
    const out = start.from === ops.length ? start.pixels : await this.run(start.pixels, ops.slice(start.from));
    this.state = { key, ops: ops.slice(), pixels: out };
    const c = new OffscreenCanvas(this.preview.width, this.preview.height);
    const g = c.getContext('2d', { colorSpace: this.colorSpace })!;
    g.putImageData(new ImageData(out.slice(), c.width, c.height, { colorSpace: this.colorSpace }), 0, 0);
    return createImageBitmap(c, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  }

  dispose() { this.worker?.terminate(); this.worker = null; }
}

// ---- full-resolution heal for export -------------------------------------------------------------------------------
import { healDisc, BLEND_MARGIN } from './heal';

export interface Patch { x: number; y: number; w: number; h: number; data: Uint8ClampedArray; }
type Space = 'srgb' | 'display-p3';

function overlay(dst: Uint8ClampedArray, dx0: number, dy0: number, dw: number, dh: number, patches: Patch[]) {
  for (const p of patches) {
    const x0 = Math.max(dx0, p.x), y0 = Math.max(dy0, p.y), x1 = Math.min(dx0 + dw, p.x + p.w), y1 = Math.min(dy0 + dh, p.y + p.h);
    for (let y = y0; y < y1; y++) {
      const so = ((y - p.y) * p.w + (x0 - p.x)) * 4, d = ((y - dy0) * dw + (x0 - dx0)) * 4;
      dst.set(p.data.subarray(so, so + (x1 - x0) * 4), d);
    }
  }
}

/** Heal every disc of every op at full resolution, one local region at a time. Returns the changed patches in order. */
export function buildPatches(full: ImageBitmap, ops: HealOp[], space: Space): Patch[] {
  const patches: Patch[] = [];
  for (const op of ops) {
    const spacing = 0.5 * op.r;
    const discs: { x: number; y: number }[] = [];
    op.pts.forEach((p, i) => {
      if (i === 0) { discs.push(p); return; }
      const q = op.pts[i - 1], n = Math.floor(Math.hypot(p.x - q.x, p.y - q.y) / spacing);
      for (let j = 1; j <= n; j++) discs.push({ x: q.x + ((p.x - q.x) * j) / n, y: q.y + ((p.y - q.y) * j) / n });
    });
    for (const d of discs) {
      const R = op.r * (1 + BLEND_MARGIN), reach = Math.min(1536, Math.ceil(R * 4.5) + Math.ceil(R * 1.4) + 14);
      const rx = Math.max(0, Math.floor(d.x - reach)), ry = Math.max(0, Math.floor(d.y - reach));
      const rw = Math.min(full.width, Math.ceil(d.x + reach)) - rx, rh = Math.min(full.height, Math.ceil(d.y + reach)) - ry;
      if (rw <= 0 || rh <= 0) continue;
      const c = new OffscreenCanvas(rw, rh), g = c.getContext('2d', { colorSpace: space, willReadFrequently: true })!;
      g.drawImage(full, rx, ry, rw, rh, 0, 0, rw, rh);
      const im = g.getImageData(0, 0, rw, rh, { colorSpace: space });
      overlay(im.data, rx, ry, rw, rh, patches);
      const box = healDisc({ w: rw, h: rh, data: im.data }, d.x - rx, d.y - ry, op.r);
      if (!box) continue;
      const pd = new Uint8ClampedArray(box.w * box.h * 4);
      for (let y = 0; y < box.h; y++) pd.set(im.data.subarray(((box.y + y) * rw + box.x) * 4, ((box.y + y) * rw + box.x + box.w) * 4), y * box.w * 4);
      patches.push({ x: rx + box.x, y: ry + box.y, w: box.w, h: box.h, data: pd });
    }
  }
  return patches;
}

/** Return a copy of a tile bitmap (whose top-left is at x0,y0 in the full image) with the overlapping patches applied. */
export async function applyPatches(bmp: ImageBitmap, x0: number, y0: number, patches: Patch[], space: Space): Promise<ImageBitmap> {
  const hit = patches.filter((p) => p.x < x0 + bmp.width && p.y < y0 + bmp.height && p.x + p.w > x0 && p.y + p.h > y0);
  if (!hit.length) return bmp;
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { colorSpace: space, willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height, { colorSpace: space });
  overlay(im.data, x0, y0, c.width, c.height, hit);
  g.putImageData(im, 0, 0);
  bmp.close();
  return createImageBitmap(c, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}
