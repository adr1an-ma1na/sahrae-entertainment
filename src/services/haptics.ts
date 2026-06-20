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
 * Guaranteed feedback. The predefined `Haptics.impact()` effect is imperceptible
 * — or a silent no-op — on a lot of Android hardware, which is why users felt
 * nothing. So we fire a REAL motor vibration (plugin first, then the WebView's
 * own vibrate API as a fallback) with durations tuned to actually be felt.
 */
const buzz = (ms: number) =>
  run(async () => {
    try {
      await Haptics.vibrate({ duration: ms });
    } catch {
      webVibrate(ms);
    }
  });

export const haptics = {
  /** Selection / navigation / card open — the everyday tap. */
  tap: () => buzz(22),
  /** Primary actions (play, confirm) — a firm thud. */
  press: () => buzz(38),
  /** Big moments (enter fullscreen, success). */
  heavy: () => buzz(55),
  /** Light tick — focus move / scroll. */
  select: () => buzz(14),
};

// ImpactStyle retained for API compatibility; no longer used directly.
void ImpactStyle;
