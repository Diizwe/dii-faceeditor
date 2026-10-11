import { useState } from 'react';
import { useStore, geometryOf } from '../store';
import { exportImage } from '../core/export';
import { outputSize } from '../core/geometry';

export function ExportPanel() {
  const image = useStore((s) => s.image)!;
  const history = useStore((s) => s.history);
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [quality, setQuality] = useState(92);
  const [progress, setProgress] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const g = geometryOf(history);
  const [w, h] = outputSize(g, image.width, image.height);

  const run = async () => {
    setProgress(0); setDone(null); useStore.getState().setError(null);
    try {
      const res = await exportImage(image, { format, quality, geometry: g, onProgress: setProgress });
      const name = image.name.replace(/\.[^.]+$/, '') + '-edited.' + (format === 'jpeg' ? 'jpg' : 'png');
      const file = new File([res.blob], name, { type: res.blob.type });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch { /* cancelled */ } }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(res.blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
      setDone(`${res.width} × ${res.height}, ${(res.blob.size / 1e6).toFixed(1)} MB`);
    } catch (e) {
      useStore.getState().setError(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed.');
    } finally { setProgress(null); }
  };
  return (
    <div>
      <div className="row" role="group" aria-label="Format">
        <button className="chip" aria-pressed={format === 'jpeg'} onClick={() => setFormat('jpeg')}>JPEG</button>
        <button className="chip" aria-pressed={format === 'png'} onClick={() => setFormat('png')}>PNG</button>
      </div>
      {format === 'jpeg' && <div className="row"><label htmlFor="q">Quality</label>
        <input id="q" type="range" min={70} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /><span className="note">{quality}</span></div>}
      <p className="note">Full size: {w} × {h}. Location data is always removed.{image.colorMode === 'display-p3' && format === 'png' ? ' PNG export does not carry the P3 profile; use JPEG to keep colours exact.' : ''}</p>
      <button className="primary" onClick={() => void run()} disabled={progress !== null} data-testid="export-go">{progress === null ? 'Export' : `Exporting ${Math.round(progress * 100)}%`}</button>
      {done && <p className="note" role="status" data-testid="export-done">Saved {done}</p>}
    </div>
  );
}
