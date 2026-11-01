/**
 * The viewer's privacy choices (Cookies & storage, legal/legalText.ts).
 *
 * Essential storage is always on: Sahrae cannot sign anyone in or keep a
 * library without it. The one optional thing Sahrae shares is the anonymous
 * server report (playProof.ts), and it is off until the viewer turns it on,
 * from the first-visit banner or Profile, Privacy & data.
 *
 * Kept on the device, not synced: consent is given on each device it applies to.
 * Asked again when the legal pages change (LEGAL_VERSION).
 */
import { LEGAL_VERSION } from '../legal/legalText.ts';

export interface Consent { version: number; at: number; serverReports: boolean }

export const CONSENT_KEY = 'sahrae.consent.v1';
export const CONSENT_CHANGE = 'sahrae:consent';
export const OPEN_LEGAL = 'sahrae:legal';

export function loadConsent(): Consent | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null') as Consent | null;
    return c && typeof c.serverReports === 'boolean' && typeof c.version === 'number' ? c : null;
  } catch { return null; }
}

/** True when the viewer has answered for the current version of the legal pages. */
export function consentDecided(c = loadConsent()): boolean {
  return !!c && c.version >= LEGAL_VERSION;
}

export function saveConsent(serverReports: boolean): Consent {
  const c: Consent = { version: LEGAL_VERSION, at: Date.now(), serverReports };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); } catch { /* storage unavailable: applies for this visit */ }
  try { window.dispatchEvent(new Event(CONSENT_CHANGE)); } catch { /* not in a browser */ }
  return c;
}

/** May an anonymous server report be sent? Only with a yes on record. */
export function mayShareReports(): boolean {
  return !!loadConsent()?.serverReports;
}

/** Open the Legal centre on a page ('terms', 'privacy', 'cookies', 'copyright'). */
export function openLegal(page: 'terms' | 'privacy' | 'cookies' | 'copyright' = 'terms'): void {
  try { window.dispatchEvent(new CustomEvent(OPEN_LEGAL, { detail: page })); } catch { /* not in a browser */ }
}
