import { CHEEK_SAMPLES, type Pt } from './facemask';

/** Skin colour statistics (Cb/Cr of encoded RGB) from cheek and mid-cheek discs of one face. */
export function skinStats(preview: ImageBitmap, mesh: Pt[], fw: number): { cb: number; cr: number; tol: number } {
  const c = new OffscreenCanvas(preview.width, preview.height);
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(preview, 0, 0);
  const r = Math.max(3, Math.round(fw * 0.035));
  let n = 0, sb = 0, sr = 0, sb2 = 0, sr2 = 0;
  for (const idx of CHEEK_SAMPLES) {
    const [cx, cy] = mesh[idx];
    const x0 = Math.max(0, Math.round(cx - r)), y0 = Math.max(0, Math.round(cy - r));
    const w = Math.min(preview.width - x0, 2 * r + 1), h = Math.min(preview.height - y0, 2 * r + 1);
    if (w <= 0 || h <= 0) continue;
    const d = g.getImageData(x0, y0, w, h).data;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i] / 255, G = d[i + 1] / 255, B = d[i + 2] / 255;
      const cb = -0.168736 * R - 0.331264 * G + 0.5 * B, cr = 0.5 * R - 0.418688 * G - 0.081312 * B;
      n++; sb += cb; sr += cr; sb2 += cb * cb; sr2 += cr * cr;
    }
  }
  if (!n) return { cb: -0.05, cr: 0.08, tol: 0.1 };
  const mb = sb / n, mr = sr / n;
  const sd = Math.sqrt(Math.max(0, (sb2 / n - mb * mb) + (sr2 / n - mr * mr)));
  return { cb: mb, cr: mr, tol: Math.max(0.08, Math.min(0.2, 3 * sd + 0.04)) };
}
