// Lazy HEIC path for browsers without native HEIC decoding. libheif-js is LGPL-3.0 and ships as its own chunk,
// fetched only when a HEIC file that the browser cannot open is chosen.
export async function decodeHeicToPng(file: Blob): Promise<Blob> {
  // @ts-expect-error no types for the wasm bundle entry
  const mod = await import('libheif-js/wasm-bundle');
  const libheif = mod.default ?? mod;
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(await file.arrayBuffer()));
  if (!images?.length) throw new Error('This HEIC photo could not be read.');
  const img = images[0];
  const w = img.get_width(), h = img.get_height();
  const data = new ImageData(w, h);
  await new Promise<void>((res, rej) => img.display(data, (r: unknown) => (r ? res() : rej(new Error('HEIC decode failed')))));
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
