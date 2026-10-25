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
export function playerSandbox(shieldOn: boolean, url?: string): string | undefined {
  if (!shieldAppliesHere()) return undefined;
  if (url && refusesSandbox(url)) return undefined;
  return shieldOn ? SHIELD_SANDBOX : undefined;
}

/**
 * Players that will not run sandboxed at all: they show the red "Remove
 * sandbox attributes on the iframe tag" screen instead of the stream. Every
 * Live Sports feed is on embed.st, and of the film servers only VidZee runs
 * sandboxed (all checked 2026-10-25). With the shield on
 * by default no match and three of four film servers could play on the web,
 * which is what "every server fails" was on the web. These load unsandboxed; the shield
 * cannot protect them, and the toggle is not offered for them.
 */
const SANDBOX_REFUSERS = [
  'embed.st', 'streamed.pk', 'streamed.su', // Live Sports
  'vidsrc.wtf', 'viduki.net', // Viduki: "This player was sandboxed"
  'vidrock.to', 'vidrock.ru', // VidRock: "Sandbox Not Allowed"
  'vidlink.pro', // VidLink Pro: "Please Disable Sandbox"
  'vixsrc.to', // VixSrc: black when sandboxed, plays without (no pop-ups seen)
];

export function refusesSandbox(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return SANDBOX_REFUSERS.some((r) => h === r || h.endsWith('.' + r));
  } catch {
    return false;
  }
}

/**
 * Players that refuse to play without knowing which site embeds them. The
 * others get no referrer at all; these get only the site's origin, never the
 * page address. VixSrc shows "use referrerpolicy=origin" otherwise (2026-10-25).
 */
const NEEDS_ORIGIN = ['vixsrc.to'];

export function playerReferrer(url: string): 'origin' | 'no-referrer' {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return NEEDS_ORIGIN.some((r) => h === r || h.endsWith('.' + r)) ? 'origin' : 'no-referrer';
  } catch {
    return 'no-referrer';
  }
}
