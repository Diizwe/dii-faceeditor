import { useStore } from '../store';
import { controlsOf } from '../core/settings';

export function HealPanel() {
  const pct = useStore((s) => s.healPct);
  const c = controlsOf('heal')[0];
  return (
    <div data-testid="heal-panel">
      <p className="note">Tap a blemish, or drag over it. Two fingers move and zoom the photo.</p>
      <div className="row">
        <label htmlFor="heal-r">{c.label}</label>
        <input id="heal-r" data-testid="heal-radius" type="range" min={c.min} max={c.max} step={c.step} value={pct} onChange={(e) => useStore.getState().setHealPct(Number(e.target.value))} />
        <span className="note">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}
