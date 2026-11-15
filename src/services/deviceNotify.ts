/**
 * A notification on the device itself, outside the app (owner, 2026-11-15:
 * "the user gets it on their devices").
 *
 *   Android phone app   Scheduled with the system through Capacitor's
 *                       local-notifications plugin, so a match the app knew
 *                       about yesterday is announced with the app closed.
 *                       Sahrae has no server pushing to phones: what it can
 *                       announce is what it learned the last time it was open,
 *                       which reaches about two days ahead.
 *   Website             The browser's own notifications, while a Sahrae tab
 *                       is open. A website with no push server cannot speak
 *                       once it is closed.
 *   Android TV          Nothing: a TV has no notification shade for apps.
 *                       The bell in Settings still fills.
 *
 * Off until the viewer turns it on (Settings); the system's permission
 * question is only asked then.
 */
import { Capacitor } from '@capacitor/core';
import { deviceId, type Note } from './notifyCore';

const PREF_KEY = 'sahrae.notif.device.v1';
const CHANNEL = 'sahrae-updates';
export const OPEN_EVENT = 'sahrae:notif-open';

const isTv = () => { try { return (import.meta.env?.VITE_TARGET as string) === 'tv'; } catch { return false; } };
const native = () => { try { return Capacitor.isNativePlatform() && !isTv(); } catch { return false; } };
const webCapable = () => typeof window !== 'undefined' && 'Notification' in window;

/** Can this device show notifications outside the app at all? */
export function deviceCanNotify(): boolean { return native() || (!isTv() && webCapable()); }

export function deviceNotifyOn(): boolean {
  try { return localStorage.getItem(PREF_KEY) === 'on'; } catch { return false; }
}

type Plugin = typeof import('@capacitor/local-notifications').LocalNotifications;
let pluginPromise: Promise<Plugin | null> | null = null;
function plugin(): Promise<Plugin | null> {
  if (!native()) return Promise.resolve(null);
  pluginPromise ??= import('@capacitor/local-notifications').then((m) => m.LocalNotifications).catch(() => null);
  return pluginPromise;
}

let listening = false;
async function listen(p: Plugin) {
  if (listening) return;
  listening = true;
  try {
    await p.createChannel({ id: CHANNEL, name: 'Matches and new episodes', description: 'Teams and series you watch', importance: 4, visibility: 1 });
    // Tapped: open the match or the title it was about.
    await p.addListener('localNotificationActionPerformed', (a) => {
      const extra = a.notification?.extra;
      if (extra) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: extra }));
    });
  } catch { /* an older system without channels still shows them */ }
}

/** Ask the system, and remember the answer. Returns whether notifications are now on. */
export async function turnDeviceNotifyOn(): Promise<boolean> {
  let ok = false;
  try {
    const p = await plugin();
    if (p) {
      const cur = await p.checkPermissions();
      ok = cur.display === 'granted' || (await p.requestPermissions()).display === 'granted';
      if (ok) await listen(p);
    } else if (webCapable() && !isTv()) {
      ok = Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
    }
  } catch { ok = false; }
  try { localStorage.setItem(PREF_KEY, ok ? 'on' : 'off'); } catch { /* this session only */ }
  return ok;
}

export async function turnDeviceNotifyOff(): Promise<void> {
  try { localStorage.setItem(PREF_KEY, 'off'); } catch { /* ignore */ }
  webTimers.forEach((t) => window.clearTimeout(t));
  webTimers.clear();
  try {
    const p = await plugin();
    if (!p) return;
    const pending = await p.getPending();
    if (pending.notifications.length) await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  } catch { /* nothing was scheduled */ }
}

// What this device has already announced (or been given to announce), by note
// id and time: a match scheduled yesterday and shown by the system must not be
// announced again when the app next opens and finds it due.
const GIVEN_KEY = 'sahrae.notif.given.v1';
function given(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(GIVEN_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveGiven(map: Record<string, number>, now: number) {
  const keep = Object.fromEntries(Object.entries(map).filter(([, at]) => now - at < 14 * 86_400_000));
  try { localStorage.setItem(GIVEN_KEY, JSON.stringify(keep)); } catch { /* this session only */ }
}

const extraOf = (n: Note) => ({ id: n.id, kind: n.kind, mediaId: n.mediaId, mediaType: n.mediaType, eventId: n.eventId });
const webTimers = new Map<string, number>();
const webShown = new Set<string>();

async function showOnWeb(n: Note) {
  if (webShown.has(n.id) || Notification.permission !== 'granted') return;
  webShown.add(n.id);
  { const g = given(); g[n.id] = Date.now(); saveGiven(g, Date.now()); }
  const open = () => { window.focus(); window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: extraOf(n) })); };
  const icon = `${import.meta.env.BASE_URL || '/'}pwa-icon.svg`;
  try {
    const note = new Notification(n.title, { body: n.message, tag: n.id, icon });
    note.onclick = open;
  } catch {
    // Android Chrome only shows them through the service worker.
    try { (await navigator.serviceWorker?.ready)?.showNotification(n.title, { body: n.message, tag: n.id, icon }); } catch { /* not this browser */ }
  }
}

/**
 * Hand the device everything worth announcing: `due` right now, `later` at
 * their times. Called on every check, so it replaces what was scheduled before
 * (a postponed match moves, a muted team goes).
 */
export async function deliverToDevice(due: Note[], later: Note[], now = Date.now()): Promise<void> {
  if (!deviceNotifyOn() || !deviceCanNotify()) return;
  const g = given();
  due = due.filter((n) => !(g[n.id] <= now));
  try {
    const p = await plugin();
    if (p) {
      if ((await p.checkPermissions()).display !== 'granted') return;
      await listen(p);
      const pending = await p.getPending();
      if (pending.notifications.length) await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      const make = (n: Note, at?: number) => ({
        id: deviceId(n.id), title: n.title, body: n.message, channelId: CHANNEL, smallIcon: 'ic_stat_sahrae',
        extra: extraOf(n), ...(at ? { schedule: { at: new Date(at), allowWhileIdle: true } } : {}),
      });
      const timed = later.filter((n) => n.at && n.at > now).slice(0, 24);
      const list = [...due.map((n) => make(n)), ...timed.map((n) => make(n, n.at))];
      if (list.length) await p.schedule({ notifications: list });
      // The system has them now: remembered by the time each will show.
      for (const k of Object.keys(g)) if (g[k] > now) delete g[k];
      for (const n of due) g[n.id] = now;
      for (const n of timed) g[n.id] = n.at as number;
      saveGiven(g, now);
      return;
    }
    if (!webCapable() || Notification.permission !== 'granted') return;
    for (const n of due) void showOnWeb(n);
    webTimers.forEach((t) => window.clearTimeout(t));
    webTimers.clear();
    for (const n of later) {
      const wait = (n.at || 0) - now;
      // Timers this long do not survive a sleeping laptop; the next check reschedules.
      if (wait > 0 && wait < 12 * 3_600_000) webTimers.set(n.id, window.setTimeout(() => void showOnWeb(n), wait));
    }
  } catch { /* the bell in the app still has them */ }
}
