import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Native haptic feedback — the tactile layer that makes Sahrae feel like a
 * first-class native app rather than a web wrapper. Every call is fire-and-forget
 * and fully guarded, so it silently no-ops on the web / unsupported devices and
 * never throws into the UI.
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

export const haptics = {
  /** Light tick — navigation, selection, card open. */
  tap: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
  /** Medium thud — primary actions (play, confirm). */
  press: () => run(() => Haptics.impact({ style: ImpactStyle.Medium })),
  /** Heavy — big moments (enter fullscreen, success). */
  heavy: () => run(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  /** Selection change — moving focus between items. */
  select: () => run(() => Haptics.selectionChanged()),
};
