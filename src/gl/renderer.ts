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

const PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uImgSize; uniform vec2 uCanvas; uniform vec2 uPan; uniform float uZoom; uniform vec3 uBg;
out vec4 o;
void main(){
  vec2 c = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 img = (c - uPan) / uZoom;
  if (any(lessThan(img, vec2(0.0))) || any(greaterThan(img, uImgSize))) { o = vec4(uBg,1.0); return; }
  o = vec4(texture(uTex, img / uImgSize).rgb, 1.0);
}`;

export interface View { zoom: number; panX: number; panY: number; }

export interface RendererOptions { colorSpace?: 'srgb' | 'display-p3'; maxTextureSize?: number; }

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; }

export class Renderer {
  gl: WebGL2RenderingContext;
  readonly maxTex: number;
  private progGeom: WebGLProgram; private progPresent: WebGLProgram;
  private src: { tex: WebGLTexture; w: number; h: number } | null = null;
  private work: Target | null = null;
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

  /** Run the edit pipeline for the preview into the working texture. `m` maps working pixels to preview-source pixels. */
  renderWork(m: Affine, outW: number, outH: number) {
    if (!this.work || this.work.w !== outW || this.work.h !== outH) { this.free(this.work); this.work = this.target(outW, outH, true, true); }
    this.runGeometry(m, outW, outH, this.work);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.work.tex); gl.generateMipmap(gl.TEXTURE_2D);
  }

  get workSize(): [number, number] | null { return this.work ? [this.work.w, this.work.h] : null; }

  present(view: View, cssW: number, cssH: number, dpr: number, bg: [number, number, number]) {
    const gl = this.gl;
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (!this.work) { gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    gl.useProgram(this.progPresent);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.work.tex);
    const u = (n: string) => gl.getUniformLocation(this.progPresent, n);
    gl.uniform1i(u('uTex'), 0);
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

  dispose() { this.free(this.work); if (this.src) this.gl.deleteTexture(this.src.tex); this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}
