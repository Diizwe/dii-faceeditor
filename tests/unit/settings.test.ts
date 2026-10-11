import { describe, it, expect } from 'vitest';
import { CONTROLS, defaultFraction } from '../../src/core/settings';
import T from '../../spec/thresholds.json';
describe('settings registry', () => {
  it('every default is within the 40% cap (M_default_strength_cap)', () => {
    for (const c of CONTROLS) expect(defaultFraction(c), `${c.tool}.${c.id}`).toBeLessThanOrEqual(T.metrics.M_default_strength_cap.max);
  });
  it('defaults lie inside their ranges', () => { for (const c of CONTROLS) { expect(c.default).toBeGreaterThanOrEqual(c.min); expect(c.default).toBeLessThanOrEqual(c.max); } });
});
