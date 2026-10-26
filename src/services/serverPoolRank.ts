/**
 * Which movie and series servers to offer, and in what order. Pure, so it is
 * testable on its own (serverpool-check.mjs).
 *
 * The pool (src/data/servers.json) lists the servers in the owner's order of
 * preference (since 2026-10-21: VidLink Pro, then Tier 1, 2 and 3). The app
 * offers them in that order, leaving out any the daily check marked down or
 * that keep failing for viewers; when one recovers it returns to its place.
 * score() remains for reference and tests, but no longer reorders the list.
 */

export type PoolServer = {
  id: string;
  name: string;
  movie: string;
  tv: string;
  hosts: string[];
  visual: { maxHeight: number; mbps: number | null; codec: string | null; adaptive: boolean };
  audio: { channels: number; languages: number };
  coverage: number;
  events: boolean;
  status: 'active' | 'reserve' | 'down';
  failStreak?: number;
  checked?: string;
  note?: string;
  /** false: the Android app only (its own web page is not fit to show). */
  web?: boolean;
};

export type Pool = { version: number; updated: string; servers: PoolServer[] };

/** Server-wide results from viewers over the last few days (play_proof, server_health). */
export type ServerHealth = { server_id: string; ok: number; fail: number; last_ok: string | null; last_fail: string | null };

/** At most this many servers are offered; the owner's list is ten. */
export const ACTIVE_COUNT = 12;
/** Bitrate assumed where it could not be measured: modest, so an unmeasured server never outranks a measured one by guesswork. */
export const UNMEASURED_MBPS = 2;

/** H.265 needs about half the bitrate of H.264 for the same picture, AV1 a little less again. */
const CODEC_GAIN: Record<string, number> = { hevc: 2, h265: 2, av1: 2.2, vp9: 1.6 };

/**
 * The ranking, in the order asked for: visual quality outweighs audio, which
 * outweighs reliability. Visual is up to 70 points, audio up to 12,
 * reliability up to 13, so no amount of reliability beats a clearly sharper
 * picture, while two near-equal pictures are decided by sound, then by how
 * dependably the server has the title.
 */
export function score(s: PoolServer, type: 'movie' | 'tv' = 'movie', canHoldHd = true): number {
  const h = Math.min(Math.max(s.visual.maxHeight || 0, 0), 2160);
  const gain = (s.visual.codec && CODEC_GAIN[s.visual.codec.toLowerCase()]) || 1;
  const mbps = (s.visual.mbps ?? UNMEASURED_MBPS) * gain;
  // An adaptive player is a plus where the app can keep it in HD (the Android
  // app's picture floor), and a minus where it cannot: in a browser it may
  // start at 360p on a slow line and stay there, while a fixed 1080p stream
  // never drops.
  const adaptive = s.visual.adaptive ? (canHoldHd ? 5 : -8) : 0;
  const visual = (h / 1080) * 40 + (Math.min(mbps, 8) / 8) * 25 + adaptive;
  const audio = (s.audio.channels >= 6 ? 10 : 6) + (s.audio.languages > 1 ? 2 : 0);
  // A series plays one episode after another only on a server that says when
  // an episode ends, so for series that counts as reliability.
  const reliability = Math.max(0, Math.min(1, s.coverage)) * 10 + (s.events ? 3 : 0) + (type === 'tv' && s.events ? 5 : 0);
  return Math.round((visual + audio + reliability) * 10) / 10;
}

/** Thresholds for "viewers keep failing on it": enough reports to mean something, mostly failures, and no success in a day. */
const CROWD_MIN_FAILS = 8;
const CROWD_MAX_OK_SHARE = 0.25;
const CROWD_RECENT_OK_MS = 24 * 60 * 60 * 1000;

export function crowdFailing(h: ServerHealth | undefined, now = Date.now()): boolean {
  if (!h) return false;
  const total = h.ok + h.fail;
  if (h.fail < CROWD_MIN_FAILS || total === 0) return false;
  if (h.ok / total >= CROWD_MAX_OK_SHARE) return false;
  const lastOk = h.last_ok ? Date.parse(h.last_ok) : 0;
  return !(lastOk && now - lastOk < CROWD_RECENT_OK_MS);
}

/** The servers to show, best first: the top ACTIVE_COUNT that are neither marked down nor failing for viewers. */
/**
 * The servers to offer, in the pool's own order (set by the owner, best
 * first), leaving out any marked down or failing for viewers. A server that
 * comes back takes its old place again. `type` and `canHoldHd` are kept for
 * existing callers; the order is the file's.
 */
export function pickServers(pool: Pool, _type: 'movie' | 'tv', health: ServerHealth[] = [], now = Date.now(), count = ACTIVE_COUNT, _canHoldHd = true): PoolServer[] {
  const byId = new Map(health.map((h) => [h.server_id, h]));
  const usable = pool.servers.filter((s) => s.status !== 'down' && !crowdFailing(byId.get(s.id), now));
  // Never show nothing: if everything is marked down, the marks are more
  // likely wrong than every server at once.
  return (usable.length ? usable : pool.servers).slice(0, count);
}

const HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * A pool from the network is only used if it is well formed and every URL is
 * https on one of that server's own hosts, so a damaged or tampered file can
 * never point the player somewhere else.
 */
export function validPool(x: unknown): x is Pool {
  if (!x || typeof x !== 'object') return false;
  const p = x as Pool;
  if (typeof p.version !== 'number' || !Array.isArray(p.servers) || p.servers.length === 0) return false;
  return p.servers.every((s) => {
    if (!s || typeof s.id !== 'string' || !/^[a-z0-9]{2,20}$/.test(s.id) || typeof s.name !== 'string') return false;
    if (!Array.isArray(s.hosts) || !s.hosts.length || !s.hosts.every((h) => typeof h === 'string' && HOST.test(h))) return false;
    if (!s.visual || typeof s.visual.maxHeight !== 'number' || !s.audio || typeof s.coverage !== 'number') return false;
    if (!['active', 'reserve', 'down'].includes(s.status)) return false;
    return [s.movie, s.tv].every((t) => {
      if (typeof t !== 'string') return false;
      try {
        const u = new URL(fill(t, 1, 1, 1, 'FFFFFF'));
        return u.protocol === 'https:' && s.hosts.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
      } catch { return false; }
    });
  });
}

/** A template with the title filled in. */
export function fill(template: string, id: number, s: number, e: number, brand: string): string {
  return template.replace(/\{id\}/g, String(id)).replace(/\{s\}/g, String(s)).replace(/\{e\}/g, String(e)).replace(/\{brand\}/g, brand);
}

/** What the picker calls a server: its name and the picture it gives. */
export function label(s: PoolServer): string {
  return s.name;
}

/**
 * Is list `a` at least as new as list `b`? By version first, then date. By
 * date alone, two lists made the same day tied, and an old cached or published
 * list could win over a newer one this build carries (2026-10-25: v4 and v5
 * were both dated that day). The daily health check changes the date, not the
 * version, so within one version the later date still wins.
 */
export function notOlder(a: { version?: number; updated: string }, b: { version?: number; updated: string }): boolean {
  const va = a.version ?? 0, vb = b.version ?? 0;
  if (va !== vb) return va > vb;
  return a.updated >= b.updated;
}
