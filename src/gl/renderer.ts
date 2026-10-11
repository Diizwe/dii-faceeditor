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
uniform sampler2D uTex; uniform vec4 uA; // exposure EV, contrast -1..1, warmth -1..1, saturation -1..1
out vec4 o;
vec3 toLin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toEnc(vec3 c){ return mix(c*12.92, 1.055*pow(max(c, vec3(0.0)), vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texelFetch(uTex, ivec2(gl_FragCoord.xy), 0).rgb;
  vec3 l = toLin(c);
  l *= exp2(uA.x);
  vec3 g = vec3(exp(0.18*uA.z), 1.0, exp(-0.18*uA.z));
  g /= dot(g, vec3(0.2126, 0.7152, 0.0722));   // keep luminance, move white balance only
  l *= g;
  vec3 e = toEnc(clamp(l, 0.0, 1.0));
  // saturation scales chroma about luma in encoded space, which keeps hue exactly; the gain is limited per pixel so no channel clips
  float Ye = dot(e, vec3(0.2126, 0.7152, 0.0722));
  vec3 d = e - Ye;
  float k = 1.0 + uA.w;
  if (k > 1.0) {
    vec3 room = mix(Ye / max(-d, vec3(1e-6)), (1.0 - Ye) / max(d, vec3(1e-6)), step(0.0, d));
    k = min(k, max(1.0, min(room.r, min(room.g, room.b))));
  }
  e = Ye + d * k;
  vec3 s = e*e*(3.0-2.0*e);
  e = uA.y >= 0.0 ? mix(e, s, uA.y) : 0.5 + (e - 0.5) * (1.0 + uA.y);
  o = vec4(clamp(e, 0.0, 1.0), 1.0);
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
export interface Plan { m: Affine; w: number; h: number; light?: LightParams | null; }

export interface RendererOptions { colorSpace?: 'srgb' | 'display-p3'; maxTextureSize?: number; }

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; }

export class Renderer {
  gl: WebGL2RenderingContext;
  readonly maxTex: number;
  private progGeom: WebGLProgram; private progPresent: WebGLProgram; private progLight: WebGLProgram;
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
    this.progLight = this.program(VERT, LIGHT);
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

  /** Run the edit pipeline for the preview. Geometry gives the unedited frame; later passes ping-pong into `edited`. */
  renderWork(plan: Plan) {
    const gl = this.gl, { w, h } = plan;
    if (!this.work || this.work.w !== w || this.work.h !== h) { this.free(this.work); this.free(this.edited); this.work = this.target(w, h, true, true); this.edited = null; }
    this.runGeometry(plan.m, w, h, this.work);
    gl.bindTexture(gl.TEXTURE_2D, this.work.tex); gl.generateMipmap(gl.TEXTURE_2D);
    this.out = this.work;
    if (plan.light) {
      this.edited ??= this.target(w, h, true, true);
      const L = plan.light;
      this.runLight(this.work, this.edited, [L.exposure, L.contrast / 100, L.warmth / 100, L.saturation / 100]);
      gl.bindTexture(gl.TEXTURE_2D, this.edited.tex); gl.generateMipmap(gl.TEXTURE_2D);
      this.out = this.edited;
    }
  }

  private runLight(src: Target, dst: Target, a: [number, number, number, number]) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(this.progLight); gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.progLight, 'uTex'), 0);
    gl.uniform4f(gl.getUniformLocation(this.progLight, 'uA'), a[0], a[1], a[2], a[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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

  present(view: View, cssW: number, cssH: number, dpr: number, bg: [number, number, number], split = -1) {
    const gl = this.gl;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (!this.out || !this.work) { gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    gl.useProgram(this.progPresent);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.out.tex);
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

  dispose() { this.free(this.work); this.free(this.edited); if (this.src) this.gl.deleteTexture(this.src.tex); if (!(this.canvas instanceof HTMLCanvasElement)) this.gl.getExtension('WEBGL_lose_context')?.loseContext(); /* a DOM canvas may be reused by the next renderer, so its context must stay alive */ }
}
