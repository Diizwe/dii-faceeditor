import { describe, it, expect } from 'vitest';
import { editFrom } from '../../src/core/edit';
import { emptyHistory, push } from '../../src/core/history';
import type { Face } from '../../src/core/faces';

const face = (id: number): Face => ({ id, box: [0, 0, 100, 100], score: 1, mesh: Array.from({ length: 468 }, () => [0, 0, 0] as [number, number, number]) });
describe('editFrom', () => {
  it('empty history is the identity edit', () => {
    const e = editFrom(emptyHistory(), [face(1)], 1);
    expect(e.light).toBeNull(); expect(e.smooth).toBeNull(); expect(e.face).toBeNull();
  });
  it('smooth uses the face stored in the op, falling back to the active face', () => {
    let h = push(emptyHistory(), { tool: 'smooth', params: { strength: 40, soften: 30, face: 2 } });
    expect(editFrom(h, [face(1), face(2)], 1).face?.id).toBe(2);
    h = push(emptyHistory(), { tool: 'smooth', params: { strength: 40, soften: 30, face: null } });
    expect(editFrom(h, [face(1), face(2)], 1).face?.id).toBe(1);
  });
  it('light and colour alone still picks the active face for skin protection', () => {
    const h = push(emptyHistory(), { tool: 'light', params: { exposure: 0, contrast: 0, warmth: 20, saturation: 0 } });
    const e = editFrom(h, [face(1)], 1);
    expect(e.light?.warmth).toBe(20); expect(e.smooth).toBeNull(); expect(e.face?.id).toBe(1);
  });
  it('strength 0 smooth is no smooth', () => {
    const h = push(emptyHistory(), { tool: 'smooth', params: { strength: 0, soften: 30, face: 1 } });
    expect(editFrom(h, [face(1)], 1).smooth).toBeNull();
  });
});
