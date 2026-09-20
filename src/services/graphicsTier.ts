import { gpuReport } from './gpu.ts';

/**
 * Decides whether this device gets real liquid glass or flat surfaces.
 *
 * Liquid glass is `backdrop-filter: blur() saturate()` — every frame, the
 * browser re-renders everything behind the element and blurs it. On a phone
 * with a real GPU that is cheap. On a software rasteriser (emulators, many
 * cheap Android TV boxes) it runs on the CPU, and a blurred bottom bar over a
 * scrolling poster grid turns scrolling into a slideshow. That is exactly the
 * hardware this app is sold on, so the glass has to know when to step aside.
 *
 * The answer is a class on <html>, not a React prop: every glass surface is a
 * CSS class, so one selector flattens all of them with no component involved.
 */

export interface GraphicsSignals {
  /** The WebGL renderer is a CPU rasteriser (SwiftShader, llvmpipe…). */
  software: boolean;
  /** navigator.hardwareConcurrency, 0 when unknown. */
  cores: number;
  /** navigator.deviceMemory in GB, 0 when unknown (non-Chromium browsers). */
  memoryGb: number;
}

/**
 * Pure decision, so it can be tested without a browser.
 *
 * Unknown values never count against a device. Firefox and Safari do not report
 * deviceMemory, and a privacy browser may withhold the renderer — treating
 * "unknown" as "weak" would strip the glass from fast machines whose only fault
 * is caution.
 */
export function isLowGraphics(s: GraphicsSignals): boolean {
  if (s.software) return true;
  if (s.cores > 0 && s.cores <= 2) return true;
  if (s.memoryGb > 0 && s.memoryGb <= 2) return true;
  return false;
}

/**
 * Set when the app's rendering engine has crashed on this device. The Android
 * shell writes it after a renderer crash (see MainActivity), and the web app
 * writes it too so a browser tab that survives a renderer crash comes back
 * flattened. Heavy compositing — backdrop blur above all — is the usual cause
 * on phone GPU drivers, and it is exactly what `low-gfx` turns off.
 */
export const SAFE_GRAPHICS_KEY = 'sahrae.gfx.safe.v1';

export function safeGraphicsRequested(): boolean {
  try { return localStorage.getItem(SAFE_GRAPHICS_KEY) === '1'; } catch { return false; }
}

export function requestSafeGraphics(): void {
  try { localStorage.setItem(SAFE_GRAPHICS_KEY, '1'); } catch { /* storage unavailable */ }
  try { document.documentElement.classList.add('low-gfx'); } catch { /* no document */ }
}

export function applyGraphicsTier(): boolean {
  if (typeof document === 'undefined') return false;
  if (safeGraphicsRequested()) {
    document.documentElement.classList.add('low-gfx');
    return true;
  }
  let low = false;
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    low = isLowGraphics({
      // `software` only — NOT !canRunShaders. A browser with WebGL disabled
      // reports available:false, and that says nothing about its compositor.
      software: gpuReport().software,
      cores: nav.hardwareConcurrency || 0,
      memoryGb: nav.deviceMemory || 0,
    });
  } catch {
    low = false; // a failed probe must not cost a capable device its styling
  }
  document.documentElement.classList.toggle('low-gfx', low);
  return low;
}
