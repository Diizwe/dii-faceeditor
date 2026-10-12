import { useStore } from '../store';
import { reshapeOf } from '../core/edit';
import { controlsOf } from '../core/settings';

export function ReshapePanel() {
  const history = useStore((s) => s.history);
  const faces = useStore((s) => s.faces);
  const active = useStore((s) => s.activeFace);
  const cur = reshapeOf(history) as unknown as Record<string, number>;
  const { edit, endDrag } = useStore.getState();
  return (
    <div data-testid="reshape-panel">
      {faces && faces.length === 0 && <p className="note">No face found, so Reshape is unavailable on this photo.</p>}
      {faces && faces.length > 1 && active === null && <p className="note">Several faces found. Choose one in Faces first.</p>}
      {controlsOf('reshape').map((c) => (
        <div className="row" key={c.id}>
          <label htmlFor={`r-${c.id}`}>{c.label}</label>
          <input id={`r-${c.id}`} data-testid={`reshape-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={cur[c.id]}
            onChange={(e) => edit({ tool: 'reshape', params: { ...cur, [c.id]: Number(e.target.value) } }, true)} onPointerUp={endDrag} onKeyUp={endDrag}
            onDoubleClick={() => edit({ tool: 'reshape', params: { ...cur, [c.id]: 0 } })} />
          <span className="note">{cur[c.id]}</span>
        </div>
      ))}
      <div className="row"><button onClick={() => edit({ tool: 'reshape', params: Object.fromEntries(controlsOf('reshape').map((c) => [c.id, 0])) })} data-testid="reshape-reset">Reset</button></div>
    </div>
  );
}
