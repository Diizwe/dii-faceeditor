// Streaming PNG writer (8-bit RGB, filter 0) with optional iCCP profile; zlib via CompressionStream.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(parts: Uint8Array[]): number { let c = 0xffffffff; for (const b of parts) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type), out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(t, 4); out.set(data, 8); dv.setUint32(8 + data.length, crc32([t, data])); return out;
}
async function zlib(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}

export class PngWriter {
  private idat: Promise<Uint8Array>[] = [];
  private pending: Uint8Array[] = [];
  constructor(private w: number, private h: number, private icc: Uint8Array | null) {}
  /** rgba rows -> filtered RGB scanlines, compressed per band (bands are independent deflate streams, concatenated by IDAT zlib flush) */
  addRows(rgba: Uint8Array, rows: number) {
    const line = 1 + this.w * 3, raw = new Uint8Array(line * rows);
    for (let y = 0; y < rows; y++) { let o = y * line; raw[o++] = 0; for (let x = 0; x < this.w; x++) { const p = (y * this.w + x) * 4; raw[o++] = rgba[p]; raw[o++] = rgba[p + 1]; raw[o++] = rgba[p + 2]; } }
    this.pending.push(raw);
  }
  async finish(): Promise<Blob> {
    const all = new Uint8Array(this.pending.reduce((n, b) => n + b.length, 0)); let o = 0;
    for (const b of this.pending) { all.set(b, o); o += b.length; }
    this.pending = [];
    const z = await zlib(all);
    const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
    dv.setUint32(0, this.w); dv.setUint32(4, this.h); ihdr[8] = 8; ihdr[9] = 2;
    const parts: BlobPart[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) as BlobPart, chunk('IHDR', ihdr) as BlobPart];
    if (this.icc) { const zi = await zlib(this.icc); const d = new Uint8Array(5 + zi.length); d.set(new TextEncoder().encode('icc'), 0); d[3] = 0; d[4] = 0; d.set(zi, 5); parts.push(chunk('iCCP', d) as BlobPart); }
    parts.push(chunk('IDAT', z) as BlobPart, chunk('IEND', new Uint8Array(0)) as BlobPart);
    return new Blob(parts, { type: 'image/png' });
  }
}
