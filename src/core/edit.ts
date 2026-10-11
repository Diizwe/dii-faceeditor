import type { History } from './history';
import { identityGeometry, type Geometry } from './geometry';
import { latest } from './history';
import { defaultsOf } from './settings';
import type { Face } from './faces';
import type { LightParams } from '../gl/renderer';

export interface SmoothOp { strength: number; keep: number; face: number | null }
export interface EditState {
  geometry: Geometry;
  light: LightParams | null; // null = identity
  smooth: { strength: number; keep: number } | null;
  face: Face | null; // face whose mask drives Smooth and the skin protection in Light & colour
}

export const geometryOf = (h: History): Geometry => (latest(h, 'geometry')?.params as Geometry | undefined) ?? identityGeometry();
export const lightOf = (h: History): LightParams => ({ ...(defaultsOf('light') as unknown as LightParams), ...((latest(h, 'light')?.params as Partial<LightParams> | undefined) ?? {}) });
export const smoothOf = (h: History): SmoothOp => ({ ...(defaultsOf('smooth') as unknown as SmoothOp), strength: 0, face: null, ...((latest(h, 'smooth')?.params as Partial<SmoothOp> | undefined) ?? {}) });
export const isLightIdentity = (l: LightParams) => l.exposure === 0 && l.contrast === 0 && l.warmth === 0 && l.saturation === 0;

/** Everything the renderer needs, derived from the history: the same function feeds the preview and the full-resolution export. */
export function editFrom(h: History, faces: Face[] | null, activeFace: number | null): EditState {
  const light = lightOf(h), sm = smoothOf(h);
  const wantsFace = sm.strength > 0 || !isLightIdentity(light);
  const id = sm.strength > 0 ? (sm.face ?? activeFace) : activeFace;
  const face = wantsFace ? (faces?.find((f) => f.id === id) ?? null) : null;
  return {
    geometry: geometryOf(h),
    light: isLightIdentity(light) ? null : light,
    smooth: face && sm.strength > 0 ? { strength: sm.strength, keep: sm.keep } : null,
    face: face && face.mesh.length >= 468 ? face : null,
  };
}
