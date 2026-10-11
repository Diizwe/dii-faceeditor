import { useEffect } from 'react';
import { useStore } from '../store';
import { detectFaces } from '../core/faces';

/** Runs detection once per photo and lets the user pick which face the tools edit. */
export function FacesPanel() {
  const image = useStore((s) => s.image)!;
  const faces = useStore((s) => s.faces);
  const active = useStore((s) => s.activeFace);
  const busy = useStore((s) => s.busy);
  useEffect(() => {
    if (faces) return;
    const st = useStore.getState();
    let cancelled = false;
    st.setBusy('Finding faces…'); st.setError(null);
    detectFaces(image.preview, (m) => useStore.getState().setBusy(m))
      .then((f) => { if (!cancelled) useStore.getState().setFaces(f); })
      .catch(() => { if (!cancelled) { useStore.getState().setError('Face tools are unavailable: the face models could not be loaded.'); useStore.getState().setFaces([]); } })
      .finally(() => useStore.getState().setBusy(null));
    return () => { cancelled = true; };
  }, [image, faces]);
  return (
    <div data-testid="faces-panel">
      {!faces && <p className="note">{busy ?? 'Finding faces…'}</p>}
      {faces && faces.length === 0 && <p className="note" data-testid="no-faces">No faces found. Face tools need a clear, visible face.</p>}
      {faces && faces.length === 1 && <p className="note" data-testid="one-face">One face found and selected.</p>}
      {faces && faces.length > 1 && <>
        <p className="note">{faces.length} faces found. Tap a face on the photo, or choose a number.</p>
        <div className="row">{faces.map((f) => <button key={f.id} className="chip" aria-pressed={active === f.id} onClick={() => useStore.getState().setActiveFace(f.id)} data-testid={`face-${f.id}`}>Face {f.id}</button>)}</div>
      </>}
    </div>
  );
}
