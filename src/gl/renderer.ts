import type { Affine } from '../core/geometry';

const VERT = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); vUv = p; gl_Position = vec4(p*2.0-1.0,0.0,1.0); }`;

// Geometry pass: output pixel centre -> source pixel via an affine, bilinear sample. Values stay in the source's
// own encoding (no colour conversion), so an identity edit reproduces the input.
const GEOM = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uSrcSize; uniform vec3 uRow0; uniform vec3 uRow1;
out vec4 o;
void main(){
  vec2 p = gl_FragCoord.xy;
  vec2 s = vec2(dot(uRow0, vec3(p,1.0)), dot(uRow1, vec3(p,1.0)));
  o = vec4(texture(uSrc, s / uSrcSize).rgb, 1.0);
}`;

const LIGHT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask; uniform float uUseMask; uniform vec4 uA; // exposure EV, contrast -1..1, warmth -1..1, saturation -1..1
out vec4 o;
vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toEnc(vec3 c){ return mix(c*12.92, 1.055*pow(max(c, vec3(0.0)), vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texelFetch(uTex, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 l = toLin(c);
  l *= exp2(uA.x);
  // soft shoulder: highlights above 0.8 roll off instead of clipping when exposure is raised
  l = mix(l, 0.8 + 0.2 * (1.0 - exp(-(l - 0.8) / 0.2)), step(0.8, l) * step(0.0001, uA.x));
  // Warmth protects skin tones: white-balance gains are applied to everything, then for skin-hued, skin-saturated pixels the
  // result keeps its new luma and chroma size but takes back the original hue direction (hue-preserving), so faces stay natural while the scene warms.
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), dd = mx - mn;
  float hue = 0.0;
  if (dd > 1e-4) { hue = (mx == c.r ? mod((c.g - c.b) / dd, 6.0) : mx == c.g ? (c.b - c.r) / dd + 2.0 : (c.r - c.g) / dd + 4.0) * 60.0; if (hue > 180.0) hue -= 360.0; }
  float sat = dd / max(mx, 1e-4);
  float skin = smoothstep(-35.0, -5.0, hue) * (1.0 - smoothstep(50.0, 75.0, hue)) * smoothstep(0.08, 0.2, sat) * (1.0 - smoothstep(0.7, 0.9, sat));
  // inside the picked face's skin mask every pixel is protected, however grey it is; elsewhere only skin-hued pixels are
  float fm = uUseMask > 0.5 ? clamp(texelFetch(uMask, ivec2(gl_FragCoord.xy), 0).r, 0.0, 1.0) : 0.0;
  skin = max(0.9 * skin, fm);
  vec3 g = vec3(exp(0.18*uA.z), 1.0, exp(-0.18*uA.z));
  g /= dot(g, vec3(0.2126, 0.7152, 0.0722));   // keep luminance, move white balance only
  l *= g;
  vec3 e = toEnc(clamp(l, 0.0, 1.0));
  {
    float y0 = dot(c, vec3(0.2126, 0.7152, 0.0722)), y1 = dot(e, vec3(0.2126, 0.7152, 0.0722));
    vec3 d0 = c - y0, d1 = e - y1;
    float n0 = length(d0), n1 = length(d1);
    float kk = min(4.0, n1 / max(n0, 1e-5));
    vec3 room = mix(y1 / max(-d0, vec3(1e-6)), (1.0 - y1) / max(d0, vec3(1e-6)), step(0.0, d0));
    kk = min(kk, min(room.r, min(room.g, room.b)));   // never clip: clipping would rotate the hue we are protecting
    vec3 keep = y1 + d0 * kk;
    e = mix(e, clamp(keep, 0.0, 1.0), skin);
  }
  // saturation scales chroma about luma in encoded space, which keeps hue exactly; the gain is limited per pixel so no channel clips
  float Ye = dot(e, vec3(0.2126, 0.7152, 0.0722));
  vec3 d = e - Ye;
  float k = 1.0 + 0.7 * uA.w; // saturation acts at 70%: stacked with warmth it turned skin orange
  if (k > 1.0) {
    vec3 room = mix(Ye / max(-d, vec3(1e-6)), (1.0 - Ye) / max(d, vec3(1e-6)), step(0.0, d));
    k = min(k, max(1.0, min(room.r, min(room.g, room.b))));
  }
  e = Ye + d * k;
  vec3 s = e*e*(3.0-2.0*e);
  e = uA.y >= 0.0 ? mix(e, s, 0.7 * uA.y) : 0.5 + (e - 0.5) * (1.0 + uA.y); // gentler S-curve: keeps shadows from crushing
  o = vec4(clamp(e, 0.0, 1.0), 1.0);
}`;


// Separable blur: plain Gaussian when uRange = 0, edge-aware (bilateral) otherwise. Taps beyond the radius are never read,
// so a mask blurred with it is exactly zero beyond its support.
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uStep; uniform float uSigmaS; uniform float uRange; uniform int uRadius;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c0 = texelFetch(uTex, p, 0).rgb;
  vec3 acc = vec3(0.0); float wsum = 0.0;
  ivec2 lim = textureSize(uTex, 0) - 1;
  for (int i = -64; i <= 64; i++) {
    if (i < -uRadius || i > uRadius) continue;
    ivec2 q = clamp(p + ivec2(vec2(i) * uStep), ivec2(0), lim);
    vec3 c = texelFetch(uTex, q, 0).rgb;
    float w = exp(-float(i*i) / (2.0 * uSigmaS * uSigmaS));
    if (uRange > 0.0) { vec3 d = c - c0; w *= exp(-dot(d, d) / (2.0 * uRange * uRange)); }
    acc += c * w; wsum += w;
  }
  o = vec4(acc / wsum, 1.0);
}`;

// Smooth composite: blend (smoothed base + kept fine detail) into the original, weighted by feathered face mask x skin colour.
const SMOOTH = `#version 300 es
precision highp float;
uniform sampler2D uOrig; uniform sampler2D uBase; uniform sampler2D uFine; uniform sampler2D uMask;
uniform vec4 uP; // strength 0..1, detail keep 0..1, skin cb, skin cr
uniform float uTol;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uOrig, p, 0).rgb;
  float m = texelFetch(uMask, p, 0).r;
  if (m <= 0.0) { o = vec4(c, 1.0); return; }
  float cb = -0.168736*c.r - 0.331264*c.g + 0.5*c.b, cr = 0.5*c.r - 0.418688*c.g - 0.081312*c.b;
  float d = length(vec2(cb - uP.z, cr - uP.w)) / uTol;
  float skin = 1.0 - smoothstep(1.4, 3.0, d);
  float w = clamp(m, 0.0, 1.0) * skin * uP.x * 0.85; // 15% of the original always stays: no porcelain skin
  vec3 sm = texelFetch(uBase, p, 0).rgb + (c - texelFetch(uFine, p, 0).rgb) * uP.y;
  // never leave the local range of the original (5x5): smoothing may only move a pixel towards its neighbours, so no halo can appear
  vec3 lo = c, hi = c; ivec2 lim = textureSize(uOrig, 0) - 1;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec3 n = texelFetch(uOrig, clamp(p + ivec2(i, j), ivec2(0), lim), 0).rgb; lo = min(lo, n); hi = max(hi, n); }
  sm = clamp(sm, lo, hi);
  // hue lock: smoothing may change brightness and colourfulness but only part of the hue (averaging across nearby colours would otherwise turn skin slightly redder or greener)
  vec3 mixed = mix(c, sm, w);
  float y0 = dot(c, vec3(0.2126, 0.7152, 0.0722)), y1 = dot(mixed, vec3(0.2126, 0.7152, 0.0722));
  vec3 d0 = c - y0, d1 = mixed - y1;
  float kk = mix(1.0, length(d1) / max(length(d0), 1e-5), 0.5); // half the chroma change: smoothing must not wash skin out or turn it pink
  vec3 room = mix(y1 / max(-d0, vec3(1e-6)), (1.0 - y1) / max(d0, vec3(1e-6)), step(0.0, d0));
  vec3 locked = y1 + d0 * min(kk, min(room.r, min(room.g, room.b)));
  o = vec4(clamp(mix(mixed, locked, 0.85 * clamp(m, 0.0, 1.0) * skin * step(0.0001, uP.x)), lo, hi), 1.0);
}`;

// Whiten: inside the feathered mouth mask, only bright, yellow-hued pixels move: chroma shrinks and luma lifts a little.
const WHITEN = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask; uniform float uS;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uTex, p, 0).rgb;
  float m = texelFetch(uMask, p, 0).r;
  if (m <= 0.0 || uS <= 0.0) { o = vec4(c, 1.0); return; }
  float Y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), dd = mx - mn;
  float hue = 0.0;
  if (dd > 1e-4) hue = (mx == c.r ? mod((c.g - c.b) / dd, 6.0) : mx == c.g ? (c.b - c.r) / dd + 2.0 : (c.r - c.g) / dd + 4.0) * 60.0;
  float yellow = smoothstep(12.0, 28.0, hue) * (1.0 - smoothstep(100.0, 120.0, hue)) * smoothstep(0.04, 0.10, dd / max(mx, 1e-4));
  float bright = smoothstep(0.32, 0.5, Y);   // gums, lips and shadow inside the mouth are dark or red and stay untouched
  float w = clamp(m, 0.0, 1.0) * yellow * bright * uS;
  // chroma shrinks fast at low strength and saturates at 65%, so even at 100 the teeth keep a warm tint instead of turning grey
  vec3 d = (c - Y) * (1.0 - 0.72 * (1.0 - (1.0 - w) * (1.0 - w)));
  float Y2 = Y + 0.10 * w * (1.0 - Y);
  o = vec4(clamp(Y2 + d, 0.0, 1.0), 1.0);
}`;

// Eyes: inside the feathered iris mask only (never sclera, lids or lashes): small luma lift and local contrast.
const EYES = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uBlur; uniform sampler2D uMask; uniform vec2 uP; // brighten, clarity 0..1
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uTex, p, 0).rgb;
  float m = clamp(texelFetch(uMask, p, 0).r, 0.0, 1.0);
  if (m <= 0.0) { o = vec4(c, 1.0); return; }
  vec3 b = texelFetch(uBlur, p, 0).rgb;
  vec3 e = c + clamp((c - b) * uP.y, vec3(-0.08), vec3(0.08)); // bounded local contrast: no black pupil dots
  float Y = dot(e, vec3(0.2126, 0.7152, 0.0722));
  e += uP.x * 0.10 * (1.0 - Y) * (0.4 + Y);
  o = vec4(clamp(mix(c, e, m), 0.0, 1.0), 1.0);
}`;

// Filters: eight looks as colour-grade functions, mixed in by strength. Skin inside the picked face's mask keeps its hue (lock = 1 for neutral looks, 0.85 for the warm/cool looks).
const FILTER = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMask; uniform float uUseMask; uniform float uLook; uniform float uS;
out vec4 o;
vec3 sat(vec3 c, float k){ float y = dot(c, vec3(0.2126, 0.7152, 0.0722)); return y + (c - y) * k; }
vec3 look(vec3 c, int id){
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (id == 0) { return sat(c, 1.18) + (c - 0.5) * 0.08; }                              // Natural boost
  if (id == 1) { return c * vec3(1.06, 1.0, 0.92) + vec3(0.03, 0.012, -0.01); }         // Warm glow
  if (id == 2) { return c * vec3(0.93, 1.0, 1.07) + vec3(-0.02, 0.0, 0.03); }           // Cool
  if (id == 3) { return mix(vec3(0.07), vec3(0.95), c) ; }                               // Matte fade
  if (id == 4) { vec3 t = c + (0.5 - c) * 0.0; t = (t - 0.5) * 1.12 + 0.5; t += vec3(-0.01, 0.015, 0.0) * (1.0 - y); return sat(t, 0.92); } // Film
  if (id == 5) { return vec3(y); }                                                       // Mono
  if (id == 6) { return sat((c - 0.5) * 1.12 + 0.5, 1.35); }                            // Vivid
  return sat(mix(c, vec3(0.92, 0.9, 0.95), 0.18), 0.82);                                 // Soft pastel
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uTex, p, 0).rgb;
  if (uS <= 0.0) { o = vec4(c, 1.0); return; }
  int id = int(uLook + 0.5);
  vec3 l = clamp(look(c, id), 0.0, 1.0);
  vec3 m = mix(c, l, uS);
  float fm = uUseMask > 0.5 ? clamp(texelFetch(uMask, p, 0).r, 0.0, 1.0) : 0.0;
  if (fm > 0.0) {
    float lockK = (id == 1 || id == 2) ? 0.85 : 1.0;
    float y0 = dot(c, vec3(0.2126, 0.7152, 0.0722)), y1 = dot(m, vec3(0.2126, 0.7152, 0.0722));
    vec3 d0 = c - y0, d1 = m - y1;
    float kk = length(d1) / max(length(d0), 1e-5);
    vec3 room = mix(y1 / max(-d0, vec3(1e-6)), (1.0 - y1) / max(d0, vec3(1e-6)), step(0.0, d0));
    vec3 keep = y1 + d0 * min(min(kk, 4.0), min(room.r, min(room.g, room.b)));
    m = mix(m, keep, lockK * fm);
  }
  o = vec4(clamp(m, 0.0, 1.0), 1.0);
}`;

const PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uTexB; uniform float uSplit;
uniform sampler2D uTex; uniform vec2 uImgSize; uniform vec2 uCanvas; uniform vec2 uPan; uniform float uZoom; uniform vec3 uBg;
out vec4 o;
void main(){
  vec2 c = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 img = (c - uPan) / uZoom;
  if (any(lessThan(img, vec2(0.0))) || any(greaterThan(img, uImgSize))) { o = vec4(uBg,1.0); return; }
  vec3 a = texture(uTex, img / uImgSize).rgb;
  if (uSplit >= 0.0) {
    vec3 b = texture(uTexB, img / uImgSize).rgb;
    if (abs(c.x - uSplit) < 1.0) { o = vec4(1.0); return; }
    a = c.x < uSplit ? b : a;
  }
  o = vec4(a, 1.0);
}`;

export interface View { zoom: number; panX: number; panY: number; }
export interface LightParams { exposure: number; contrast: number; warmth: number; saturation: number; } // UI ranges: EV -2..2, others -100..100
export interface FaceMask {
  teeth?: HTMLCanvasElement | OffscreenCanvas | null; iris?: HTMLCanvasElement | OffscreenCanvas | null; // hard rasters sharing maskKey
  mask: HTMLCanvasElement | OffscreenCanvas; maskKey: string; // hard mask raster at work size; key changes when it changes
  fw: number; // face width in work px: all radii are multiples of this
  skin: { cb: number; cr: number; tol: number };
}
export interface SmoothParams { strength: number; keep: number } // 0..100
export interface Plan { m: Affine; w: number; h: number; face?: FaceMask | null; smooth?: SmoothParams | null; whiten?: { strength: number } | null; eyes?: { brighten: number; clarity: number } | null; light?: LightParams | null; filter?: { look: number; strength: number } | null; }

export interface RendererOptions { colorSpace?: 'srgb' | 'display-p3'; maxTextureSize?: number; }

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; }

export class Renderer {
  gl: WebGL2RenderingContext;
  readonly maxTex: number;
  private progGeom: WebGLProgram; private progPresent: WebGLProgram;
  private src: { tex: WebGLTexture; w: number; h: number } | null = null;
  private work: Target | null = null; // geometry result = the unedited frame ("before")
  private edited: Target | null = null; // after retouch/colour passes
  private out: Target | null = null; // what is presented as "after"
  private vao: WebGLVertexArrayObject;
  floatTargets: boolean;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas, opts: RendererOptions = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    if (opts.colorSpace === 'display-p3' && 'drawingBufferColorSpace' in gl) {
      try { (gl as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace = 'display-p3'; } catch { /* keep sRGB */ }
    }
    this.maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, opts.maxTextureSize ?? 4096);
    this.progGeom = this.program(VERT, GEOM);
    this.progPresent = this.program(VERT, PRESENT);
    this.vao = gl.createVertexArray()!;
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader'); return sh; };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  private uploadTexture(bmp: ImageBitmap): { tex: WebGLTexture; w: number; h: number } {
    const gl = this.gl;
    if (bmp.width > this.maxTex || bmp.height > this.maxTex) throw new Error(`Texture ${bmp.width}x${bmp.height} exceeds limit ${this.maxTex}`);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, w: bmp.width, h: bmp.height };
  }

  setSource(bmp: ImageBitmap) {
    if (this.src) this.gl.deleteTexture(this.src.tex);
    this.src = this.uploadTexture(bmp);
  }

  private target(w: number, h: number, float: boolean, mips: boolean): Target {
    const gl = this.gl;
    if (w > this.maxTex || h > this.maxTex) throw new Error(`Target ${w}x${h} exceeds limit ${this.maxTex}`);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const useF = float && this.floatTargets;
    gl.texImage2D(gl.TEXTURE_2D, 0, useF ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, useF ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete');
    return { tex, fbo, w, h };
  }

  private free(t: Target | null) { if (t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); } }

  private runGeometry(m: Affine, outW: number, outH: number, dst: Target) {
    const gl = this.gl, src = this.src!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.progGeom);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.progGeom, 'uSrc'), 0);
    gl.uniform2f(gl.getUniformLocation(this.progGeom, 'uSrcSize'), src.w, src.h);
    gl.uniform3f(gl.getUniformLocation(this.progGeom, 'uRow0'), m[0], m[1], m[2]);
    gl.uniform3f(gl.getUniformLocation(this.progGeom, 'uRow1'), m[3], m[4], m[5]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private extra: Target[] = [];
  private masks = new Map<string, { key: string; t: Target }>();
  private get maskTex(): Target | null { return this.masks.get('face')?.t ?? null; }
  private progs = new Map<string, WebGLProgram>();

  private prog(name: string, frag: string): WebGLProgram {
    let p = this.progs.get(name); if (!p) { p = this.program(VERT, frag); this.progs.set(name, p); } return p;
  }

  /** Generic full-screen pass: textures bound to units 0..n by uniform name, scalar/vector uniforms by name. */
  private pass(name: string, frag: string, dst: Target, tex: Record<string, WebGLTexture>, uni: Record<string, number | number[]>) {
    const gl = this.gl, pr = this.prog(name, frag);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(pr); gl.bindVertexArray(this.vao);
    let unit = 0;
    for (const [n, t] of Object.entries(tex)) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(gl.getUniformLocation(pr, n), unit++); }
    for (const [n, v] of Object.entries(uni)) {
      const loc = gl.getUniformLocation(pr, n); if (!loc) continue;
      if (typeof v === 'number') (n === 'uRadius' ? gl.uniform1i(loc, v) : gl.uniform1f(loc, v));
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]); else if (v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private temp(i: number, w: number, h: number, mips = false): Target {
    const t = this.extra[i];
    if (t && t.w === w && t.h === h) return t;
    this.free(t); return (this.extra[i] = this.target(w, h, true, mips));
  }

  private blur(src: Target, dst: Target, mid: Target, sigma: number, range: number) {
    const radius = Math.min(64, Math.ceil(sigma * 3));
    const u = { uSigmaS: sigma, uRange: range, uRadius: radius };
    this.pass('blur', BLUR, mid, { uTex: src.tex }, { ...u, uStep: [1, 0] });
    this.pass('blur', BLUR, dst, { uTex: mid.tex }, { ...u, uStep: [0, 1] });
  }

  private uploadMask(mask: HTMLCanvasElement | OffscreenCanvas, w: number, h: number): Target {
    const gl = this.gl;
    const raw = this.target(w, h, false, false);
    gl.bindTexture(gl.TEXTURE_2D, raw.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mask as TexImageSource);
    return raw;
  }

  /** Run the edit pipeline for the preview. Geometry gives the unedited frame; later passes ping-pong into 'edited' targets. */
  renderWork(plan: Plan) {
    const gl = this.gl, { w, h } = plan;
    if (!this.work || this.work.w !== w || this.work.h !== h) {
      this.free(this.work); this.free(this.edited); this.clearMasks(); this.work = this.target(w, h, true, true); this.edited = null;
    }
    this.runGeometry(plan.m, w, h, this.work);
    gl.bindTexture(gl.TEXTURE_2D, this.work.tex); gl.generateMipmap(gl.TEXTURE_2D);
    this.out = this.work;
    if (!plan.smooth && !plan.light && !plan.whiten && !plan.eyes && !plan.filter) return;
    this.edited ??= this.target(w, h, true, true);
    let cur: Target = this.work;
    const flip = this.temp(3, w, h, true);
    const next = (): Target => (cur === this.edited ? flip : this.edited!);
    const face = plan.face ?? null;
    if (face && (plan.smooth || plan.light || plan.whiten || plan.eyes || plan.filter)) {
      const feather = Math.max(2, 0.015 * face.fw) / 2;
      this.ensureMask('face', face.mask, face.maskKey, feather, w, h);
      if (plan.whiten && face.teeth) this.ensureMask('teeth', face.teeth, face.maskKey, feather, w, h);
      if (plan.eyes && face.iris) this.ensureMask('iris', face.iris, face.maskKey, feather * 0.6, w, h);
    }
    if (plan.smooth && face && this.maskTex) {
      const sp = plan.smooth;
      const sigmaS = (0.010 + 0.006 * sp.strength / 100) * face.fw, s = sp.strength / 100; // base blur grows with strength
      const t1 = this.temp(0, w, h), t2 = this.temp(1, w, h), t3 = this.temp(2, w, h);
      this.blur(cur, t2, t1, Math.max(1, sigmaS), 0.05 + 0.2 * s);            // edge-aware base
      this.blur(cur, t3, t1, Math.max(0.6, 0.0025 * face.fw), 0);             // fine-detail reference
      const dst = next();
      this.pass('smooth', SMOOTH, dst, { uOrig: cur.tex, uBase: t2.tex, uFine: t3.tex, uMask: this.maskTex.tex },
        { uP: [s, sp.keep / 100, face.skin.cb, face.skin.cr], uTol: face.skin.tol });
      cur = dst;
    }
    if (plan.whiten && face && this.masks.get('teeth')) {
      const dst = next();
      this.pass('whiten', WHITEN, dst, { uTex: cur.tex, uMask: this.masks.get('teeth')!.t.tex }, { uS: plan.whiten.strength / 100 });
      cur = dst;
    }
    if (plan.eyes && face && this.masks.get('iris')) {
      const t1 = this.temp(0, w, h), t3 = this.temp(2, w, h), dst = next();
      this.blur(cur, t3, t1, Math.max(1, 0.012 * face.fw), 0);
      this.pass('eyes', EYES, dst, { uTex: cur.tex, uBlur: t3.tex, uMask: this.masks.get('iris')!.t.tex }, { uP: [plan.eyes.brighten / 100, plan.eyes.clarity / 100] });
      cur = dst;
    }
    if (plan.light) {
      const L = plan.light, dst = next();
      const useMask = face && this.maskTex ? 1 : 0;
      this.pass('light', LIGHT, dst, { uTex: cur.tex, uMask: (this.maskTex ?? cur).tex }, { uA: [L.exposure, L.contrast / 100, L.warmth / 100, L.saturation / 100], uUseMask: useMask });
      cur = dst;
    }
    if (plan.filter) {
      const dst = next(), useMask = face && this.maskTex ? 1 : 0;
      this.pass('filter', FILTER, dst, { uTex: cur.tex, uMask: (this.maskTex ?? cur).tex }, { uLook: plan.filter.look, uS: plan.filter.strength / 100, uUseMask: useMask });
      cur = dst;
    }
    gl.bindTexture(gl.TEXTURE_2D, cur.tex); gl.generateMipmap(gl.TEXTURE_2D);
    this.out = cur;
  }

  private clearMasks() { for (const m of this.masks.values()) this.free(m.t); this.masks.clear(); }

  /** Upload a hard raster and blur it into a feathered, zero-beyond-support mask (cached by key). */
  private ensureMask(name: string, canvas: HTMLCanvasElement | OffscreenCanvas, key: string, sigma: number, w: number, h: number) {
    const have = this.masks.get(name);
    if (have && have.key === key) return;
    if (have) this.free(have.t);
    const raw = this.uploadMask(canvas, w, h), t = this.target(w, h, true, false);
    this.blur(raw, t, this.temp(0, w, h), sigma, 0);
    this.free(raw); this.masks.set(name, { key, t });
  }

  /** The feathered mask by name (tests). */
  readMask(name = 'face'): { w: number; h: number; data: Float32Array } | null {
    const gl = this.gl, t = this.masks.get(name)?.t; if (!t) return null;
    const px = new Float32Array(t.w * t.h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.FLOAT, px);
    return { w: t.w, h: t.h, data: px };
  }

  /** Pixels of the "after" frame (RGBA8 copy via a throwaway pass is not needed for tests; reads the half-float target). */
  readOutHalf(): { w: number; h: number; data: Float32Array } | null {
    const gl = this.gl, t = this.out; if (!t) return null;
    const px = new Float32Array(t.w * t.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.FLOAT, px);
    return { w: t.w, h: t.h, data: px };
  }

  get workSize(): [number, number] | null { return this.work ? [this.work.w, this.work.h] : null; }

  present(view: View, cssW: number, cssH: number, dpr: number, bg: [number, number, number], split = -1, showBefore = false) {
    const gl = this.gl;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (!this.out || !this.work) { gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    gl.useProgram(this.progPresent);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, (showBefore ? this.work : this.out).tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.work.tex);
    const u = (n: string) => gl.getUniformLocation(this.progPresent, n);
    gl.uniform1i(u('uTex'), 0); gl.uniform1i(u('uTexB'), 1); gl.uniform1f(u('uSplit'), split < 0 ? -1 : split * dpr);
    gl.uniform2f(u('uImgSize'), this.work.w, this.work.h);
    gl.uniform2f(u('uCanvas'), W, H);
    gl.uniform2f(u('uPan'), view.panX * dpr, view.panY * dpr);
    gl.uniform1f(u('uZoom'), view.zoom * dpr);
    gl.uniform3f(u('uBg'), bg[0], bg[1], bg[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Read back the working texture as RGBA8 (via an RGBA8 render of the geometry again is unnecessary: blit through present-less path). */
  /** Render the geometry pass for `bmp` into an RGBA8 target and return the pixels (row 0 = image top). Used by tiled export. */
  renderTilePixels(bmp: ImageBitmap, m: Affine, w: number, h: number): Uint8Array {
    const gl = this.gl;
    const prev = this.src;
    this.src = this.uploadTexture(bmp);
    const t = this.target(w, h, false, false);
    this.runGeometry(m, w, h, t);
    const out = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.deleteTexture(this.src.tex); this.free(t);
    this.src = prev;
    return out;
  }

  /** Run the full pipeline on one region of a full-resolution source (export tiles) and return the inner rectangle as RGBA8. */
  renderRegionPixels(bmp: ImageBitmap, plan: Plan, inner: { x: number; y: number; w: number; h: number }): Uint8Array {
    const gl = this.gl;
    const prev = this.src, prevOut = this.out;
    this.src = this.uploadTexture(bmp);
    this.clearMasks(); // masks are per region
    this.renderWork(plan);
    const t = this.out!;
    const f = new Float32Array(inner.w * inner.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(inner.x, inner.y, inner.w, inner.h, gl.RGBA, gl.FLOAT, f);
    const out = new Uint8Array(inner.w * inner.h * 4);
    for (let i = 0; i < out.length; i++) out[i] = i % 4 === 3 ? 255 : Math.max(0, Math.min(255, Math.round(f[i] * 255)));
    gl.deleteTexture(this.src.tex); this.src = prev; this.out = prevOut;
    return out;
  }

  /** Time one geometry pass at the current work size in ms (a 1-pixel readback forces completion). */
  timeGeometryPass(m: Affine, reps = 5): number {
    const gl = this.gl;
    if (!this.work) return NaN;
    const t0 = performance.now();
    const px = new Uint8Array(4);
    for (let i = 0; i < reps; i++) { this.runGeometry(m, this.work.w, this.work.h, this.work); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } // readback forces the software GPU to finish
    return (performance.now() - t0) / reps;
  }

  /** Read the presented canvas (tests). */
  readCanvas(w: number, h: number): Uint8Array { const o = new Uint8Array(w * h * 4); this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.UNSIGNED_BYTE, o); return o; }

  dispose() { this.free(this.work); this.free(this.edited); this.clearMasks(); this.extra.forEach((t) => this.free(t)); if (this.src) this.gl.deleteTexture(this.src.tex); if (!(this.canvas instanceof HTMLCanvasElement)) this.gl.getExtension('WEBGL_lose_context')?.loseContext(); /* a DOM canvas may be reused by the next renderer, so its context must stay alive */ }
}
