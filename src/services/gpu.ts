/**
 * Is there a real GPU behind this WebGL context?
 *
 * WHY THIS EXISTS
 * The profile picker — the FIRST screen of the app — renders a full-screen
 * three.js fragment shader as decoration. Its only guard was a try/catch around
 * the renderer constructor, which asks "is WebGL available?". That is the wrong
 * question. Emulators and headless GPUs answer YES: Android emulators, BlueStacks
 * and many low-end TV boxes fall back to SwiftShader, a software rasteriser that
 * provides a complete, working WebGL context and executes every fragment on the
 * CPU.
 *
 * So the check passed, and the app then asked a CPU to run a five-iteration
 * shader with a division per iteration, antialiased, at up to twice the device
 * pixel ratio, sixty times a second, across the whole screen. The app did not
 * crash — it froze on the first screen, before anyone could reach a single
 * feature. Indistinguishable from a broken build, and reported as one.
 *
 * The right question is "is this GPU real?", which WEBGL_debug_renderer_info can
 * answer by name.
 *
 * This matters well beyond emulators: the cheap Android TV boxes this app
 * deliberately targets are exactly the hardware most likely to be rasterising in
 * software, and they were hitting the same wall on the same screen.
 */

/** Renderer strings that mean "no hardware acceleration here". */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|mesa offscreen|microsoft basic render|generic renderer|apple software/i;

export interface GpuReport {
  /** A WebGL context could be created at all. */
  available: boolean;
  /** The context exists but is rasterising on the CPU. */
  software: boolean;
  /** Unmasked renderer name, when the browser will disclose it. */
  renderer: string;
  /** Safe to run a continuous full-screen shader. */
  canRunShaders: boolean;
}

/**
 * Read the renderer name from a live context.
 *
 * WEBGL_debug_renderer_info is absent in some privacy-hardened browsers, and
 * that is not a failure — an unknown name is treated as "probably fine", because
 * refusing to render on every browser that withholds the string would punish the
 * cautious rather than the slow.
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

/**
 * Probe once, with a throwaway context, and cache.
 *
 * Cached because creating and discarding WebGL contexts is not free and browsers
 * cap how many may exist at a time — probing on every mount would eventually
 * exhaust the limit and break the very feature it is guarding.
 */
let cached: GpuReport | null = null;

export function gpuReport(): GpuReport {
  if (cached) return cached;

  const miss: GpuReport = { available: false, software: false, renderer: '', canRunShaders: false };
  // Deliberately NOT cached. No document yet is a transient condition — the
  // module can be imported before the DOM exists — and caching that answer would
  // disable shaders permanently for the rest of the session on hardware that is
  // perfectly capable. A real probe result is cached; the absence of a place to
  // probe is not an answer worth keeping.
  if (typeof document === 'undefined') return miss;

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) { cached = miss; return cached; }

    const name = rendererName(gl);
    const software = isSoftwareRenderer(name);

    // A machine reporting two cores or less will struggle with a continuous
    // full-screen shader whatever the renderer claims to be.
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 0) : 0;
    const weak = cores > 0 && cores <= 2;

    cached = {
      available: true,
      software,
      renderer: name,
      canRunShaders: !software && !weak,
    };

    // Release the probe context immediately rather than waiting for GC.
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
    return cached;
  } catch {
    cached = miss;
    return cached;
  } finally {
    canvas = null;
  }
}

/** For tests, which need a clean slate between cases. */
export function resetGpuReport(): void { cached = null; }
