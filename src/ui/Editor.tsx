import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, geometryOf } from '../store';
import { Renderer, type View } from '../gl/renderer';
import { identityGeometry, outToSource, outputSize, type Geometry } from '../core/geometry';
import { CropPanel } from './CropPanel';
import { FacesPanel } from './FacesPanel';
import { ExportPanel } from './ExportPanel';

type Panel = 'crop' | 'faces' | 'export';

declare global { interface Window { __dii?: { renderer: Renderer | null; renders: number; redraw: () => void }; } }

export function Editor() {
  const image = useStore((s) => s.image)!;
  const history = useStore((s) => s.history);
  const compare = useStore((s) => s.compare);
  const [panel, setPanel] = useState<Panel>('crop');
  const panelRef = useRef<Panel>('crop'); panelRef.current = panel;
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const faces = useStore((s) => s.faces);
  const activeFace = useStore((s) => s.activeFace);
  const rend = useRef<Renderer | null>(null);
  const view = useRef<View>({ zoom: 1, panX: 0, panY: 0 });
  const fitted = useRef('');
  const [size, setSize] = useState({ w: 1, h: 1 });
  const sizeRef = useRef(size); sizeRef.current = size;
  const [fail, setFail] = useState<string | null>(null);

  const g: Geometry = compare ? identityGeometry() : geometryOf(history);
  const k = image.previewScale;
  const work = useMemo(() => {
    const [ow, oh] = outputSize(g, image.width, image.height);
    const w = Math.max(1, Math.round(ow * k)), h = Math.max(1, Math.round(oh * k));
    const m = outToSource(g, image.width, image.height, w / k, h / k);
    // source px -> preview px
    return { w, h, m: [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k] as [number, number, number, number, number, number] };
  }, [g, image, k]);

  const facesRef = useRef({ faces, activeFace, m: work.m, w: work.w, h: work.h });
  facesRef.current = { faces, activeFace, m: work.m, w: work.w, h: work.h };

  useEffect(() => {
    try {
      const r = new Renderer(canvas.current!, { colorSpace: image.colorMode });
      r.setSource(image.preview); rend.current = r; window.__dii = { renderer: r, renders: 0, redraw: () => draw() };
    } catch (e) { setFail(e instanceof Error ? e.message : 'WebGL2 is unavailable.'); }
    return () => { rend.current?.dispose(); rend.current = null; };
  }, [image]);

  useEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const draw = () => {
    const r = rend.current; if (!r) return;
    const cs = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0F1013';
    const n = parseInt(cs.replace('#', ''), 16);
    r.present(view.current, sizeRef.current.w, sizeRef.current.h, window.devicePixelRatio || 1, [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
    drawOverlay();
    if (window.__dii) window.__dii.renders++;
  };

  // preview-source px -> screen css px, through the inverse of the work->source affine and the view
  const toScreen = (x: number, y: number): [number, number] => {
    const { m } = facesRef.current, v = view.current;
    const det = m[0] * m[4] - m[1] * m[3];
    const dx = x - m[2], dy = y - m[5];
    const wx = (m[4] * dx - m[1] * dy) / det, wy = (-m[3] * dx + m[0] * dy) / det;
    return [wx * v.zoom + v.panX, wy * v.zoom + v.panY];
  };
  const toSource = (sx: number, sy: number): [number, number] => {
    const { m } = facesRef.current, v = view.current;
    const wx = (sx - v.panX) / v.zoom, wy = (sy - v.panY) / v.zoom;
    return [m[0] * wx + m[1] * wy + m[2], m[3] * wx + m[4] * wy + m[5]];
  };
  const drawOverlay = () => {
    const o = overlay.current; if (!o) return;
    const { w, h } = sizeRef.current, dpr = window.devicePixelRatio || 1;
    if (o.width !== Math.round(w * dpr) || o.height !== Math.round(h * dpr)) { o.width = Math.round(w * dpr); o.height = Math.round(h * dpr); }
    const c = o.getContext('2d')!; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const { faces: fs, activeFace: af } = facesRef.current;
    if (!fs || panelRef.current !== 'faces') return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8F7CFF';
    for (const f of fs) {
      const [bx, by, bw, bh] = f.box, cx = bx + bw / 2, cy = by + bh / 2;
      c.beginPath();
      for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; const [px, py] = toScreen(cx + Math.cos(a) * bw * 0.52, cy + Math.sin(a) * bh * 0.58); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.lineWidth = f.id === af ? 4 : 2.5; c.strokeStyle = f.id === af ? accent : 'rgba(255,255,255,.85)'; c.stroke();
      const [lx, ly] = toScreen(bx, by);
      c.fillStyle = f.id === af ? accent : 'rgba(0,0,0,.65)'; c.beginPath(); c.arc(lx + 14, ly + 14, 13, 0, Math.PI * 2); c.fill();
      c.fillStyle = f.id === af ? '#0F1013' : '#fff'; c.font = '600 14px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(f.id), lx + 14, ly + 14);
    }
  };

  useEffect(() => {
    const r = rend.current; if (!r) return;
    r.renderWork(work.m, work.w, work.h);
    const key = `${work.w}x${work.h}|${size.w}x${size.h}`;
    if (fitted.current !== key) {
      fitted.current = key;
      const z = Math.min(size.w / work.w, size.h / work.h) * 0.96;
      view.current = { zoom: z, panX: (size.w - work.w * z) / 2, panY: (size.h - work.h * z) / 2 };
    }
    draw();
  }, [work, size, image]);

  useEffect(() => { drawOverlay(); }, [faces, activeFace, panel]);

  // zoom / pan: wheel, one-pointer drag, two-pointer pinch
  useEffect(() => {
    const el = canvas.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let last: { d: number; cx: number; cy: number } | null = null;
    const rect = () => el.getBoundingClientRect();
    const zoomAt = (cx: number, cy: number, f: number) => {
      const v = view.current, nz = Math.min(Math.max(v.zoom * f, 0.05), 32), s = nz / v.zoom;
      view.current = { zoom: nz, panX: cx - (cx - v.panX) * s, panY: cy - (cy - v.panY) * s };
      draw();
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const b = rect(); zoomAt(e.clientX - b.left, e.clientY - b.top, Math.exp(-e.deltaY * 0.0015)); };
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; down = pts.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const b = rect();
      if (pts.size === 1) {
        view.current = { ...view.current, panX: view.current.panX + e.clientX - p.x, panY: view.current.panY + e.clientY - p.y };
        p.x = e.clientX; p.y = e.clientY; draw();
      } else if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, c] = [...pts.values()];
        const d = Math.hypot(a.x - c.x, a.y - c.y), cx = (a.x + c.x) / 2 - b.left, cy = (a.y + c.y) / 2 - b.top;
        if (last) {
          view.current = { ...view.current, panX: view.current.panX + cx - last.cx, panY: view.current.panY + cy - last.cy };
          zoomAt(cx, cy, d / last.d);
        }
        last = { d, cx, cy };
      }
    };
    const onUp = (e: PointerEvent) => {
      if (down && pts.size === 1 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500 && panelRef.current === 'faces') {
        const b = rect(), [px, py] = toSource(e.clientX - b.left, e.clientY - b.top);
        const hit = (facesRef.current.faces ?? []).filter((f) => px >= f.box[0] && px <= f.box[0] + f.box[2] && py >= f.box[1] && py <= f.box[1] + f.box[3]).sort((a, c) => a.box[2] * a.box[3] - c.box[2] * c.box[3])[0];
        if (hit) useStore.getState().setActiveFace(hit.id);
      }
      down = null; pts.delete(e.pointerId); last = null;
    };
    const onDbl = () => { fitted.current = ''; setSize((s) => ({ ...s })); };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('wheel', onWheel); el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp); el.removeEventListener('dblclick', onDbl);
    };
  }, [size, work]);

  return (
    <>
      <div className="stage" ref={stage}>
        <canvas ref={canvas} data-testid="canvas" aria-label="Photo preview" />
        <canvas ref={overlay} className="faces" data-testid="overlay" aria-hidden="true" />
        {fail && <div className="err" role="alert">{fail}</div>}
      </div>
      <div className="panel" data-testid="panel">
        {panel === 'crop' ? <CropPanel /> : panel === 'faces' ? <FacesPanel /> : <ExportPanel />}
      </div>
      <nav className="toolbar" aria-label="Tools">
        <button aria-pressed={panel === 'crop'} onClick={() => setPanel('crop')} data-testid="tool-crop">Crop &amp; rotate</button>
        <button aria-pressed={panel === 'faces'} onClick={() => setPanel('faces')} data-testid="tool-faces">Faces</button>
        <button aria-pressed={panel === 'export'} onClick={() => setPanel('export')} data-testid="tool-export">Export</button>
      </nav>
    </>
  );
}
