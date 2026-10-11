// Face-mesh regions (MediaPipe 468-point topology) and mask rasterisation. Points are in working-image pixels.
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIPS_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
export const EYE_L = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const BROW_L = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
export const BROW_R = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
export const NOSTRILS = [64, 98, 97, 2, 326, 327, 294, 4];
export const CHEEK_SAMPLES = [205, 425, 50, 280];

export type Pt = [number, number, number?];
const poly = (mesh: Pt[], idx: number[]) => idx.map((i) => mesh[i]);

function grow(pts: Pt[], k: number): Pt[] {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
}

export interface FaceRegions { skin: Pt[][]; holes: Pt[][]; }

/** Skin = face oval minus eyes, brows, lips, nostrils (holes slightly grown so edges stay out of the mask). */
export function regions(mesh: Pt[]): FaceRegions {
  return {
    skin: [poly(mesh, FACE_OVAL)],
    holes: [grow(poly(mesh, EYE_L), 1.35), grow(poly(mesh, EYE_R), 1.35), grow(poly(mesh, BROW_L), 1.25), grow(poly(mesh, BROW_R), 1.25), grow(poly(mesh, LIPS_OUTER), 1.15), grow(poly(mesh, NOSTRILS), 1.1)],
  };
}

/** Rasterise a hard-edged mask (255 inside) into a canvas of w x h; `map` converts mesh px to canvas px. */
export function rasterMask(mesh: Pt[], w: number, h: number, map: (x: number, y: number) => [number, number]): HTMLCanvasElement | OffscreenCanvas {
  const c: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const R = regions(mesh);
  const path = (pts: Pt[]) => { pts.forEach((p, i) => { const [x, y] = map(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  g.fillStyle = '#fff'; g.beginPath(); R.skin.forEach(path); g.fill();
  g.fillStyle = '#000'; for (const hole of R.holes) { g.beginPath(); path(hole); g.fill(); }
  return c;
}
