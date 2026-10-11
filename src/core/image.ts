import { extractIcc, classifyIcc, pngProfileName, type ColorMode } from './icc';

export interface LoadedImage {
  /** full-resolution oriented size */
  width: number;
  height: number;
  /** working preview (long edge <= previewLongEdge) */
  preview: ImageBitmap;
  previewScale: number; // preview.width / width
  colorMode: 'srgb' | 'display-p3';
  /** profile to re-embed on export (P3 only); null otherwise */
  icc: Uint8Array | null;
  /** colour conversion the decoder needs: 'none' keeps raw values (sRGB, P3), 'default' converts other profiles to sRGB */
  conversion: 'none' | 'default';
  file: Blob;
  name: string;
}

export const PREVIEW_LONG_EDGE = 2048;

export class ImageError extends Error {}

function sniff(b: Uint8Array): 'jpeg' | 'png' | 'heic' | 'webp' | 'unknown' {
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'png';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(...b.subarray(8, 12));
    if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)$/.test(brand)) return 'heic';
  }
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  return 'unknown';
}

async function decodeHeic(file: Blob): Promise<Blob> {
  // Native decode first (iOS Safari); otherwise lazy-load libheif and convert to PNG.
  try { await createImageBitmap(file); return file; } catch { /* fall through */ }
  const { decodeHeicToPng } = await import('./heic');
  return decodeHeicToPng(file);
}

/** Decode, apply EXIF orientation, detect the colour space and build the working preview. */
export async function loadImage(file: Blob, name = 'photo'): Promise<LoadedImage> {
  const head = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
  const kind = sniff(head);
  if (kind === 'unknown') throw new ImageError('This file type is not supported. Use a JPEG, PNG, WebP or HEIC photo.');
  let source = file;
  let icc: Uint8Array | null = null;
  let mode: ColorMode = 'srgb';
  if (kind === 'heic') {
    source = await decodeHeic(file); // libheif path loses the profile; treated as sRGB
  } else if (kind === 'jpeg') {
    icc = extractIcc(head); mode = classifyIcc(icc);
  } else if (kind === 'png') {
    const n = pngProfileName(head);
    mode = n && /P3/i.test(n) ? 'display-p3' : n && !/sRGB/i.test(n) ? 'other' : 'srgb';
    icc = null; // PNG profile is not re-embedded; P3 PNGs are exported without a profile and flagged in the UI
    if (mode === 'display-p3') mode = 'other';
  }
  // 'other' profiles are converted to sRGB by the browser (default); P3 and sRGB keep raw values.
  const opts: ImageBitmapOptions = { imageOrientation: 'from-image', colorSpaceConversion: mode === 'other' ? 'default' : 'none', premultiplyAlpha: 'none' };
  const t0 = performance.now();
  let full: ImageBitmap;
  try { full = await createImageBitmap(source, opts); }
  catch { throw new ImageError('This photo could not be opened. It may be damaged or too large for this device.'); }
  const tDecode = performance.now() - t0;
  const width = full.width, height = full.height;
  const k = Math.min(1, PREVIEW_LONG_EDGE / Math.max(width, height));
  let preview: ImageBitmap;
  if (k === 1) preview = full;
  else {
    preview = await createImageBitmap(full, { resizeWidth: Math.round(width * k), resizeHeight: Math.round(height * k), resizeQuality: 'high' }); // no colorSpaceConversion here: passing 'none' on a bitmap that was already converted would silently revert it to the raw profile values
    full.close();
  }
  if (mode === 'other') icc = null;
  performance.measure?.('dii-load', { start: t0, end: performance.now(), detail: { decodeMs: Math.round(tDecode) } });
  return { width, height, preview, previewScale: preview.width / width, colorMode: mode === 'display-p3' ? 'display-p3' : 'srgb', icc: mode === 'display-p3' ? icc : null, conversion: mode === 'other' ? 'default' : 'none', file: source, name };
}

/** Full-resolution oriented bitmap, decoded on demand for export and released by the caller. */
export async function decodeFull(img: LoadedImage): Promise<ImageBitmap> {
  return createImageBitmap(img.file, { imageOrientation: 'from-image', colorSpaceConversion: img.conversion, premultiplyAlpha: 'none' });
}
