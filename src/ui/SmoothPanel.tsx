import { useStore, smoothOf } from '../store';
import { controlsOf } from '../core/settings';

export function SmoothPanel() {
  const history = useStore((s) => s.history);
  const faces = useStore((s) => s.faces);
  const active = useStore((s) => s.activeFace);
  const S = smoothOf(history) as unknown as Record<string, number>;
  const { edit, endDrag } = useStore.getState();
  return (
    <div data-testid="smooth-panel">
      {faces && faces.length === 0 && <p className="note">No face found, so Smooth is unavailable on this photo.</p>}
      {faces && faces.length > 1 && active === null && <p className="note">Several faces found. Choose one in Faces first.</p>}
      {controlsOf('smooth').map((c) => (
        <div className="row" key={c.id}>
          <label htmlFor={`s-${c.id}`}>{c.label}</label>
          <input id={`s-${c.id}`} data-testid={`smooth-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={S[c.id]}
            onChange={(e) => edit({ tool: 'smooth', params: { ...S, [c.id]: Number(e.target.value), face: active } }, true)} onPointerUp={endDrag} onKeyUp={endDrag} />
          <span className="note">{S[c.id]}</span>
        </div>
      ))}
      <div className="row"><button onClick={() => edit({ tool: 'smooth', params: { strength: 0, keep: 70, face: active } })} data-testid="reset-smooth">Off</button>
        <button onClick={() => edit({ tool: 'smooth', params: { strength: 35, keep: 70, face: active } })} data-testid="smooth-default">Default</button></div>
    </div>
  );
}
