import { solveTps, evalTps } from './tps';
import { FACE_OVAL, EYE_L, EYE_R, LIPS_OUTER, type Pt } from './facemask';

export interface ReshapeParams { jaw: number; chin: number; noseW: number; noseL: number; eyeSize: number; eyeDist: number; lips: number; faceW: number; } // each -100..100
export const RESHAPE_IDS = ['jaw', 'chin', 'noseW', 'noseL', 'eyeSize', 'eyeDist', 'lips', 'faceW'] as const;
export const zeroReshape = (): ReshapeParams => ({ jaw: 0, chin: 0, noseW: 0, noseL: 0, eyeSize: 0, eyeDist: 0, lips: 0, faceW: 0 });
export const isReshapeIdentity = (r: ReshapeParams) => RESHAPE_IDS.every((k) => r[k] === 0);

const MAX_DISP = 0.06; // of face width at |slider| = 100
const JAW = [172, 136, 150, 149, 176, 148, 377, 400, 378, 379, 365, 397, 288, 361, 58, 132];
const CHIN = [152, 148, 377, 176, 400, 175, 396];
const NOSE_W = [98, 327, 129, 358, 49, 279, 64, 294];
const NOSE_L = [4, 1, 2, 5];
const FACE_SIDES = [234, 127, 162, 93, 132, 454, 356, 389, 323, 361];

export interface Field {
  G: number; x0: number; y0: number; x1: number; y1: number; // grid covers [x0,x1]x[y0,y1] in working px
  data: Float32Array; // G*G*2 backward displacement B: out(p) samples in(p + B(p))
  maxDisp: number;
}

/** Moves of the control landmarks (forward: where each landmark should go), in px. */
function moves(mesh: Pt[], fw: number, r: ReshapeParams): Map<number, [number, number]> {
  const m = new Map<number, [number, number]>();
  const add = (i: number, dx: number, dy: number) => { const o = m.get(i) ?? [0, 0]; m.set(i, [o[0] + dx, o[1] + dy]); };
  const cx = FACE_OVAL.reduce((a, i) => a + mesh[i][0], 0) / FACE_OVAL.length;
  const cy = FACE_OVAL.reduce((a, i) => a + mesh[i][1], 0) / FACE_OVAL.length;
  const D = MAX_DISP * fw;
  const towardsCentreX = (i: number, k: number) => add(i, -Math.sign(mesh[i][0] - cx) * k * D, 0);
  const lowJaw = (i: number) => mesh[i][1] > cy; // only the lower face for the jaw slider
  // positive slider = narrower / shorter / smaller
  for (const i of JAW) if (lowJaw(i)) towardsCentreX(i, (r.jaw / 100) * 0.9);
  for (const i of CHIN) add(i, 0, -(r.chin / 100) * D * 0.9);
  for (const i of NOSE_W) towardsCentreX(i, (r.noseW / 100) * 0.5);
  for (const i of NOSE_L) add(i, 0, -(r.noseL / 100) * D * 0.4);
  for (const eye of [EYE_L, EYE_R]) {
    const ex = eye.reduce((a, i) => a + mesh[i][0], 0) / eye.length, ey = eye.reduce((a, i) => a + mesh[i][1], 0) / eye.length;
    for (const i of eye) { const k = (r.eyeSize / 100) * 0.35; add(i, (mesh[i][0] - ex) * k, (mesh[i][1] - ey) * k); add(i, -Math.sign(ex - cx) * (r.eyeDist / 100) * D * 0.4, 0); }
  }
  const lx = LIPS_OUTER.reduce((a, i) => a + mesh[i][0], 0) / LIPS_OUTER.length, ly = LIPS_OUTER.reduce((a, i) => a + mesh[i][1], 0) / LIPS_OUTER.length;
  for (const i of LIPS_OUTER) add(i, 0, (mesh[i][1] - ly) * (r.lips / 100) * 0.35);
  void lx;
  for (const i of FACE_SIDES) towardsCentreX(i, (r.faceW / 100) * 0.9);
  return m;
}

/**
 * Backward-map field for the given sliders. Control points sit at the MOVED landmark positions with value -move, so out(q) = in(q - move) = in(p).
 * A smooth window confines the effect to the face plus a tight falloff band (0.35 fw); beyond it the field is exactly zero.
 */
export function buildField(mesh: Pt[], fw: number, r: ReshapeParams, G = 48): Field | null {
  if (isReshapeIdentity(r) || mesh.length < 468) return null;
  const mv = moves(mesh, fw, r);
  const cx = FACE_OVAL.reduce((a, i) => a + mesh[i][0], 0) / FACE_OVAL.length, cy = FACE_OVAL.reduce((a, i) => a + mesh[i][1], 0) / FACE_OVAL.length;
  const R0 = 0.72 * fw, band = 0.35 * fw, Rmax = R0 + band;
  const pts: [number, number][] = [], vals: [number, number][] = [];
  for (const [i, [dx, dy]] of mv) { if (dx === 0 && dy === 0) continue; pts.push([mesh[i][0] + dx, mesh[i][1] + dy]); vals.push([-dx, -dy]); }
  if (!pts.length) return null;
  // zero anchors on a ring at the window edge keep the spline quiet outside the face
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; pts.push([cx + Math.cos(a) * Rmax, cy + Math.sin(a) * Rmax * 1.1]); vals.push([0, 0]); }
  // solve in face-width units so the regularisation is scale free; smoothing keeps nearby opposite moves from folding the map
  const tps = solveTps(pts.map(([x, y]) => [x / fw, y / fw] as [number, number]), vals.map(([x, y]) => [x / fw, y / fw] as [number, number]), 0.03);
  const x0 = cx - Rmax * 1.05, x1 = cx + Rmax * 1.05, y0 = cy - Rmax * 1.2, y1 = cy + Rmax * 1.2;
  const data = new Float32Array(G * G * 2); let maxDisp = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = x0 + (i / (G - 1)) * (x1 - x0), y = y0 + (j / (G - 1)) * (y1 - y0);
    const rr = Math.hypot((x - cx) / 1.0, (y - cy) / 1.1);
    const t = Math.min(1, Math.max(0, (rr - R0) / band)), w = 1 - t * t * (3 - 2 * t);
    const [ux, uy] = w > 0 ? evalTps(tps, x / fw, y / fw) : [0, 0], vx = ux * fw, vy = uy * fw;
    data[(j * G + i) * 2] = vx * w; data[(j * G + i) * 2 + 1] = vy * w; maxDisp = Math.max(maxDisp, Math.hypot(vx * w, vy * w));
  }
  return { G, x0, y0, x1, y1, data, maxDisp };
}

/** Bilinear sample of the backward displacement at (x, y); zero outside the grid. */
export function sampleField(f: Field, x: number, y: number): [number, number] {
  const u = ((x - f.x0) / (f.x1 - f.x0)) * (f.G - 1), v = ((y - f.y0) / (f.y1 - f.y0)) * (f.G - 1);
  if (u < 0 || v < 0 || u > f.G - 1 || v > f.G - 1) return [0, 0];
  const i = Math.min(f.G - 2, Math.floor(u)), j = Math.min(f.G - 2, Math.floor(v)), a = u - i, b = v - j, g = (ii: number, jj: number, c: number) => f.data[(jj * f.G + ii) * 2 + c];
  const lerp = (c: number) => (g(i, j, c) * (1 - a) + g(i + 1, j, c) * a) * (1 - b) + (g(i, j + 1, c) * (1 - a) + g(i + 1, j + 1, c) * a) * b;
  return [lerp(0), lerp(1)];
}

/** Minimum determinant of the map p -> p + B(p) over the grid (finite differences). */
export function minJacobian(f: Field): number {
  const sx = (f.x1 - f.x0) / (f.G - 1), sy = (f.y1 - f.y0) / (f.G - 1); let mn = Infinity;
  for (let j = 0; j < f.G - 1; j++) for (let i = 0; i < f.G - 1; i++) {
    const g = (ii: number, jj: number, c: number) => f.data[(jj * f.G + ii) * 2 + c];
    const dxx = 1 + (g(i + 1, j, 0) - g(i, j, 0)) / sx, dxy = (g(i, j + 1, 0) - g(i, j, 0)) / sy, dyx = (g(i + 1, j, 1) - g(i, j, 1)) / sx, dyy = 1 + (g(i, j + 1, 1) - g(i, j, 1)) / sy;
    mn = Math.min(mn, dxx * dyy - dxy * dyx);
  }
  return mn;
}

/** The explicit inverse of out(p)=in(p+B(p)): finds q with q + B(q) = p by fixed-point iteration. */
export function invertMap(f: Field, x: number, y: number, iters = 20): [number, number] {
  let qx = x, qy = y;
  for (let k = 0; k < iters; k++) { const [bx, by] = sampleField(f, qx, qy); qx = x - bx; qy = y - by; }
  return [qx, qy];
}
