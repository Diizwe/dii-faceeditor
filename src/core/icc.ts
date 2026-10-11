// Minimal JPEG/PNG ICC profile extraction and classification. No EXIF is ever read for location; only orientation is
// handled by the browser decoder.
export type ColorMode = 'srgb' | 'display-p3' | 'other';

export function extractIcc(buf: Uint8Array): Uint8Array | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return extractJpegIcc(buf);
  if (buf[0] === 0x89 && buf[1] === 0x50) return extractPngIcc(buf);
  return null;
}

function extractJpegIcc(b: Uint8Array): Uint8Array | null {
  const chunks: { seq: number; data: Uint8Array }[] = [];
  let i = 2;
  while (i + 4 < b.length && b[i] === 0xff) {
    const m = b[i + 1];
    if (m === 0xda || m === 0xd9) break;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xe2 && len > 16) {
      const tag = String.fromCharCode(...b.subarray(i + 4, i + 15));
      if (tag === 'ICC_PROFILE') chunks.push({ seq: b[i + 16], data: b.subarray(i + 18, i + 2 + len) });
    }
    i += 2 + len;
  }
  if (!chunks.length) return null;
  chunks.sort((a, c) => a.seq - c.seq);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.data.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c.data, o); o += c.data.length; }
  return out;
}

function extractPngIcc(b: Uint8Array): Uint8Array | null {
  // iCCP is zlib-compressed; decoded lazily by the caller if needed. We only report presence via classify of raw name.
  let i = 8;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 8 < b.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    if (type === 'iCCP') return null; // handled by classifyPng (profile name only)
    if (type === 'IDAT') break;
    i += 12 + len;
  }
  return null;
}

export function pngProfileName(b: Uint8Array): string | null {
  let i = 8;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 8 < b.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    if (type === 'iCCP') { let e = i + 8; while (b[e] !== 0) e++; return String.fromCharCode(...b.subarray(i + 8, e)); }
    if (type === 'IDAT') break;
    i += 12 + len;
  }
  return null;
}

/** Classify a profile by its description tag. Display P3 is what iPhones write. */
export function classifyIcc(icc: Uint8Array | null): ColorMode {
  if (!icc) return 'srgb';
  const text = new TextDecoder('latin1').decode(icc.subarray(0, Math.min(icc.length, 4096)));
  const utf16 = Array.from(icc.subarray(0, Math.min(icc.length, 4096)))
    .filter((v) => v !== 0).map((v) => String.fromCharCode(v)).join('');
  const hay = text + ' ' + utf16;
  if (/Display P3|DCI-P3|Display-P3/i.test(hay)) return 'display-p3';
  if (/sRGB/i.test(hay)) return 'srgb';
  return 'other';
}
