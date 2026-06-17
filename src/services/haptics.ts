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

const impact = (style: ImpactStyle, ms: number) =>
  run(async () => {
    try {
      await Haptics.impact({ style });
    } catch {
      // Predefined impact unsupported → guarantee *something* is felt.
      try { await Haptics.vibrate({ duration: ms }); } catch { /* ignore */ }
    }
  });

export const haptics = {
  /** Selection / navigation / card open — the everyday tap. Medium so it's felt. */
  tap: () => impact(ImpactStyle.Medium, 18),
  /** Primary actions (play, confirm) — a firm thud. */
  press: () => impact(ImpactStyle.Heavy, 28),
  /** Big moments (enter fullscreen, success). */
  heavy: () => impact(ImpactStyle.Heavy, 36),
  /** Light tick — focus move / scroll. Subtle on purpose so it isn't fatiguing. */
  select: () => impact(ImpactStyle.Light, 10),
};
