import { useStore } from '../store';
import { controlsOf, defaultsOf } from '../core/settings';
import { latest } from '../core/history';

/** Slider panel for a face tool (smooth, whiten, eyes): controls come from the settings registry; the op stores the picked face. */
export function RetouchPanel({ tool, hint }: { tool: 'smooth' | 'whiten' | 'eyes'; hint?: string }) {
  const history = useStore((s) => s.history);
  const faces = useStore((s) => s.faces);
  const active = useStore((s) => s.activeFace);
  const cur = { ...Object.fromEntries(controlsOf(tool).map((c) => [c.id, tool === 'smooth' && c.id === 'strength' ? 0 : tool === 'smooth' ? c.default : 0])), ...((latest(history, tool)?.params as Record<string, number> | undefined) ?? {}) };
  const { edit, endDrag } = useStore.getState();
  const set = (id: string, v: number, coalesce: boolean) => edit({ tool, params: { ...cur, [id]: v, face: active } }, coalesce);
  return (
    <div data-testid={`${tool}-panel`}>
      {faces && faces.length === 0 && <p className="note">No face found, so this tool is unavailable on this photo.</p>}
      {faces && faces.length > 1 && active === null && <p className="note">Several faces found. Choose one in Faces first.</p>}
      {hint && <p className="note">{hint}</p>}
      {controlsOf(tool).map((c) => (
        <div className="row" key={c.id}>
          <label htmlFor={`${tool}-${c.id}`}>{c.label}</label>
          <input id={`${tool}-${c.id}`} data-testid={`${tool}-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={cur[c.id]}
            onChange={(e) => set(c.id, Number(e.target.value), true)} onPointerUp={endDrag} onKeyUp={endDrag} />
          <span className="note">{cur[c.id]}</span>
        </div>
      ))}
      <div className="row">
        <button onClick={() => edit({ tool, params: { ...Object.fromEntries(controlsOf(tool).map((c) => [c.id, 0])), ...(tool === 'smooth' ? { soften: 30 } : {}), face: active } })} data-testid={`${tool}-off`}>Off</button>
        <button onClick={() => edit({ tool, params: { ...defaultsOf(tool), face: active } })} data-testid={`${tool}-default`}>Default</button>
      </div>
    </div>
  );
}
