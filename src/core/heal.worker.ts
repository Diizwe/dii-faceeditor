import { healStroke, type Stroke } from './heal';

export interface HealJob { id: number; w: number; h: number; data: Uint8ClampedArray; strokes: (Stroke & { pts: { x: number; y: number }[] })[]; }

self.onmessage = (e: MessageEvent<HealJob>) => {
  const { id, w, h, data, strokes } = e.data;
  const img = { w, h, data };
  for (const s of strokes) healStroke(img, s.pts, s.r);
  (self as unknown as Worker).postMessage({ id, data }, [data.buffer]);
};
