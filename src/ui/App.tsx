import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { loadImage, ImageError } from '../core/image';
import { canUndo, canRedo } from '../core/history';
import { Editor } from './Editor';

export function App() {
  const image = useStore((s) => s.image);
  const history = useStore((s) => s.history);
  const error = useStore((s) => s.error);
  const busy = useStore((s) => s.busy);
  useStore((s) => s.split);
  const { setImage, setError, setBusy, undo, redo } = useStore.getState();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [hint, setHint] = useState(() => { try { return localStorage.getItem('dii-onboarded') !== '1'; } catch { return true; } });
  const dismissHint = () => { setHint(false); try { localStorage.setItem('dii-onboarded', '1'); } catch { /* ignore */ } };

  const open = async (f: File | undefined | null) => {
    if (!f) return;
    setBusy('Opening photo…'); setError(null);
    try { setImage(await loadImage(f, f.name)); try { void navigator.storage?.persist?.(); } catch { /* optional */ } }
    catch (e) { setError(e instanceof ImageError ? e.message : 'This photo could not be opened.'); }
    finally { setBusy(null); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? useStore.getState().redo() : useStore.getState().undo(); }
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); useStore.getState().setCompare(true); }
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === 'Space') useStore.getState().setCompare(false); };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  }, []);

  return (
    <div className="app" data-testid="app">
      <header className="topbar">
        <span className="logo"><b>Dii</b> faceeditor</span>
        <span className="spacer" />
        {image && <>
          <button onClick={undo} disabled={!canUndo(history)} aria-label="Undo" data-testid="undo">Undo</button>
          <button onClick={redo} disabled={!canRedo(history)} aria-label="Redo" data-testid="redo">Redo</button>
          <button onPointerDown={() => useStore.getState().setCompare(true)} onPointerUp={() => useStore.getState().setCompare(false)} onPointerLeave={() => useStore.getState().setCompare(false)} aria-label="Hold to compare with the original" data-testid="compare">Compare</button>
          <button onClick={() => useStore.getState().setSplit(!useStore.getState().split)} aria-pressed={useStore.getState().split} aria-label="Drag to compare" data-testid="split">Split</button>
          <button onClick={() => setImage(null)} aria-label="Choose another photo">New</button>
        </>}
      </header>
      {error && <div className="err" role="alert" data-testid="error">{error}</div>}
      {busy && <div className="note" role="status" style={{ padding: '4px 16px' }}>{busy}</div>}
      {hint && image && (
        <div className="panel" role="dialog" aria-label="Quick tips" data-testid="onboarding">
          <strong>Quick tips</strong>
          <ul className="note" style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
            <li>Pick a face in <b>Faces</b>, then use Smooth, Eyes, Makeup and Reshape on it.</li>
            <li>Hold <b>Compare</b> to see the original; <b>Split</b> lets you drag.</li>
            <li>Everything runs on this device. Export keeps full resolution and removes location data.</li>
          </ul>
          <button className="primary" onClick={dismissHint} data-testid="onboarding-ok">Got it</button>
        </div>
      )}
      {image ? <Editor /> : (
        <div className={'start' + (drag ? ' drag' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void open(e.dataTransfer.files[0]); }}>
          <div>
            <h1 style={{ fontSize: 28, margin: 0 }}>Retouch a portrait</h1>
            <p>Your photo never leaves this device. Every edit runs in your browser.</p>
            <button className="primary" onClick={() => input.current?.click()} data-testid="choose">Choose a photo</button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden data-testid="file" onChange={(e) => void open(e.target.files?.[0])} />
          </div>
        </div>
      )}
    </div>
  );
}
