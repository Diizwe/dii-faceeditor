import { useStore } from '../store';
import { makeupOf } from '../core/edit';
import { controlsOf, LIP_COLOURS } from '../core/settings';

export function MakeupPanel() {
  const history = useStore((s) => s.history);
  const active = useStore((s) => s.activeFace);
  const faces = useStore((s) => s.faces);
  const cur = makeupOf(history) as unknown as Record<string, number>;
  const { edit, endDrag } = useStore.getState();
  const set = (patch: Record<string, number>, coalesce = false) => edit({ tool: 'makeup', params: { lip: cur.lip, blush: cur.blush, brow: cur.brow, colour: cur.colour, ...patch, face: active } }, coalesce);
  return (
    <div data-testid="makeup-panel">
      {faces && faces.length === 0 && <p className="note">No face found, so Makeup is unavailable on this photo.</p>}
      {faces && faces.length > 1 && active === null && <p className="note">Several faces found. Choose one in Faces first.</p>}
      <div className="row" role="group" aria-label="Lip colour">
        {LIP_COLOURS.map((l, i) => <button key={l.name} className="chip" aria-pressed={cur.colour === i} onClick={() => set({ colour: i, lip: cur.lip || 24 })} data-testid={`lip-${i}`}>{l.name}</button>)}
      </div>
      {controlsOf('makeup').map((c) => (
        <div className="row" key={c.id}>
          <label htmlFor={`m-${c.id}`}>{c.label}</label>
          <input id={`m-${c.id}`} data-testid={`makeup-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={cur[c.id]} onChange={(e) => set({ [c.id]: Number(e.target.value) }, true)} onPointerUp={endDrag} onKeyUp={endDrag} />
          <span className="note">{cur[c.id]}</span>
        </div>
      ))}
      <div className="row"><button onClick={() => set({ lip: 0, blush: 0, brow: 0 })} data-testid="makeup-off">Off</button></div>
    </div>
  );
}
