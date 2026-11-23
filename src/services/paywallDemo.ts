import { Capacitor } from '@capacitor/core';

/**
 * A demonstration of Sahrae's paid plans, for the team (owner, 2026-11-23: "make a dummy
 * paywall, only on the web"). It takes no payment and keeps no personal details.
 *
 * Website only, and off unless switched on: open the site with ?plans=demo (it stays on in
 * that browser until ?plans=off). Then Play shows the plan sheet first; choosing a plan
 * "unlocks" playback for this browser tab only, so a reload shows the sheet again.
 *
 * The tiers and prices are the pricing proposal's (Sahrae Plans Kenya, November 2026),
 * which prices a licensed catalogue. Pure apart from storage; tested in plans-check.mjs.
 */
export interface Tier {
  id: 'day' | 'week' | 'mobile' | 'plus' | 'family';
  name: string;
  /** KSh, VAT included. */
  price: number;
  per: string;
  /** How long one payment lasts. */
  hours: number;
  points: string[];
  main?: boolean;
}

export const TIERS: Tier[] = [
  { id: 'day', name: 'Day Pass', price: 20, per: '24 hours', hours: 24, points: ['Every film and series, no adverts', 'One phone'] },
  { id: 'week', name: 'Week Pass', price: 60, per: '7 days', hours: 24 * 7, points: ['Every film and series, no adverts', 'One phone'] },
  { id: 'mobile', name: 'Mobile', price: 150, per: 'month', hours: 24 * 30, points: ['One phone, 720p', 'Downloads'] },
  { id: 'plus', name: 'Plus', price: 350, per: 'month', hours: 24 * 30, points: ['Phone and TV, up to 4K', 'Two screens at once', 'Downloads'], main: true },
  { id: 'family', name: 'Family', price: 550, per: 'month', hours: 24 * 30, points: ['Four profiles, kids\' profiles', 'Watch together', 'Up to 4K'] },
];

const ON_KEY = 'sahrae.plansDemo.v1';
const PASS_KEY = 'sahrae.plansDemo.pass.v1';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const safe = (get: () => Storage): Store | null => { try { return get(); } catch { return null; } };

/** What ?plans= asks for, if anything. */
export function planParam(search: string): 'demo' | 'off' | null {
  const v = new URLSearchParams(search).get('plans');
  return v === 'demo' ? 'demo' : v === 'off' ? 'off' : null;
}

/** Is the demo on? Never in the Android apps; on the website only once switched on. */
export function demoOn(native: boolean, search: string, store: Store | null): boolean {
  if (native) return false;
  const asked = planParam(search);
  if (!store) return asked === 'demo';
  try {
    if (asked === 'demo') store?.setItem(ON_KEY, '1');
    if (asked === 'off') { store?.removeItem(ON_KEY); return false; }
    return store?.getItem(ON_KEY) === '1';
  } catch { return asked === 'demo'; }
}

/** A pass that has not run out, in this tab. */
export function passValid(store: Store | null, now = Date.now()): boolean {
  try {
    const p = JSON.parse(store?.getItem(PASS_KEY) || 'null') as { tier: string; until: number } | null;
    return !!p && typeof p.until === 'number' && p.until > now;
  } catch { return false; }
}

export function passFor(tier: Tier, now = Date.now()): { tier: string; until: number } {
  return { tier: tier.id, until: now + tier.hours * 3600_000 };
}

const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

export const plansDemoOn = () => demoOn(native(), typeof location === 'undefined' ? '' : location.search, safe(() => localStorage));
export const hasDemoPass = () => passValid(safe(() => sessionStorage));
export function grantDemoPass(tier: Tier): void {
  try { sessionStorage.setItem(PASS_KEY, JSON.stringify(passFor(tier))); } catch { /* this film only */ }
}
