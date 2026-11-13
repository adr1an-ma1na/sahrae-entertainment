/**
 * Which movie servers work on this device and network, learned from what
 * actually happens here, and which one to open first.
 *
 * A provider can be up for one network and blocked for another: VidFast played
 * from GitHub's servers while it never started from a home connection in
 * Kenya, so a fixed order cannot be right for everyone (owner, 2026-11-13:
 * "open each title on the server that plays here").
 *
 * What counts as "it played here":
 *  - the player reporting real playback (isPlaybackEvidence), or, in the
 *    Android apps, the stream seen flowing (MainActivity);
 *  - the viewer staying on it (DWELL_MS) without switching away: the only
 *    signal a website has for the many players that report nothing;
 *  - the viewer saying so ("It's playing").
 * What counts as "it failed here":
 *  - no sign of playback in time, and the switch made (automatically, or by
 *    the viewer from the prompt);
 *  - the viewer switching away soon after it loaded (QUICK_ABANDON_MS) with
 *    no sign it played.
 * A failure keeps a server from being the first choice for a while, longer
 * each time it fails again, and a success forgives it.
 */

const KEY = 'sahrae.serverHealth.v1';
/** How long a server that failed once is passed over as the starting server. It is still tried as a fallback. */
export const DOWN_FOR_MS = 6 * 60 * 60 * 1000;
/** The longest a server keeps failing its way down: three days. */
export const MAX_DOWN_MS = 3 * 24 * 60 * 60 * 1000;
/** How long "it played here" counts. */
export const GOOD_FOR_MS = 14 * 24 * 60 * 60 * 1000;
/** Watching this long on a server, without leaving it, means it plays here. */
export const DWELL_MS = 90 * 1000;
/** Leaving a server this soon after it loaded, with no sign it played, means it did not. */
export const QUICK_ABANDON_MS = 60 * 1000;

/**
 * How long a server gets to show it has the film before the viewer is offered
 * a switch. Working servers show it within a few seconds (VidLink fetched its
 * stream and showed the running time within ~20 s on a 3 GB emulator).
 */
export const NO_START_LIMIT_MS = 20000;
/** The visible countdown before switching, so a viewer about to press play can stop it. */
export const COUNTDOWN_S = 5;

// What a player reports once it actually has media, playing or paused.
const MEDIA_EVENTS = new Set([
  'play', 'playing', 'pause', 'timeupdate', 'seeked', 'seeking', 'ended',
  'loadedmetadata', 'loadeddata', 'canplay', 'durationchange', 'progress',
]);

/**
 * Does a message from a player prove it has the film? Only real media events
 * do. Measured 2026-10-01: VidFast sent empty MEDIA_DATA while refusing to play
 * ("Please Disable Sandbox"), Videasy sent MEDIA_DATA naming the film while
 * showing "Iframe Sandbox Detected", SmashyStream sends PLAYER_EVENT
 * "scraping_progress" while still searching, and VidSrc.me sends PLAYER_EVENT
 * with only player_info. None of those is playback.
 */
export function isPlaybackEvidence(data: unknown): boolean {
  let o: unknown = data;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch { return false; }
  }
  if (!o || typeof o !== 'object') return false;
  const m = o as { type?: unknown; event?: unknown; data?: { event?: unknown } };
  if (m.type !== 'PLAYER_EVENT') return false;
  const ev = (m.data && m.data.event) ?? m.event;
  return typeof ev === 'string' && MEDIA_EVENTS.has(ev);
}

/**
 * Per server: when it last played here, when it last failed, how many times
 * in a row it has failed, and whether it has ever reported its playback here
 * (a player that does is expected to; one that never has cannot be judged by
 * silence).
 */
type Entry = { ok?: number; down?: number; fails?: number; spoke?: boolean };
type Health = Record<string, Entry>;

const read = (): Health => {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
};
const write = (h: Health) => {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* storage full or blocked: health is a nicety */ }
};

/** It played here. `spoke`: the player itself reported it. */
export function markWorking(id: string, now = Date.now(), spoke = false): void {
  const h = read();
  const was = h[id] || {};
  h[id] = { ok: now, fails: 0, spoke: spoke || was.spoke || undefined };
  write(h);
}

/** It failed here. */
export function markDown(id: string, now = Date.now()): void {
  const h = read();
  const was = h[id] || {};
  h[id] = { ...was, down: now, fails: Math.min(20, (was.fails || 0) + 1) };
  write(h);
}

/** 6 hours after one failure, twice that after the next, up to three days. */
export function downFor(fails: number): number {
  return Math.min(MAX_DOWN_MS, DOWN_FOR_MS * 2 ** Math.max(0, (fails || 1) - 1));
}

export function isRecentlyDown(id: string, now = Date.now(), h: Health = read()): boolean {
  const e = h[id];
  if (!e?.down) return false;
  if (e.ok && e.ok > e.down) return false;
  return now - e.down < downFor(e.fails || 1);
}

/** Played here lately, and has not failed since. */
export function workedHere(id: string, now = Date.now(), h: Health = read()): boolean {
  const e = h[id];
  return !!e?.ok && now - e.ok < GOOD_FOR_MS && !isRecentlyDown(id, now, h);
}

/** Has this server's player ever reported its own playback on this device? */
export function speaks(id: string, h: Health = read()): boolean {
  return h[id]?.spoke === true;
}

/** The servers that played here lately, in the list's order (best first). */
export function provenHere(ids: string[], now = Date.now()): string[] {
  const h = read();
  return ids.filter((id) => workedHere(id, now, h));
}

/**
 * The server to open first: the first in the list's order (the clearest
 * picture first) that has played on this device lately; else the first that
 * has not just failed here; else the first. A title being resumed still opens
 * on its own server (PlayerModal, resume.ts).
 */
export function startServer(ids: string[], now = Date.now()): number {
  const h = read();
  const proven = ids.findIndex((id) => workedHere(id, now, h));
  if (proven >= 0) return proven;
  const firstUp = ids.findIndex((id) => !isRecentlyDown(id, now, h));
  return firstUp >= 0 ? firstUp : 0;
}

/** The next server after `from` not yet failed for this title, or null when all have been tried. */
export function nextServer(ids: string[], from: number, failed: ReadonlySet<string>): number | null {
  for (let k = 1; k < ids.length; k++) {
    const i = (from + k) % ids.length;
    if (!failed.has(ids[i])) return i;
  }
  return null;
}
