// Edit history: an ordered list of operations plus a pointer. Undo/redo only moves the pointer.
export interface Op { tool: string; params: unknown; }

export interface History {
  ops: Op[];
  ptr: number; // number of active ops
  /** tool name of the last pushed op when it may still be coalesced (slider drags) */
  open: string | null;
}

export const emptyHistory = (): History => ({ ops: [], ptr: 0, open: null });

/** Push an op. With coalesce=true, consecutive pushes by the same tool replace the open op (one undo step per drag). */
export function push(h: History, op: Op, coalesce = false): History {
  const base = h.ops.slice(0, h.ptr);
  if (coalesce && h.open === op.tool && base.length && base[base.length - 1].tool === op.tool) {
    base[base.length - 1] = op;
    return { ops: base, ptr: base.length, open: op.tool };
  }
  base.push(op);
  return { ops: base, ptr: base.length, open: coalesce ? op.tool : null };
}
export const commit = (h: History): History => ({ ...h, open: null });
export const undo = (h: History): History => (h.ptr > 0 ? { ...h, ptr: h.ptr - 1, open: null } : h);
export const redo = (h: History): History => (h.ptr < h.ops.length ? { ...h, ptr: h.ptr + 1, open: null } : h);
export const canUndo = (h: History) => h.ptr > 0;
export const canRedo = (h: History) => h.ptr < h.ops.length;
export const active = (h: History): Op[] => h.ops.slice(0, h.ptr);
/** Last active op of a tool, or undefined. */
export const latest = (h: History, tool: string): Op | undefined => [...active(h)].reverse().find((o) => o.tool === tool);
