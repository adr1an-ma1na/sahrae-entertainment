import { Capacitor } from '@capacitor/core';

/**
 * Ad Shield — what actually blocks ads, on each platform.
 *
 * ANDROID APP: the native shell does the real work. It refuses every
 * window.open (onCreateWindow), whitelists top-frame navigation, drops
 * gesture-driven frame redirects to unknown hosts, and blocks a bundled list of
 * ad/popunder hosts at the network layer. Six layers, all below the origin
 * boundary, which is the only place they can see inside a third-party embed.
 *
 * WEB / PWA: none of that is available. A page cannot see or control what
 * happens inside a cross-origin iframe — that is the browser's security model,
 * not a gap in this app. The parent-page `window.open` override that used to be
 * branded "Ad Shield" here was theatre: an ad inside vidsrc calls *its own*
 * window.open, never ours, so the override could not have blocked a single
 * popup. Same for the beforeunload trap — it only ever produced a "Leave site?"
 * dialog after the fact.
 *
 * The ONE control the browser does give a parent page is the iframe `sandbox`
 * attribute. Omitting `allow-popups`, `allow-modals` and `allow-top-navigation`
 * genuinely stops the frame popping windows or hijacking the tab.
 *
 * The catch, and why this is a user-facing toggle rather than always-on: these
 * providers are funded by popunders, and several deliberately refuse to play
 * when sandboxed ("Remove sandbox attributes on the iframe tag"). So it is a
 * real trade — protection vs. some servers working — and the user gets to make
 * it, with the server picker as the escape hatch.
 */

const KEY = 'sahrae.adShield';

/**
 * Scripts and same-origin are required for playback. Deliberately absent:
 * allow-popups, allow-popups-to-escape-sandbox, allow-modals,
 * allow-top-navigation, allow-top-navigation-by-user-activation.
 */
export const SHIELD_SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-presentation allow-orientation-lock allow-pointer-lock';

/** Native already blocks ads properly, so the sandbox trade-off is web-only. */
export const shieldAppliesHere = (): boolean => !Capacitor.isNativePlatform();

export function isShieldOn(): boolean {
  if (!shieldAppliesHere()) return true; // native: always protected
  try {
    return localStorage.getItem(KEY) !== '0'; // default ON
  } catch {
    return true;
  }
}

export function setShieldOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * The sandbox value to put on a third-party player iframe, or undefined to
 * leave it unsandboxed. Native always returns undefined: the native layer does
 * the blocking, and sandboxing there would break providers for no gain.
 */
export function playerSandbox(shieldOn: boolean): string | undefined {
  if (!shieldAppliesHere()) return undefined;
  return shieldOn ? SHIELD_SANDBOX : undefined;
}
