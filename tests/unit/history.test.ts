import { describe, it, expect } from 'vitest';
import { emptyHistory, push, undo, redo, active, commit, latest } from '../../src/core/history';
const op = (tool: string, v: number) => ({ tool, params: v });
describe('history', () => {
  it('undo/redo moves pointer', () => {
    let h = push(emptyHistory(), op('a', 1)); h = push(h, op('b', 2));
    expect(active(h).length).toBe(2);
    h = undo(h); expect(active(h).map((o) => o.tool)).toEqual(['a']);
    h = redo(h); expect(active(h).length).toBe(2);
  });
  it('push after undo discards redo branch', () => {
    let h = push(emptyHistory(), op('a', 1)); h = push(h, op('b', 2)); h = undo(h);
    h = push(h, op('c', 3));
    expect(h.ops.map((o) => o.tool)).toEqual(['a', 'c']);
  });
  it('coalesces slider drags into one step until committed', () => {
    let h = push(emptyHistory(), op('lc', 1), true);
    h = push(h, op('lc', 2), true); h = push(h, op('lc', 3), true);
    expect(h.ops.length).toBe(1);
    expect(latest(h, 'lc')?.params).toBe(3);
    h = commit(h); h = push(h, op('lc', 4), true);
    expect(h.ops.length).toBe(2);
  });
  it('undo at start is a no-op', () => { const h = emptyHistory(); expect(undo(h)).toBe(h); });
});
