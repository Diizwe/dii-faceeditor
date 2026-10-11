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
