import { refineAlpha } from './guided';

export const BG_COLOURS: { name: string; rgb: [number, number, number] }[] = [
  { name: 'White', rgb: [1, 1, 1] }, { name: 'Black', rgb: [0.05, 0.05, 0.06] }, { name: 'Sky', rgb: [0.62, 0.78, 0.93] },
  { name: 'Sage', rgb: [0.68, 0.78, 0.66] }, { name: 'Blush', rgb: [0.95, 0.80, 0.80] }, { name: 'Sand', rgb: [0.85, 0.77, 0.64] },
];
export const BG_MODES = ['Blur', 'Colour', 'Gradient'];
export interface BgOp { mode: number; blur: number; edge: number; colour: number }
export const defaultBg = (): BgOp => ({ mode: 0, blur: 40, edge: 40, colour: 0 });

const pixelCache = new WeakMap<ImageBitmap, Uint8ClampedArray>();
export function previewPixels(bmp: ImageBitmap): Uint8ClampedArray {
  let d = pixelCache.get(bmp);
  if (!d) { const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(bmp, 0, 0); d = g.getImageData(0, 0, c.width, c.height).data; pixelCache.set(bmp, d); }
  return d;
}

/** Refined person alpha as 8-bit, at preview resolution. */
export function refinedAlpha(preview: ImageBitmap, raw: { w: number; h: number; alpha: Float32Array }, edge: number): Uint8Array {
  const a = new Float32Array(raw.alpha.length); for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, raw.alpha[i] / 255));
  const r = refineAlpha(a, previewPixels(preview), raw.w, raw.h, edge), out = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) out[i] = Math.round(r[i] * 255);
  return out;
}
