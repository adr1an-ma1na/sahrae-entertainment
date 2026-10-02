/**
 * Which movie servers work on this device and network, remembered across plays,
 * and which one to try next when the current one does not start.
 *
 * A provider can be up for one network and blocked for another: VidFast played
 * from GitHub's servers while it never started from a home connection in Kenya,
 * so a fixed order cannot be right for everyone. Starting from the server that
 * last worked here adapts per device without guessing.
 */

const KEY = 'sahrae.serverHealth.v1';
/** How long a server that failed is skipped as the starting server. It is still tried as a fallback. */
export const DOWN_FOR_MS = 6 * 60 * 60 * 1000;

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

type Health = Record<string, { ok?: number; down?: number }>;

const read = (): Health => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
};
const write = (h: Health) => {
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* storage full or blocked: health is a nicety */ }
};

export function markWorking(id: string, now = Date.now()): void {
  const h = read();
  h[id] = { ok: now };
  write(h);
}

export function markDown(id: string, now = Date.now()): void {
  const h = read();
  h[id] = { ...h[id], down: now };
  write(h);
}

export function isRecentlyDown(id: string, now = Date.now(), h: Health = read()): boolean {
  const down = h[id]?.down;
  return !!down && now - down < DOWN_FOR_MS;
}

/** The server to open first: the one that most recently worked here, else the first not recently down. */
export function startServer(ids: string[], now = Date.now()): number {
  const h = read();
  let best = -1;
  let bestOk = 0;
  ids.forEach((id, i) => {
    const ok = h[id]?.ok || 0;
    if (ok > bestOk && !isRecentlyDown(id, now, h)) { best = i; bestOk = ok; }
  });
  if (best >= 0) return best;
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
