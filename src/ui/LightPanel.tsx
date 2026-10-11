import { useStore, lightOf } from '../store';
import { controlsOf } from '../core/settings';

export function LightPanel() {
  const history = useStore((s) => s.history);
  const L = lightOf(history) as unknown as Record<string, number>;
  const { edit, endDrag } = useStore.getState();
  return (
    <div>
      {controlsOf('light').map((c) => (
        <div className="row" key={c.id}>
          <label htmlFor={`l-${c.id}`}>{c.label}</label>
          <input id={`l-${c.id}`} data-testid={`light-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={L[c.id]}
            onChange={(e) => edit({ tool: 'light', params: { ...L, [c.id]: Number(e.target.value) } }, true)} onPointerUp={endDrag} onKeyUp={endDrag}
            onDoubleClick={() => edit({ tool: 'light', params: { ...L, [c.id]: c.default } })} />
          <span className="note">{c.id === 'exposure' ? (L[c.id] >= 0 ? '+' : '') + L[c.id].toFixed(2) : L[c.id]}</span>
        </div>
      ))}
      <div className="row"><button onClick={() => edit({ tool: 'light', params: { exposure: 0, contrast: 0, warmth: 0, saturation: 0 } })} data-testid="reset-light">Reset</button></div>
    </div>
  );
}
