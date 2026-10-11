// Registry of every tool control: range and default. M_default_strength_cap lints this file's defaults.
export interface Control { tool: string; id: string; label: string; min: number; max: number; step: number; default: number; unit?: string; }

export const CONTROLS: Control[] = [
  { tool: 'smooth', id: 'strength', label: 'Smoothing', min: 0, max: 100, step: 1, default: 35 },
  { tool: 'smooth', id: 'keep', label: 'Keep fine detail', min: 0, max: 100, step: 1, default: 70 },
  { tool: 'light', id: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, default: 0, unit: 'EV' },
  { tool: 'light', id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'light', id: 'warmth', label: 'Warmth', min: -100, max: 100, step: 1, default: 0 },
  { tool: 'light', id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, default: 0 },
];

export const controlsOf = (tool: string) => CONTROLS.filter((c) => c.tool === tool);
export const defaultsOf = (tool: string): Record<string, number> => Object.fromEntries(controlsOf(tool).map((c) => [c.id, c.default]));
/** default as a fraction of the control's range (bipolar controls: distance from zero over the larger side) */
export const defaultFraction = (c: Control) => Math.abs(c.default) / Math.max(Math.abs(c.min), Math.abs(c.max));
