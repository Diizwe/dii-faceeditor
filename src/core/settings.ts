// Registry of every tool control: range and default. M_default_strength_cap lints this file's defaults.
export interface Control { tool: string; id: string; label: string; min: number; max: number; step: number; default: number; unit?: string; }

export const CONTROLS: Control[] = [
  { tool: 'reshape', id: 'jaw', label: 'Jaw width', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'chin', label: 'Chin length', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'noseW', label: 'Nose width', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'noseL', label: 'Nose length', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'eyeSize', label: 'Eye size', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'eyeDist', label: 'Eye distance', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'lips', label: 'Lip fullness', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'reshape', id: 'faceW', label: 'Face width', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'makeup', id: 'lip', label: 'Lip tint', min: 0, max: 60, step: 1, default: 24 },
  { tool: 'makeup', id: 'blush', label: 'Blush', min: 0, max: 60, step: 1, default: 20 },
  { tool: 'makeup', id: 'brow', label: 'Brow fill', min: 0, max: 60, step: 1, default: 20 },
  { tool: 'filters', id: 'strength', label: 'Strength', min: 0, max: 100, step: 1, default: 40 },
  { tool: 'whiten', id: 'strength', label: 'Whiten', min: 0, max: 100, step: 1, default: 40 },
  { tool: 'eyes', id: 'brighten', label: 'Brighten iris', min: 0, max: 100, step: 1, default: 30 },
  { tool: 'eyes', id: 'clarity', label: 'Iris clarity', min: 0, max: 100, step: 1, default: 35 },
  { tool: 'heal', id: 'radius', label: 'Brush size', min: 0.5, max: 6, step: 0.1, default: 2, unit: '%' },
  { tool: 'smooth', id: 'strength', label: 'Smoothing', min: 0, max: 100, step: 1, default: 35 },
  { tool: 'smooth', id: 'soften', label: 'Soften fine texture', min: 0, max: 100, step: 1, default: 30 }, // 100 - this = how much pore-level detail is kept
  { tool: 'light', id: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, default: 0, unit: 'EV' },
  { tool: 'light', id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'light', id: 'warmth', label: 'Warmth', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'light', id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, default: 0 },
];

export const LIP_COLOURS: { name: string; rgb: [number, number, number] }[] = [{ name: 'Rose', rgb: [0.78, 0.33, 0.45] }, { name: 'Coral', rgb: [0.93, 0.45, 0.38] }, { name: 'Berry', rgb: [0.55, 0.15, 0.32] }, { name: 'Nude', rgb: [0.76, 0.52, 0.45] }, { name: 'Red', rgb: [0.78, 0.1, 0.15] }];
export const FILTER_LOOKS = ['Natural boost', 'Warm glow', 'Cool', 'Matte', 'Film', 'Mono', 'Vivid', 'Soft pastel'];
export const controlsOf = (tool: string) => CONTROLS.filter((c) => c.tool === tool);
export const defaultsOf = (tool: string): Record<string, number> => Object.fromEntries(controlsOf(tool).map((c) => [c.id, c.default]));
/** default as a fraction of the control's range (bipolar controls: distance from zero over the larger side) */
export const defaultFraction = (c: Control) => Math.abs(c.default) / Math.max(Math.abs(c.min), Math.abs(c.max));
