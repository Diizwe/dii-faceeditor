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

// ---- teeth and iris regions -----------------------------------------------------------------------------------------
export const IRIS_R = 468; // right-eye iris centre in the 478-point mesh; 469-472 are its rim
export const IRIS_L = 473; // left-eye iris centre; 474-477 are its rim

const canvasOf = (w: number, h: number): HTMLCanvasElement | OffscreenCanvas =>
  typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Inner-lip polygon (the mouth opening). The Whiten shader then keeps only bright, yellow-ish pixels inside it. */
export function rasterTeeth(mesh: Pt[], w: number, h: number, map: (x: number, y: number) => [number, number]) {
  const c = canvasOf(w, h), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.beginPath();
  poly(mesh, LIPS_INNER).forEach((p, i) => { const [x, y] = map(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.fill();
  return c;
}

/** Iris discs clipped to the eye outline, so lids, lashes and sclera are never in the mask. Null if the mesh has no iris points. */
export function rasterIris(mesh: Pt[], w: number, h: number, map: (x: number, y: number) => [number, number]) {
  if (mesh.length < 478) return null;
  const c = canvasOf(w, h), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const centroid = (idx: number[]) => [idx.reduce((a, i) => a + mesh[i][0], 0) / idx.length, idx.reduce((a, i) => a + mesh[i][1], 0) / idx.length];
  for (const [centre, rim] of [[IRIS_R, [469, 470, 471, 472]], [IRIS_L, [474, 475, 476, 477]]] as const) {
    // pair each iris with the nearer eye outline (the model's left/right numbering is not reliable across versions)
    const [ix, iy] = [mesh[centre][0], mesh[centre][1]];
    const eye = [EYE_L, EYE_R].map((e) => ({ e, d: Math.hypot(centroid(e)[0] - ix, centroid(e)[1] - iy) })).sort((a, b) => a.d - b.d)[0].e;
    const [cx, cy] = map(mesh[centre][0], mesh[centre][1]);
    const rad = rim.reduce((a, i) => { const [x, y] = map(mesh[i][0], mesh[i][1]); return a + Math.hypot(x - cx, y - cy); }, 0) / rim.length;
    g.save(); g.beginPath();
    poly(mesh, [...eye]).forEach((p, i) => { const [x, y] = map(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.closePath(); g.clip();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, rad * 0.96, 0, Math.PI * 2); g.fill(); g.restore();
  }
  return c;
}

/** Makeup regions in one raster: R = lips (outer minus the open mouth), G = cheek blush ellipses, B = brows. */
export function rasterMakeup(mesh: Pt[], fw: number, w: number, h: number, map: (x: number, y: number) => [number, number]) {
  const c = canvasOf(w, h), g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const path = (pts: Pt[]) => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = map(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  g.fillStyle = '#f00'; path(grow(poly(mesh, LIPS_OUTER), 0.93)); g.fill();   // slightly inside the lip line so colour never spills onto skin
  g.fillStyle = '#000'; path(grow(poly(mesh, LIPS_INNER), 1.25)); g.fill();   // and clear of teeth and the mouth interior
  g.globalCompositeOperation = 'lighter';
  const scale = (() => { const [a, b] = [map(0, 0), map(1, 0)]; return Math.hypot(b[0] - a[0], b[1] - a[1]); })();
  const cxm = map(FACE_OVAL.reduce((a, i) => a + mesh[i][0], 0) / FACE_OVAL.length, mesh[1][1])[0];
  g.fillStyle = '#0f0';
  for (const i of [205, 425]) { const [x, y] = map(mesh[i][0], mesh[i][1]); g.beginPath(); g.ellipse(x + (cxm - x) * 0.15, y - fw * 0.03 * scale, fw * 0.11 * scale, fw * 0.08 * scale, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#00f'; path(poly(mesh, BROW_L)); g.fill(); path(poly(mesh, BROW_R)); g.fill();
  return c;
}
