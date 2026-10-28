/**
 * Where to pick a title up again: its server, and the second, when it is the
 * same episode and worth resuming. Pure, so it is testable alone
 * (library-check.mjs); the player and Continue watching both use it.
 */
export interface ResumeSource {
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  server?: string;
  position?: number;
  duration?: number;
}

export function resumePoint(p: ResumeSource | undefined, season?: number, episode?: number): { server?: string; at: number } {
  if (!p) return { at: 0 };
  const sameEpisode = p.mediaType === 'movie' || ((p.season || 1) === (season || 1) && (p.episode || 1) === (episode || 1));
  const pos = p.position || 0;
  const len = p.duration || 0;
  // Not the first half-minute, and not the closing credits.
  const worth = sameEpisode && pos > 30 && (!len || pos < len - 90);
  return { server: p.server, at: worth ? Math.floor(pos) : 0 };
}

/** "41 min left", "1h 5m left": what Continue watching shows under a title. */
export function timeLeft(position?: number, duration?: number): string | null {
  if (!position || !duration || duration <= position) return null;
  const m = Math.max(1, Math.round((duration - position) / 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m} min left`;
}

/** Servers whose own player opens at a given second when asked (?startAt=, seconds; their docs, 2026-10-28). */
export const START_AT_SERVERS = ['vidlink', 'vidfast'];

/** The server's address with the second to start from, where that server takes one. */
export function withStartAt(url: string, serverId: string, at: number): string {
  if (!at || !START_AT_SERVERS.includes(serverId)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}startAt=${Math.floor(at)}`;
}
