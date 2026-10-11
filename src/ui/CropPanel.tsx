import { useStore, geometryOf } from '../store';
import { identityGeometry, type Geometry } from '../core/geometry';

const ASPECTS: [string, number | null][] = [['Free', null], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['16:9', 16 / 9]];

export function CropPanel() {
  const image = useStore((s) => s.image)!;
  const history = useStore((s) => s.history);
  const { edit, endDrag } = useStore.getState();
  const g = geometryOf(history);
  const set = (p: Partial<Geometry>, coalesce = false) => edit({ tool: 'geometry', params: { ...g, ...p, crop: undefined } }, coalesce);
  const originalAspect = (g.rot90 % 2 ? image.height / image.width : image.width / image.height);
  return (
    <div>
      <div className="row" role="group" aria-label="Aspect ratio">
        {ASPECTS.map(([label, a]) => <button key={label} className="chip" aria-pressed={g.aspect === a} onClick={() => set({ aspect: a })}>{label}</button>)}
        <button className="chip" aria-pressed={g.aspect === originalAspect} onClick={() => set({ aspect: originalAspect })}>Original</button>
      </div>
      <div className="row">
        <label htmlFor="straighten">Straighten</label>
        <input id="straighten" data-testid="straighten" type="range" min={-45} max={45} step={0.5} value={g.angle}
          onChange={(e) => set({ angle: Number(e.target.value) }, true)} onPointerUp={endDrag} onKeyUp={endDrag} />
        <span className="note">{g.angle.toFixed(1)}°</span>
      </div>
      <div className="row">
        <button onClick={() => set({ rot90: ((g.rot90 + 3) % 4) as Geometry['rot90'] })} aria-label="Rotate left" data-testid="rot-left">⟲ 90°</button>
        <button onClick={() => set({ rot90: ((g.rot90 + 1) % 4) as Geometry['rot90'] })} aria-label="Rotate right" data-testid="rot-right">⟳ 90°</button>
        <button onClick={() => set({ flipH: !g.flipH })} aria-pressed={g.flipH} data-testid="flip-h">Flip ↔</button>
        <button onClick={() => set({ flipV: !g.flipV })} aria-pressed={g.flipV} data-testid="flip-v">Flip ↕</button>
        <button onClick={() => edit({ tool: 'geometry', params: identityGeometry() })} data-testid="reset-crop">Reset</button>
      </div>
    </div>
  );
}
