// Face detection and landmarks: BlazeFace detector, face mesh (468 points) and iris from @vladmandic/human-models (MIT),
// served from our own origin and cached in IndexedDB by the Human runtime after the first load.
export interface Face {
  id: number;
  /** x, y, w, h in working-image (preview, post-orientation) pixels */
  box: [number, number, number, number];
  score: number;
  /** 468 mesh points (+ iris) as [x, y, z] in the same pixel space */
  mesh: [number, number, number][];
}

type HumanT = import('@vladmandic/human').Human;
let humanP: Promise<HumanT> | null = null;
export const modelRequests: string[] = [];

export function loadHuman(onStatus?: (s: string) => void): Promise<HumanT> {
  humanP ??= (async () => {
    onStatus?.('Loading face models…');
    const { Human } = await import('@vladmandic/human');
    const base = new URL('models/', document.baseURI).toString();
    const h = new Human({
      backend: 'webgl', modelBasePath: base, cacheModels: true, warmup: 'none', debug: false,
      filter: { enabled: false }, gesture: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, segmentation: { enabled: false },
      face: {
        enabled: true, detector: { modelPath: 'blazeface.json', maxDetected: 12, minConfidence: 0.35, rotation: true, return: false },
        mesh: { enabled: true, modelPath: 'facemesh.json' }, iris: { enabled: true, modelPath: 'iris.json' },
        description: { enabled: false }, emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, attention: { enabled: false },
      },
    });
    await h.load();
    return h;
  })().catch((e) => { humanP = null; throw e; });
  return humanP;
}

export async function detectFaces(img: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, onStatus?: (s: string) => void): Promise<Face[]> {
  const h = await loadHuman(onStatus);
  onStatus?.('Finding faces…');
  const res = await h.detect(img as never);
  return res.face.map((f, i) => ({
    id: i + 1,
    box: [f.box[0], f.box[1], f.box[2], f.box[3]] as Face['box'],
    score: f.boxScore ?? f.score ?? 0,
    mesh: (f.mesh ?? []) as Face['mesh'],
  })).sort((a, b) => a.box[0] - b.box[0]).map((f, i) => ({ ...f, id: i + 1 }));
}

// ---- person segmentation (selfie model from @vladmandic/human-models, MIT) -----------------------------------------------
let segP: Promise<HumanT> | null = null;
export async function loadSegmenter(): Promise<HumanT> {
  segP ??= (async () => {
    const { Human } = await import('@vladmandic/human');
    const h = new Human({
      backend: 'webgl', modelBasePath: new URL('models/', document.baseURI).toString(), cacheModels: true, warmup: 'none', debug: false, filter: { enabled: false },
      face: { enabled: false }, body: { enabled: false }, hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false },
      segmentation: { enabled: true, modelPath: 'selfie.json' },
    });
    await h.load();
    return h;
  })().catch((e) => { segP = null; throw e; });
  return segP;
}

/** Person alpha (0..1) at the size of the input, as a Float32Array; row 0 = top. */
export async function segmentPerson(img: ImageBitmap | HTMLCanvasElement | OffscreenCanvas): Promise<{ w: number; h: number; alpha: Float32Array }> {
  const h = await loadSegmenter();
  const t = await h.segmentation(img as never);
  if (!t) throw new Error('segmentation returned nothing');
  const shape = t.shape as number[]; const data = (await t.data()) as Float32Array; t.dispose?.();
  const [sh, sw] = shape.length === 4 ? [shape[1], shape[2]] : [shape[0], shape[1]];
  const ch = data.length / (sh * sw);
  const out = new Float32Array(sh * sw); for (let i = 0; i < sh * sw; i++) out[i] = data[i * ch + (ch > 1 ? ch - 1 : 0)];
  return { w: sw, h: sh, alpha: out };
}
