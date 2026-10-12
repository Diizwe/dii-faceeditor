import { useStore } from '../store';
import { controlsOf } from '../core/settings';

const MODES: ['push' | 'pucker' | 'bloat' | 'reconstruct', string][] = [['push', 'Push'], ['pucker', 'Pucker'], ['bloat', 'Bloat'], ['reconstruct', 'Reconstruct']];

export function LiquifyPanel() {
  const liq = useStore((s) => s.liq);
  const [size, strength] = controlsOf('liquify');
  const { setLiq } = useStore.getState();
  return (
    <div data-testid="liquify-panel">
      <p className="note">Drag on the photo. Two fingers move and zoom it.</p>
      <div className="row" role="group" aria-label="Mode">
        {MODES.map(([m, label]) => <button key={m} className="chip" aria-pressed={liq.mode === m} onClick={() => setLiq({ mode: m })} data-testid={`liq-${m}`}>{label}</button>)}
      </div>
      <div className="row"><label htmlFor="liq-size">{size.label}</label><input id="liq-size" data-testid="liq-size" type="range" min={size.min} max={size.max} step={size.step} value={liq.size} onChange={(e) => setLiq({ size: Number(e.target.value) })} /><span className="note">{liq.size}%</span></div>
      <div className="row"><label htmlFor="liq-str">{strength.label}</label><input id="liq-str" data-testid="liq-strength" type="range" min={strength.min} max={strength.max} step={strength.step} value={liq.strength} onChange={(e) => setLiq({ strength: Number(e.target.value) })} /><span className="note">{liq.strength}</span></div>
    </div>
  );
}
