import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Native haptic feedback — the tactile layer that makes Sahrae feel like a
 * first-class native app rather than a web wrapper.
 *
 * Every call is fire-and-forget and fully guarded, so it silently no-ops on the
 * web / unsupported devices and never throws into the UI. Intensities are tuned
 * to actually be FELT on real Android phones (Light impacts are imperceptible on
 * many devices), and each impact has a `vibrate()` fallback for hardware that
 * doesn't implement the predefined impact effects.
 */
function run(make: () => Promise<unknown> | void) {
  try {
    const r = make();
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* haptics unavailable — ignore */
  }
}

const webVibrate = (ms: number) => {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') nav.vibrate(ms);
  } catch { /* ignore */ }
};

/**
 * Guaranteed feedback. The predefined `Haptics.impact()` is imperceptible — or a
 * silent no-op — on a lot of Android hardware, and very short vibrations (<30ms)
 * are ignored by many devices. So we fire the WebView's own vibrate API FIRST
 * (most reliable, VIBRATE permission is in the manifest) with felt durations,
 * and also kick the native plugin as a belt-and-braces.
 *
 * NOTE: if NOTHING is felt, check the phone's system setting for "Touch
 * feedback / Haptic feedback / Vibrate on tap" — when that's off, the OS
 * suppresses app vibration entirely.
 */
const buzz = (ms: number) => {
  webVibrate(ms);
  run(async () => { try { await Haptics.vibrate({ duration: ms }); } catch { /* ignore */ } });
};

export const haptics = {
  /** Selection / navigation / card open — the everyday tap. */
  tap: () => buzz(40),
  /** Primary actions (play, confirm) — a firm thud. */
  press: () => buzz(60),
  /** Big moments (enter fullscreen, success). */
  heavy: () => buzz(85),
  /** Light tick — focus move / scroll. */
  select: () => buzz(28),
};

// ImpactStyle retained for API compatibility; no longer used directly.
void ImpactStyle;
