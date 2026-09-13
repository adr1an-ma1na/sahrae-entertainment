/**
 * Is there a real GPU behind this WebGL context?
 *
 * Asking "is WebGL available?" is the wrong question, and answering it is how
 * software rasterisers get handed work they cannot do. Emulators, many cheap
 * Android TV boxes and some virtualised desktops fall back to SwiftShader: a
 * complete, working WebGL implementation that executes every fragment on the
 * CPU. It answers YES to availability and then runs a full-screen shader at
 * roughly the speed of a flipbook.
 *
 * The upscaler gates on this. Running a per-frame shader on a software renderer
 * during a live match would trade the thing that was asked for — reliable, smooth
 * sport — for a sharper still frame nobody can watch.
 */

/** Renderer strings that mean "no hardware acceleration here". */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|microsoft basic render|generic renderer|apple software/i;

export interface GpuReport {
  available: boolean;
  software: boolean;
  renderer: string;
  /** Safe to run a continuous full-screen shader. */
  canRunShaders: boolean;
}

/**
 * Read the unmasked renderer name.
 *
 * WEBGL_debug_renderer_info is absent in privacy-hardened browsers, and that is
 * not a failure. An unknown name is treated as real hardware, because refusing
 * to render on every browser that withholds the string would punish the cautious
 * rather than the slow.
 */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return '';
    return String(gl.getParameter((dbg as any).UNMASKED_RENDERER_WEBGL) || '');
  } catch {
    return '';
  }
}

export function isSoftwareRenderer(name: string): boolean {
  return !!name && SOFTWARE.test(name);
}

let cached: GpuReport | null = null;

/**
 * Probe once and cache.
 *
 * Cached because browsers cap how many WebGL contexts may exist at a time, so
 * probing per player mount would eventually exhaust the limit and break the
 * feature this is meant to protect.
 */
export function gpuReport(): GpuReport {
  if (cached) return cached;

  const miss: GpuReport = { available: false, software: false, renderer: '', canRunShaders: false };
  // Deliberately NOT cached: no document yet is transient — the module can load
  // before the DOM — and caching it would disable shaders for the whole session
  // on perfectly capable hardware.
  if (typeof document === 'undefined') return miss;

  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) { cached = miss; return cached; }

    const name = rendererName(gl);
    const software = isSoftwareRenderer(name);
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 0) : 0;
    const weak = cores > 0 && cores <= 2;

    cached = { available: true, software, renderer: name, canRunShaders: !software && !weak };
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
    return cached;
  } catch {
    cached = miss;
    return cached;
  }
}

/** For tests, which need a clean slate between cases. */
export function resetGpuReport(): void { cached = null; }
