import { useStore } from '../store';
import { filterOf } from '../core/edit';
import { FILTER_LOOKS, controlsOf } from '../core/settings';

export function FilterPanel() {
  const history = useStore((s) => s.history);
  const cur = filterOf(history);
  const c = controlsOf('filters')[0];
  const { edit, endDrag } = useStore.getState();
  const set = (look: number, strength: number, coalesce = false) => edit({ tool: 'filters', params: { look, strength } }, coalesce);
  return (
    <div data-testid="filters-panel">
      <div className="row" role="group" aria-label="Look">
        {FILTER_LOOKS.map((n, i) => <button key={n} className="chip" aria-pressed={cur.look === i} onClick={() => set(i, cur.strength || c.default)} data-testid={`look-${i}`}>{n}</button>)}
      </div>
      <div className="row">
        <label htmlFor="f-s">{c.label}</label>
        <input id="f-s" data-testid="filters-strength" type="range" min={c.min} max={c.max} step={c.step} value={cur.strength} onChange={(e) => set(cur.look, Number(e.target.value), true)} onPointerUp={endDrag} onKeyUp={endDrag} />
        <span className="note">{cur.strength}</span>
      </div>
    </div>
  );
}
