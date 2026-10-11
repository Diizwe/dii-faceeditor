// Crop & rotate geometry. All maths is pure so it can be unit-tested and reused by preview and tiled export.
// Pipeline (output -> source): output px -> straightened frame (crop) -> rotate by `angle` about the base
// centre -> base image (after 90-degree turns and flips) -> source image.

export interface Geometry {
  rot90: 0 | 1 | 2 | 3; // clockwise quarter turns
  flipH: boolean;
  flipV: boolean;
  angle: number; // straighten, degrees, -45..45
  aspect: number | null; // w/h of the crop; null = free (whole image)
  // Optional manual crop in straightened-frame px relative to the base centre; overrides aspect-fit.
  crop?: { cx: number; cy: number; w: number; h: number };
}

export const identityGeometry = (): Geometry => ({ rot90: 0, flipH: false, flipV: false, angle: 0, aspect: null });

/** Row-major 3x3 affine [a b c; d e f; 0 0 1] as 6 numbers [a,b,c,d,e,f]. */
export type Affine = [number, number, number, number, number, number];

export const mul = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2],
  m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5],
];
export const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];

export function baseSize(g: Geometry, w: number, h: number): [number, number] {
  return g.rot90 % 2 === 1 ? [h, w] : [w, h];
}

/** Largest centred crop of the given aspect fully inside the base image rotated by angle. */
export function fitCrop(bw: number, bh: number, angleDeg: number, aspect: number | null): { w: number; h: number } {
  const t = Math.abs(angleDeg) * Math.PI / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const r = aspect ?? bw / bh;
  const k = Math.min(bw / (r * c + s), bh / (r * s + c));
  return { w: k * r, h: k };
}

export function cropRect(g: Geometry, srcW: number, srcH: number): { cx: number; cy: number; w: number; h: number } {
  if (g.crop) return g.crop;
  const [bw, bh] = baseSize(g, srcW, srcH);
  const f = fitCrop(bw, bh, g.angle, g.aspect);
  return { cx: 0, cy: 0, w: f.w, h: f.h };
}

/** Output size in whole pixels at scale 1 (source resolution). */
export function outputSize(g: Geometry, srcW: number, srcH: number): [number, number] {
  const c = cropRect(g, srcW, srcH);
  return [Math.max(1, Math.round(c.w)), Math.max(1, Math.round(c.h))];
}

/** Affine mapping output pixel coords (0..outW, 0..outH) to source pixel coords. outW/outH define the sampling scale. */
export function outToSource(g: Geometry, srcW: number, srcH: number, outW: number, outH: number): Affine {
  const c = cropRect(g, srcW, srcH);
  const [bw, bh] = baseSize(g, srcW, srcH);
  const sx = c.w / outW, sy = c.h / outH;
  // output px -> straightened frame centred on base centre
  let m: Affine = [sx, 0, c.cx - c.w / 2, 0, sy, c.cy - c.h / 2];
  // rotate by angle (straighten: positive = clockwise visually), back to base frame
  const t = g.angle * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  m = mul([cs, -sn, bw / 2, sn, cs, bh / 2], m);
  // base -> source: undo flips then quarter turns (applied order: turns, then flips)
  if (g.flipH) m = mul([-1, 0, bw, 0, 1, 0], m);
  if (g.flipV) m = mul([1, 0, 0, 0, -1, bh], m);
  let cw = bw, ch = bh;
  for (let i = 0; i < g.rot90; i++) {
    // undo a clockwise quarter turn: base (x,y) in (cw x ch) came from prev (ch x cw) at (y, cw - x)... derived below
    m = mul([0, 1, 0, -1, 0, cw], m); // prev.x = y ; prev.y = cw - x
    [cw, ch] = [ch, cw];
  }
  return m;
}

export function isInside(g: Geometry, srcW: number, srcH: number, eps = 0.5): boolean {
  const c = cropRect(g, srcW, srcH);
  const [outW, outH] = [c.w, c.h];
  const m = outToSource(g, srcW, srcH, outW, outH);
  return [[0, 0], [outW, 0], [0, outH], [outW, outH]].every(([x, y]) => {
    const [u, v] = apply(m, x, y);
    return u >= -eps && v >= -eps && u <= srcW + eps && v <= srcH + eps;
  });
}

export function invert(m: Affine): Affine {
  const det = m[0] * m[4] - m[1] * m[3];
  const a = m[4] / det, b = -m[1] / det, d = -m[3] / det, e = m[0] / det;
  return [a, b, -(a * m[2] + b * m[5]), d, e, -(d * m[2] + e * m[5])];
}

/** Map points given in source pixels to output pixels (landmark remap through crop/rotate; never re-detected). */
export function sourceToOut(g: Geometry, srcW: number, srcH: number, outW: number, outH: number): Affine {
  return invert(outToSource(g, srcW, srcH, outW, outH));
}
