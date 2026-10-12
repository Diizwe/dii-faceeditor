import type { History } from './history';
import { identityGeometry, type Geometry } from './geometry';
import { latest } from './history';
import { defaultsOf } from './settings';
import type { Face } from './faces';
import type { LightParams } from '../gl/renderer';

export interface SmoothOp { strength: number; soften: number; face: number | null }
export interface EditState {
  geometry: Geometry;
  light: LightParams | null; // null = identity
  smooth: { strength: number; keep: number } | null;
  whiten: { strength: number } | null;
  eyes: { brighten: number; clarity: number } | null;
  filter: { look: number; strength: number } | null;
  face: Face | null; // face whose mask drives Smooth and the skin protection in Light & colour
}

export const geometryOf = (h: History): Geometry => (latest(h, 'geometry')?.params as Geometry | undefined) ?? identityGeometry();
export const lightOf = (h: History): LightParams => ({ ...(defaultsOf('light') as unknown as LightParams), ...((latest(h, 'light')?.params as Partial<LightParams> | undefined) ?? {}) });
export const smoothOf = (h: History): SmoothOp => ({ ...(defaultsOf('smooth') as unknown as SmoothOp), strength: 0, face: null, ...((latest(h, 'smooth')?.params as Partial<SmoothOp> | undefined) ?? {}) });
export const whitenOf = (h: History) => ({ strength: 0, face: null as number | null, ...((latest(h, 'whiten')?.params as { strength?: number; face?: number | null } | undefined) ?? {}) });
export const eyesOf = (h: History) => ({ brighten: 0, clarity: 0, face: null as number | null, ...((latest(h, 'eyes')?.params as { brighten?: number; clarity?: number; face?: number | null } | undefined) ?? {}) });
export const filterOf = (h: History) => ({ look: 0, strength: 0, ...((latest(h, 'filters')?.params as { look?: number; strength?: number } | undefined) ?? {}) });
export const isLightIdentity = (l: LightParams) => l.exposure === 0 && l.contrast === 0 && l.warmth === 0 && l.saturation === 0;

/** Everything the renderer needs, derived from the history: the same function feeds the preview and the full-resolution export. */
export function editFrom(h: History, faces: Face[] | null, activeFace: number | null): EditState {
  const light = lightOf(h), sm = smoothOf(h), wh = whitenOf(h), ey = eyesOf(h), fl = filterOf(h);
  const wantsFace = sm.strength > 0 || wh.strength > 0 || ey.brighten > 0 || ey.clarity > 0 || fl.strength > 0 || !isLightIdentity(light);
  const id = sm.strength > 0 ? (sm.face ?? activeFace) : wh.strength > 0 ? (wh.face ?? activeFace) : (ey.brighten > 0 || ey.clarity > 0) ? (ey.face ?? activeFace) : activeFace;
  const face = wantsFace ? (faces?.find((f) => f.id === id) ?? null) : null;
  return {
    geometry: geometryOf(h),
    light: isLightIdentity(light) ? null : light,
    smooth: face && sm.strength > 0 ? { strength: sm.strength, keep: 100 - sm.soften } : null,
    whiten: face && wh.strength > 0 ? { strength: wh.strength } : null,
    eyes: face && (ey.brighten > 0 || ey.clarity > 0) ? { brighten: ey.brighten, clarity: ey.clarity } : null,
    filter: fl.strength > 0 ? { look: fl.look, strength: fl.strength } : null,
    face: face && face.mesh.length >= 468 ? face : null,
  };
}
