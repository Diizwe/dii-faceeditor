import { useStore } from '../store';
import { latest } from '../core/history';
import { BG_COLOURS, BG_MODES, defaultBg, type BgOp } from '../core/background';
import { controlsOf } from '../core/settings';

export function BackgroundPanel() {
  const history = useStore((s) => s.history);
  const raw = useStore((s) => s.bgRaw);
  const busy = useStore((s) => s.busy);
  const op = latest(history, 'background');
  const cur: BgOp = { ...defaultBg(), ...((op?.params as Partial<BgOp>) ?? {}) };
  const { edit, endDrag } = useStore.getState();
  const set = (patch: Partial<BgOp>, coalesce = false) => edit({ tool: 'background', params: { ...cur, ...patch } }, coalesce);
  const [blur, edge] = controlsOf('background');
  return (
    <div data-testid="background-panel">
      <div className="row" role="group" aria-label="Mode">
        {BG_MODES.map((n, i) => <button key={n} className="chip" aria-pressed={!!op && cur.mode === i} onClick={() => set({ mode: i })} data-testid={`bg-mode-${i}`}>{n}</button>)}
        <button className="chip" onClick={() => edit({ tool: 'background', params: null })} disabled={!op} data-testid="bg-off">Off</button>
      </div>
      {op && !raw && <p className="note" role="status">{busy ?? 'Finding the person…'}</p>}
      {op && cur.mode === 0 && <div className="row"><label htmlFor="bg-blur">{blur.label}</label><input id="bg-blur" data-testid="bg-blur" type="range" min={blur.min} max={blur.max} value={cur.blur} onChange={(e) => set({ blur: Number(e.target.value) }, true)} onPointerUp={endDrag} /><span className="note">{cur.blur}</span></div>}
      {op && cur.mode > 0 && <div className="row" role="group" aria-label="Colour">{BG_COLOURS.map((c, i) => <button key={c.name} className="chip" aria-pressed={cur.colour === i} onClick={() => set({ colour: i })} data-testid={`bg-colour-${i}`}>{c.name}</button>)}</div>}
      {op && <div className="row"><label htmlFor="bg-edge">{edge.label}</label><input id="bg-edge" data-testid="bg-edge" type="range" min={edge.min} max={edge.max} value={cur.edge} onChange={(e) => set({ edge: Number(e.target.value) }, true)} onPointerUp={endDrag} /><span className="note">{cur.edge}</span></div>}
      <p className="note">Needs a person in the photo. The person is never changed; only what is behind them.</p>
    </div>
  );
}
