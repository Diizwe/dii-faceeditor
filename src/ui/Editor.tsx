import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { editFrom } from '../core/edit';
import { LightPanel } from './LightPanel';
import { RetouchPanel } from './RetouchPanel';
import { HealPanel } from './HealPanel';
import { FilterPanel } from './FilterPanel';
import { MakeupPanel } from './MakeupPanel';
import { ReshapePanel } from './ReshapePanel';
import { LiquifyPanel } from './LiquifyPanel';
import { buildLiquify } from '../core/liquify';
import { buildField } from '../core/reshape';
import { PreviewHealer, healOps } from '../core/healer';
import { active as activeOps } from '../core/history';
import { rasterMask, rasterTeeth, rasterIris, rasterMakeup } from '../core/facemask';
import { skinStats } from '../core/skin';
import { detectFaces } from '../core/faces';
import { invert, apply } from '../core/geometry';
import { Renderer, type View, type SmoothParams, type FaceMask } from '../gl/renderer';
import { outToSource, outputSize } from '../core/geometry';
import { CropPanel } from './CropPanel';
import { FacesPanel } from './FacesPanel';
import { ExportPanel } from './ExportPanel';

type Panel = 'liquify' | 'reshape' | 'makeup' | 'filters' | 'heal' | 'crop' | 'smooth' | 'whiten' | 'eyes' | 'light' | 'faces' | 'export';

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
  const splitRef = useRef(-1);
  const compareRef = useRef(false); compareRef.current = compare; // compare only switches what is presented, so it is instant
  const sizeRef = useRef(size); sizeRef.current = size;
  const [fail, setFail] = useState<string | null>(null);

  const split = useStore((s) => s.split);
  // everything the renderer needs, derived once per history/face change by the same function the export uses
  const E = useMemo(() => editFrom(history, faces, activeFace), [history, faces, activeFace]);
  const maskCache = useRef<{ key: string; canvas: OffscreenCanvas | HTMLCanvasElement; teeth: OffscreenCanvas | HTMLCanvasElement | null; iris: OffscreenCanvas | HTMLCanvasElement | null; makeup: OffscreenCanvas | HTMLCanvasElement | null } | null>(null);
  const skinCache = useRef(new Map<number, { cb: number; cr: number; tol: number }>());
  const k = image.previewScale;
  splitRef.current = split ? (splitRef.current >= 0 ? splitRef.current : size.w / 2) : -1;
  const work = useMemo(() => {
    const g = E.geometry;
    const [ow, oh] = outputSize(g, image.width, image.height);
    const w = Math.max(1, Math.round(ow * k)), h = Math.max(1, Math.round(oh * k));
    const m = outToSource(g, image.width, image.height, w / k, h / k);
    // source px -> preview px
    const mm = [m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k] as [number, number, number, number, number, number];
    let face: FaceMask | null = null;
    if (E.face) {
      const mf = E.face, inv = invert(mm), key = `${mf.id}|${w}x${h}|${mm.map((v) => v.toFixed(3)).join(',')}|${E.whiten ? 'w' : ''}${E.eyes ? 'e' : ''}${E.makeup ? 'm' : ''}`;
      const map = (x: number, y: number) => apply(inv, x, y), mesh = mf.mesh as [number, number, number][];
      if (maskCache.current?.key !== key) maskCache.current = { key, canvas: rasterMask(mesh, w, h, map), teeth: E.whiten ? rasterTeeth(mesh, w, h, map) : null, iris: E.eyes ? rasterIris(mesh, w, h, map) : null, makeup: E.makeup ? rasterMakeup(mesh, mf.box[2] * Math.sqrt(Math.abs(inv[0] * inv[4] - inv[1] * inv[3])), w, h, map) : null };
      let st = skinCache.current.get(mf.id);
      if (!st) { st = skinStats(image.preview, mf.mesh as [number, number, number][], mf.box[2]); skinCache.current.set(mf.id, st); }
      const scale = Math.sqrt(Math.abs(inv[0] * inv[4] - inv[1] * inv[3]));
      face = { mask: maskCache.current.canvas, teeth: maskCache.current.teeth, iris: maskCache.current.iris, makeup: maskCache.current.makeup, maskKey: key, fw: mf.box[2] * scale, skin: st };
    }
    let warp: { field: NonNullable<ReturnType<typeof buildField>>; key: string } | null = null;
    if (E.reshape && E.face) {
      const inv2 = invert(mm), mesh2 = (E.face.mesh as [number, number, number][]).map((p) => { const [x, y] = apply(inv2, p[0], p[1]); return [x, y, 0] as [number, number, number]; });
      const fwW = E.face.box[2] * Math.sqrt(Math.abs(inv2[0] * inv2[4] - inv2[1] * inv2[3])), field = buildField(mesh2, fwW, E.reshape);
      if (field) warp = { field, key: `${E.face.id}|${w}x${h}|${mm.map((v) => v.toFixed(3)).join(',')}|${JSON.stringify(E.reshape)}` };
    }
    let liquify: { grid: NonNullable<ReturnType<typeof buildLiquify>>; key: string } | null = null;
    if (E.liquify.length) {
      const inv3 = invert(mm), sc = Math.sqrt(Math.abs(mm[0] * mm[4] - mm[1] * mm[3]));
      const strokes = E.liquify.map((st) => ({ mode: st.mode, strength: st.strength, r: (st.r * k) / sc, pts: st.pts.map((q) => { const [x, y] = apply(inv3, q.x * k, q.y * k); return { x, y }; }) }));
      const grid = buildLiquify(strokes, 0, 0, w, h, 6), last = E.liquify[E.liquify.length - 1];
      if (grid) liquify = { grid, key: `${w}x${h}|${mm.map((v) => v.toFixed(3)).join(',')}|${E.liquify.length}|${last.pts.length}|${last.pts[last.pts.length - 1].x.toFixed(1)}|${last.mode}` };
    }
    return { w, h, warp, liquify, light: E.light, smooth: E.smooth as SmoothParams | null, whiten: E.whiten, eyes: E.eyes, filter: E.filter, makeup: E.makeup, face, m: mm };
  }, [E, image, k]);

  const [srcVersion, setSrcVersion] = useState(0);
  const healer = useRef<PreviewHealer | null>(null);
  const healKey = JSON.stringify(healOps(activeOps(history)));
  const hover = useRef<{ x: number; y: number } | null>(null);
  const facesRef = useRef({ faces, activeFace, m: work.m, w: work.w, h: work.h });
  facesRef.current = { faces, activeFace, m: work.m, w: work.w, h: work.h };

  useEffect(() => {
    try {
      const r = new Renderer(canvas.current!, { colorSpace: image.colorMode });
      r.setSource(image.preview); rend.current = r; window.__dii = { renderer: r, renders: 0, redraw: () => draw() };
    } catch (e) { setFail(e instanceof Error ? e.message : 'WebGL2 is unavailable.'); }
    return () => { rend.current?.dispose(); rend.current = null; };
  }, [image]);

  // heal runs on the original pixels (before crop/rotate), in a worker; the preview texture is swapped when it finishes
  useEffect(() => {
    const h = new PreviewHealer(image.preview, image.previewScale, image.colorMode); healer.current = h;
    return () => { h.dispose(); healer.current = null; };
  }, [image]);
  useEffect(() => {
    const h = healer.current, r = rend.current; if (!h || !r) return;
    let cancelled = false;
    h.apply(healOps(activeOps(history))).then((bmp) => { if (cancelled) return; r.setSource(bmp); setSrcVersion((v) => v + 1); }).catch(() => useStore.getState().setError('Heal could not finish. Try a smaller brush.'));
    return () => { cancelled = true; };
  }, [healKey, image]);

  // find faces once per photo, in the background: Smooth, Light & colour (skin protection) and the picker all use them
  useEffect(() => {
    if (useStore.getState().faces) return;
    let cancelled = false;
    const st = useStore.getState();
    st.setBusy('Finding faces…');
    detectFaces(image.preview, (m) => useStore.getState().setBusy(m))
      .then((f) => { if (!cancelled) useStore.getState().setFaces(f); })
      .catch(() => { if (!cancelled) { useStore.getState().setError('Face tools are unavailable: the face models could not be loaded.'); useStore.getState().setFaces([]); } })
      .finally(() => useStore.getState().setBusy(null));
    return () => { cancelled = true; };
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
    r.present(view.current, sizeRef.current.w, sizeRef.current.h, window.devicePixelRatio || 1, [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], splitRef.current >= 0 ? splitRef.current : -1, compareRef.current);
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
    if ((panelRef.current === 'heal' || panelRef.current === 'liquify') && hover.current) {
      const { m } = facesRef.current, v = view.current, sc = Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
      const st = useStore.getState(), rSrc = ((panelRef.current === 'liquify' ? st.liq.size : st.healPct) / 100) * Math.min(st.image!.width, st.image!.height);
      const rs = ((rSrc * st.image!.previewScale) / sc) * v.zoom;
      c.beginPath(); c.arc(hover.current.x, hover.current.y, Math.max(3, rs), 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.9)'; c.stroke();
      c.beginPath(); c.arc(hover.current.x, hover.current.y, Math.max(3, rs) + 1.5, 0, Math.PI * 2); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.6)'; c.stroke();
    }
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
    r.renderWork(work);
    const key = `${work.w}x${work.h}|${size.w}x${size.h}`;
    if (fitted.current !== key) {
      fitted.current = key;
      const z = Math.min(size.w / work.w, size.h / work.h) * 0.96;
      view.current = { zoom: z, panX: (size.w - work.w * z) / 2, panY: (size.h - work.h * z) / 2 };
    }
    draw();
  }, [work, size, image, srcVersion]);

  useEffect(() => { drawOverlay(); }, [faces, activeFace, panel]);
  useEffect(() => { draw(); }, [split, compare]);

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
    let stroke: { x: number; y: number }[] | null = null;
    const toSrc = (cx: number, cy: number) => { const [px, py] = toSource(cx, cy); const k = useStore.getState().image!.previewScale; return { x: px / k, y: py / k }; };
    const onDown = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; down = pts.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (panelRef.current === 'heal' || panelRef.current === 'liquify') { const b = rect(); if (pts.size === 1) { stroke = [toSrc(e.clientX - b.left, e.clientY - b.top)]; hover.current = { x: e.clientX - b.left, y: e.clientY - b.top }; drawOverlay(); } else stroke = null; } };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const b = rect();
      if (panelRef.current === 'heal' || panelRef.current === 'liquify') { hover.current = { x: e.clientX - b.left, y: e.clientY - b.top }; drawOverlay(); }
      if (pts.size === 1 && stroke) { stroke.push(toSrc(e.clientX - b.left, e.clientY - b.top)); p.x = e.clientX; p.y = e.clientY; return; }
      if (pts.size === 1 && splitRef.current >= 0) {
        splitRef.current = Math.min(Math.max(e.clientX - b.left, 0), size.w); p.x = e.clientX; p.y = e.clientY; draw();
      } else if (pts.size === 1) {
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
      if (stroke && stroke.length && panelRef.current === 'liquify') {
        const st = useStore.getState(), img = st.image!, r = (st.liq.size / 100) * Math.min(img.width, img.height);
        st.edit({ tool: 'liquify', params: { pts: stroke, r, strength: st.liq.strength, mode: st.liq.mode } });
      } else if (stroke && stroke.length) {
        const st = useStore.getState(), img = st.image!, r = (st.healPct / 100) * Math.min(img.width, img.height);
        // thin a long drag so each op keeps a modest number of points
        const pts2 = stroke.filter((q, i) => i === 0 || i === stroke!.length - 1 || Math.hypot(q.x - stroke![i - 1].x, q.y - stroke![i - 1].y) > r * 0.25);
        st.edit({ tool: 'heal', params: { pts: pts2, r } });
      }
      stroke = null;
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
        {panel === 'liquify' ? <LiquifyPanel /> : panel === 'reshape' ? <ReshapePanel /> : panel === 'makeup' ? <MakeupPanel /> : panel === 'filters' ? <FilterPanel /> : panel === 'heal' ? <HealPanel /> : panel === 'crop' ? <CropPanel /> : panel === 'smooth' ? <RetouchPanel tool="smooth" /> : panel === 'whiten' ? <RetouchPanel tool="whiten" hint="Needs a visible smile. Only bright, yellowish teeth are changed." /> : panel === 'eyes' ? <RetouchPanel tool="eyes" hint="Only the iris changes; the whites and lids are left alone." /> : panel === 'light' ? <LightPanel /> : panel === 'faces' ? <FacesPanel /> : <ExportPanel />}
      </div>
      <nav className="toolbar" aria-label="Tools">
        <button aria-pressed={panel === 'heal'} onClick={() => setPanel('heal')} data-testid="tool-heal">Heal</button>
        <button aria-pressed={panel === 'crop'} onClick={() => setPanel('crop')} data-testid="tool-crop">Crop &amp; rotate</button>
        <button aria-pressed={panel === 'whiten'} onClick={() => setPanel('whiten')} data-testid="tool-whiten">Whiten (beta)</button>
        <button aria-pressed={panel === 'eyes'} onClick={() => setPanel('eyes')} data-testid="tool-eyes">Eyes (beta)</button>
        <button aria-pressed={panel === 'smooth'} onClick={() => setPanel('smooth')} data-testid="tool-smooth">Smooth</button>
        <button aria-pressed={panel === 'light'} onClick={() => setPanel('light')} data-testid="tool-light">Light &amp; colour</button>
        <button aria-pressed={panel === 'liquify'} onClick={() => setPanel('liquify')} data-testid="tool-liquify">Liquify</button>
        <button aria-pressed={panel === 'reshape'} onClick={() => setPanel('reshape')} data-testid="tool-reshape">Reshape</button>
        <button aria-pressed={panel === 'makeup'} onClick={() => setPanel('makeup')} data-testid="tool-makeup">Makeup</button>
        <button aria-pressed={panel === 'filters'} onClick={() => setPanel('filters')} data-testid="tool-filters">Filters</button>
        <button aria-pressed={panel === 'faces'} onClick={() => setPanel('faces')} data-testid="tool-faces">Faces</button>
        <button aria-pressed={panel === 'export'} onClick={() => setPanel('export')} data-testid="tool-export">Export</button>
      </nav>
    </>
  );
}
