// Baseline JPEG encoder written from scratch: 4:4:4, standard Huffman tables, optional ICC profile (APP2),
// never any EXIF/GPS. Rows are fed in bands so a 48 MP image never needs a full-size buffer.

const ZZ = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
const QL = [16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];

const DC_L_BITS = [0,1,5,1,1,1,1,1,1,0,0,0,0,0,0,0], DC_L_VAL = [0,1,2,3,4,5,6,7,8,9,10,11];
const DC_C_BITS = [0,3,1,1,1,1,1,1,1,1,1,0,0,0,0,0], DC_C_VAL = [0,1,2,3,4,5,6,7,8,9,10,11];
const AC_L_BITS = [0,2,1,3,3,2,4,3,5,5,4,4,0,0,1,0x7d];
const AC_L_VAL = [0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,0x29,0x2a,0x34,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa];
const AC_C_BITS = [0,2,1,2,4,4,3,4,7,5,4,4,0,1,2,0x77];
const AC_C_VAL = [0x00,0x01,0x02,0x03,0x11,0x04,0x05,0x21,0x31,0x06,0x12,0x41,0x51,0x07,0x61,0x71,0x13,0x22,0x32,0x81,0x08,0x14,0x42,0x91,0xa1,0xb1,0xc1,0x09,0x23,0x33,0x52,0xf0,0x15,0x62,0x72,0xd1,0x0a,0x16,0x24,0x34,0xe1,0x25,0xf1,0x17,0x18,0x19,0x1a,0x26,0x27,0x28,0x29,0x2a,0x35,0x36,0x37,0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x82,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x92,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa];

type Huff = { code: Uint16Array; size: Uint8Array };
function buildHuff(bits: number[], vals: number[]): Huff {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) { for (let i = 0; i < bits[l - 1]; i++) { code[vals[k]] = c++; size[vals[k]] = l; k++; } c <<= 1; }
  return { code, size };
}
const H_DC_L = buildHuff(DC_L_BITS, DC_L_VAL), H_DC_C = buildHuff(DC_C_BITS, DC_C_VAL);
const H_AC_L = buildHuff(AC_L_BITS, AC_L_VAL), H_AC_C = buildHuff(AC_C_BITS, AC_C_VAL);

// AAN float DCT scale factors
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

export interface JpegOptions { width: number; height: number; quality: number; icc?: Uint8Array | null; }

export class JpegWriter {
  private chunks: Uint8Array[] = [];
  private buf = new Uint8Array(1 << 16); private n = 0;
  private bitBuf = 0; private bitCnt = 0;
  private dcPrev = [0, 0, 0];
  private qL = new Float32Array(64); private qC = new Float32Array(64);
  private qLi = new Uint8Array(64); private qCi = new Uint8Array(64);
  private rowsDone = 0;
  private pending: Uint8Array | null = null;

  constructor(private o: JpegOptions) {
    const q = Math.min(100, Math.max(1, Math.round(o.quality)));
    const sc = q < 50 ? 5000 / q : 200 - q * 2;
    for (let i = 0; i < 64; i++) {
      const l = Math.min(255, Math.max(1, Math.floor((QL[i] * sc + 50) / 100)));
      const c = l; // 4:4:4 keeps full chroma, so chroma uses the luma quantiser (fewer colour errors than the standard chroma table)
      this.qLi[i] = l; this.qCi[i] = c;
    }
    // natural-order reciprocal quantisers with the AAN scale folded in
    for (let i = 0; i < 64; i++) {
      const row = i >> 3, col = i & 7;
      const s = 1 / (AAN[row] * AAN[col] * 8);
      this.qL[i] = s / this.qLi[i]; this.qC[i] = s / this.qCi[i];
    }
    this.header();
  }

  private u8(v: number) { if (this.n === this.buf.length) this.flushBuf(); this.buf[this.n++] = v; }
  private u16(v: number) { this.u8(v >> 8); this.u8(v & 255); }
  private flushBuf() { this.chunks.push(this.buf.slice(0, this.n)); this.n = 0; }

  private header() {
    const { width: w, height: h, icc } = this.o;
    this.u16(0xffd8);
    this.u16(0xffe0); this.u16(16); [0x4a,0x46,0x49,0x46,0].forEach((b) => this.u8(b)); this.u8(1); this.u8(1); this.u8(0); this.u16(1); this.u16(1); this.u8(0); this.u8(0);
    if (icc && icc.length) {
      const chunk = 65535 - 2 - 14; // payload per APP2 chunk
      const count = Math.ceil(icc.length / chunk);
      for (let i = 0; i < count; i++) {
        const part = icc.subarray(i * chunk, (i + 1) * chunk);
        this.u16(0xffe2); this.u16(part.length + 16);
        'ICC_PROFILE'.split('').forEach((c) => this.u8(c.charCodeAt(0))); this.u8(0); this.u8(i + 1); this.u8(count);
        for (let k = 0; k < part.length; k++) this.u8(part[k]);
      }
    }
    for (const [id, t] of [[0, this.qLi], [1, this.qCi]] as const) {
      this.u16(0xffdb); this.u16(67); this.u8(id);
      for (let i = 0; i < 64; i++) this.u8(t[ZZ[i]]);
    }
    this.u16(0xffc0); this.u16(17); this.u8(8); this.u16(h); this.u16(w); this.u8(3);
    this.u8(1); this.u8(0x11); this.u8(0); this.u8(2); this.u8(0x11); this.u8(1); this.u8(3); this.u8(0x11); this.u8(1);
    for (const [cls, id, bits, vals] of [[0,0,DC_L_BITS,DC_L_VAL],[1,0,AC_L_BITS,AC_L_VAL],[0,1,DC_C_BITS,DC_C_VAL],[1,1,AC_C_BITS,AC_C_VAL]] as const) {
      this.u16(0xffc4); this.u16(19 + vals.length); this.u8((cls << 4) | id);
      bits.forEach((b) => this.u8(b)); vals.forEach((v) => this.u8(v));
    }
    this.u16(0xffda); this.u16(12); this.u8(3); this.u8(1); this.u8(0x00); this.u8(2); this.u8(0x11); this.u8(3); this.u8(0x11); this.u8(0); this.u8(63); this.u8(0);
  }

  private putBits(code: number, size: number) {
    this.bitBuf = (this.bitBuf << size) | (code & ((1 << size) - 1)); this.bitCnt += size;
    while (this.bitCnt >= 8) {
      const b = (this.bitBuf >> (this.bitCnt - 8)) & 255;
      this.u8(b); if (b === 255) this.u8(0);
      this.bitCnt -= 8;
    }
    this.bitBuf &= (1 << this.bitCnt) - 1;
  }

  private block(d: Float32Array, q: Float32Array, comp: number, dcH: Huff, acH: Huff) {
    // fdct (jfdctflt) on rows then columns
    for (let r = 0; r < 8; r++) fdct1(d, r * 8, 1);
    for (let c = 0; c < 8; c++) fdct1(d, c, 8);
    const qv = new Int32Array(64);
    for (let i = 0; i < 64; i++) qv[i] = Math.round(d[ZZ[i]] * q[ZZ[i]]);
    const diff = qv[0] - this.dcPrev[comp]; this.dcPrev[comp] = qv[0];
    const cat = (v: number) => { v = Math.abs(v); let n = 0; while (v) { n++; v >>= 1; } return n; };
    let s = cat(diff);
    this.putBits(dcH.code[s], dcH.size[s]);
    if (s) this.putBits(diff < 0 ? diff - 1 : diff, s);
    let run = 0;
    for (let i = 1; i < 64; i++) {
      const v = qv[i];
      if (v === 0) { run++; continue; }
      while (run > 15) { this.putBits(acH.code[0xf0], acH.size[0xf0]); run -= 16; }
      s = cat(v);
      const sym = (run << 4) | s;
      this.putBits(acH.code[sym], acH.size[sym]);
      this.putBits(v < 0 ? v - 1 : v, s);
      run = 0;
    }
    if (run) this.putBits(acH.code[0], acH.size[0]);
  }

  /** Feed `rows` full-width RGBA rows. Rows are buffered to multiples of 8. */
  addRows(rgba: Uint8Array, rows: number) {
    const w = this.o.width;
    let data = rgba, total = rows;
    if (this.pending) { const m = new Uint8Array(this.pending.length + rows * w * 4); m.set(this.pending); m.set(rgba.subarray(0, rows * w * 4), this.pending.length); data = m; total = this.pending.length / (w * 4) + rows; this.pending = null; }
    const use = this.rowsDone + total >= this.o.height ? total : total - (total % 8);
    for (let by = 0; by < use; by += 8) this.mcuRow(data, by, Math.min(8, use - by));
    this.rowsDone += use;
    if (use < total) this.pending = data.slice(use * w * 4, total * w * 4);
  }

  private mcuRow(data: Uint8Array, y0: number, rows: number) {
    const w = this.o.width;
    const Y = new Float32Array(64), Cb = new Float32Array(64), Cr = new Float32Array(64);
    for (let bx = 0; bx < w; bx += 8) {
      for (let y = 0; y < 8; y++) {
        const sy = Math.min(y, rows - 1);
        for (let x = 0; x < 8; x++) {
          const sx = Math.min(bx + x, w - 1);
          const p = ((y0 + sy) * w + sx) * 4;
          const r = data[p], g = data[p + 1], b = data[p + 2];
          Y[y * 8 + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          Cb[y * 8 + x] = -0.168736 * r - 0.331264 * g + 0.5 * b;
          Cr[y * 8 + x] = 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
      this.block(Y, this.qL, 0, H_DC_L, H_AC_L);
      this.block(Cb, this.qC, 1, H_DC_C, H_AC_C);
      this.block(Cr, this.qC, 2, H_DC_C, H_AC_C);
    }
  }

  finish(): Blob {
    if (this.bitCnt) this.putBits(0x7f, 8 - this.bitCnt);
    this.u16(0xffd9);
    this.flushBuf();
    return new Blob(this.chunks as BlobPart[], { type: 'image/jpeg' });
  }
}

function fdct1(d: Float32Array, o: number, s: number) {
  const t0 = d[o] + d[o + 7 * s], t7 = d[o] - d[o + 7 * s];
  const t1 = d[o + s] + d[o + 6 * s], t6 = d[o + s] - d[o + 6 * s];
  const t2 = d[o + 2 * s] + d[o + 5 * s], t5 = d[o + 2 * s] - d[o + 5 * s];
  const t3 = d[o + 3 * s] + d[o + 4 * s], t4 = d[o + 3 * s] - d[o + 4 * s];
  let a0 = t0 + t3; const a3 = t0 - t3; let a1 = t1 + t2; const a2 = t1 - t2;
  d[o] = a0 + a1; d[o + 4 * s] = a0 - a1;
  const z1 = (a2 + a3) * 0.707106781;
  d[o + 2 * s] = a3 + z1; d[o + 6 * s] = a3 - z1;
  a0 = t4 + t5; a1 = t5 + t6; const a2b = t6 + t7;
  const z5 = (a0 - a2b) * 0.382683433, z2 = 0.5411961 * a0 + z5, z4 = 1.306562965 * a2b + z5, z3 = a1 * 0.707106781;
  const z11 = t7 + z3, z13 = t7 - z3;
  d[o + 5 * s] = z13 + z2; d[o + 3 * s] = z13 - z2; d[o + s] = z11 + z4; d[o + 7 * s] = z11 - z4;
}
