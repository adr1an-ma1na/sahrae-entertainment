/**
 * Enforces "Tier 2 is foreground-only".
 *
 * Background playback of Spotify or YouTube content is out of scope by
 * constraint — both services reserve it for their own apps, and an app that
 * keeps their audio running behind a locked screen is the specific thing that
 * gets pulled. So this is not a comment or a code review convention: when the
 * page stops being visible, the embed is paused.
 *
 * Written against injected callbacks so the state machine is testable without a
 * DOM, and so a native shell (Capacitor's App plugin) can drive it with the same
 * logic the browser uses.
 */

export type GuardEvent = 'hidden' | 'visible';

export interface ForegroundGuardOptions {
  /** Called when playback must stop because we left the foreground. */
  onMustPause: () => void;
  /**
   * Called when we return to the foreground, having paused earlier.
   * Deliberately NOT auto-resume: coming back to the app and having audio
   * suddenly start is startling, and on a phone it can mean playing out loud in
   * a room the listener has since walked into. The UI offers a resume control.
   */
  onMayResume?: () => void;
}

export class ForegroundGuard {
  private opts: ForegroundGuardOptions;
  private active = false;
  /** True when we paused playback ourselves, so we know a resume is on offer. */
  private pausedByGuard = false;

  constructor(opts: ForegroundGuardOptions) {
    this.opts = opts;
  }

  /** Call when playback starts, so the guard knows there is something to pause. */
  playbackStarted(): void {
    this.active = true;
    this.pausedByGuard = false;
  }

  /** Call when playback stops for any other reason. */
  playbackStopped(): void {
    this.active = false;
    this.pausedByGuard = false;
  }

  /** True when the guard is the reason playback is not running. */
  get wasPausedByGuard(): boolean {
    return this.pausedByGuard;
  }

  /**
   * Feed a visibility change in. Idempotent: repeated 'hidden' events (a phone
   * can fire visibilitychange and pagehide and blur for one screen-off) pause
   * once, not three times.
   */
  handle(event: GuardEvent): void {
    if (event === 'hidden') {
      if (!this.active || this.pausedByGuard) return;
      this.pausedByGuard = true;
      this.opts.onMustPause();
      return;
    }
    if (!this.pausedByGuard) return;
    this.pausedByGuard = false;
    this.opts.onMayResume?.();
  }
}

/**
 * Wire a guard to the real browser.
 *
 * `visibilitychange` is the reliable signal across desktop and mobile browsers.
 * `pagehide` catches the iOS case where the page is frozen without a
 * visibilitychange. `blur` is deliberately NOT used: clicking the embedded
 * iframe itself blurs the parent document, which would pause playback the
 * instant the listener pressed play inside the player.
 */
export function attachForegroundGuard(guard: ForegroundGuard): () => void {
  if (typeof document === 'undefined') return () => {};

  const onVisibility = () => guard.handle(document.hidden ? 'hidden' : 'visible');
  const onPageHide = () => guard.handle('hidden');

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
  };
}

/**
 * Development assertion that an embed is genuinely on screen.
 *
 * Both providers require their player to be visible. Hiding it to get
 * audio-only playback is a terms violation, and it is an easy one to introduce
 * by accident — a `display:none` added while debugging a layout, a container
 * that collapses to zero height on a narrow screen. This fails loudly in dev so
 * it never reaches a build.
 *
 * Returns a problem description, or null when the element is properly visible.
 */
export function checkEmbedVisible(el: HTMLElement | null): string | null {
  if (!el) return 'The embed element is not mounted.';
  if (typeof window === 'undefined' || !window.getComputedStyle) return null;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return 'The embed is display:none — Tier 2 requires a visible player.';
  if (style.visibility === 'hidden') return 'The embed is visibility:hidden — Tier 2 requires a visible player.';
  if (Number(style.opacity) === 0) return 'The embed is fully transparent — Tier 2 requires a visible player.';

  const rect = el.getBoundingClientRect();
  // Both providers publish a 200x200 minimum for an embedded player.
  if (rect.width < 200 || rect.height < 200) {
    return `The embed is ${Math.round(rect.width)}×${Math.round(rect.height)}; a visible player must be at least 200×200.`;
  }
  return null;
}
