import type { PlaybackAction } from '../types/index.ts';

/**
 * Tier 1 — deep-link handoff.
 *
 * We hand the user to the provider's own app. If that app is not installed we
 * open the provider's web page instead. Sahrae never sources or plays the audio
 * at this tier; it is a launcher.
 *
 * The awkward part is that no browser tells you whether a custom-scheme
 * navigation succeeded. The reliable signal is indirect: if the OS switches to
 * another app, our page is backgrounded, so `visibilitychange`/`blur` fires. If
 * nothing has fired by the time the timer expires, nothing handled the scheme
 * and we fall back. Hence `FALLBACK_DELAY_MS` — long enough for a cold app
 * launch on a slow phone, short enough not to feel broken.
 */

const FALLBACK_DELAY_MS = 1200;

export interface LaunchResult {
  /** Which route was actually taken. */
  opened: 'app' | 'web' | 'none';
  reason?: string;
}

export interface LaunchDeps {
  /** Navigate to a URI (custom scheme or https). */
  navigate: (url: string) => void;
  /** Open a URL in a new tab/system browser. */
  openExternal: (url: string) => void;
  /** Register a one-shot "we got backgrounded" listener; returns an unsubscribe. */
  onBackgrounded: (fn: () => void) => () => void;
  /** Deferred callback; returns a cancel fn. */
  delay: (ms: number, fn: () => void) => () => void;
  /** True when running inside the Capacitor shell. */
  isNative: boolean;
}

/**
 * Pure launcher, dependency-injected so the decision logic is testable without
 * a DOM. `runLaunch` below wires it to the real browser.
 */
export function launchWith(deps: LaunchDeps, action: PlaybackAction): Promise<LaunchResult> {
  return new Promise((resolve) => {
    if (action.kind === 'unavailable') {
      resolve({ opened: 'none', reason: action.reason });
      return;
    }
    if (action.kind !== 'deeplink') {
      // Tier 2 and 3 are not part of Phase 1. Refusing loudly beats silently
      // doing something half-right.
      resolve({ opened: 'none', reason: `Playback kind "${action.kind}" is not implemented in Phase 1.` });
      return;
    }

    const { deepLink, webUrl } = action;

    if (!deepLink) {
      deps.openExternal(webUrl);
      resolve({ opened: 'web', reason: 'No native deep link for this provider.' });
      return;
    }

    let settled = false;
    const finish = (r: LaunchResult) => {
      if (settled) return;
      settled = true;
      cancelTimer();
      unsub();
      resolve(r);
    };

    // Backgrounded ⇒ another app took the intent ⇒ the deep link worked.
    const unsub = deps.onBackgrounded(() => finish({ opened: 'app' }));

    const cancelTimer = deps.delay(FALLBACK_DELAY_MS, () => {
      // Still here, so nothing claimed the scheme.
      deps.openExternal(webUrl);
      finish({ opened: 'web', reason: 'The provider app did not respond; opened the web player.' });
    });

    deps.navigate(deepLink);
  });
}

/** Browser/Capacitor wiring for `launchWith`. */
export function browserDeps(): LaunchDeps {
  const isNative = typeof window !== 'undefined'
    && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

  return {
    isNative,
    navigate: (url) => {
      // An iframe would silently swallow the error for unknown schemes, but
      // modern Android/iOS both handle a direct assignment without showing an
      // error page when the scheme is unregistered.
      window.location.href = url;
    },
    openExternal: (url) => {
      // noopener/noreferrer: the opened page must not get a handle on us.
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = url; // popup blocked — navigate instead
    },
    onBackgrounded: (fn) => {
      const onVis = () => { if (document.hidden) fn(); };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', fn);
      window.addEventListener('blur', fn);
      return () => {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pagehide', fn);
        window.removeEventListener('blur', fn);
      };
    },
    delay: (ms, fn) => {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
  };
}

/** Launch a resolved action in the real browser / app shell. */
export function launch(action: PlaybackAction): Promise<LaunchResult> {
  return launchWith(browserDeps(), action);
}
