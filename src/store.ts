import { create } from 'zustand';
import type { LoadedImage } from './core/image';
import { emptyHistory, push, undo, redo, commit, active, latest, type History, type Op } from './core/history';
import type { Face } from './core/faces';

export type Tool = 'crop' | 'faces';

interface State {
  image: LoadedImage | null;
  history: History;
  tool: Tool;
  error: string | null;
  busy: string | null;
  compare: boolean;
  healPct: number; // heal brush radius, % of the short side
  setHealPct(v: number): void;
  split: boolean; // drag-split compare mode
  setSplit(v: boolean): void;
  faces: Face[] | null; // null = not detected yet
  activeFace: number | null;
  setFaces(f: Face[] | null): void;
  setActiveFace(id: number | null): void;
  setImage(i: LoadedImage | null): void;
  setTool(t: Tool): void;
  setError(e: string | null): void;
  setBusy(b: string | null): void;
  setCompare(c: boolean): void;
  edit(op: Op, coalesce?: boolean): void;
  endDrag(): void;
  undo(): void;
  redo(): void;
}

export const useStore = create<State>((set) => ({
  image: null, history: emptyHistory(), tool: 'crop', error: null, busy: null, compare: false, healPct: 2, setHealPct: (healPct) => set({ healPct }), split: false, setSplit: (split) => set({ split }), faces: null, activeFace: null,
  setFaces: (faces) => set({ faces, activeFace: faces && faces.length === 1 ? faces[0].id : null }),
  setActiveFace: (activeFace) => set({ activeFace }),
  setImage: (image) => set({ image, history: emptyHistory(), error: null, faces: null, activeFace: null }),
  setTool: (tool) => set((s) => ({ tool, history: commit(s.history) })),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
  setCompare: (compare) => set({ compare }),
  edit: (op, coalesce = false) => set((s) => ({ history: push(s.history, op, coalesce) })),
  endDrag: () => set((s) => ({ history: commit(s.history) })),
  undo: () => set((s) => ({ history: undo(s.history) })),
  redo: () => set((s) => ({ history: redo(s.history) })),
}));

export { geometryOf, lightOf, smoothOf, isLightIdentity, type SmoothOp } from './core/edit';
export const activeOps = (h: History) => active(h);
