/**
 * Pure parsing helpers for the YouTube connector.
 *
 * Split out from youtube.ts for the same reason sportsStreams.ts is split from
 * streamValidation.ts: youtube.ts pulls in the Firebase SDK at module scope, so
 * anything living beside it can only be exercised inside a browser. These two
 * functions carry the logic most likely to be wrong, so they belong somewhere a
 * test can reach them directly.
 */

/** ISO-8601 duration (PT1H2M10S) → seconds. Returns 0 for anything unparseable
 *  rather than NaN, so a bad value renders as "--:--" instead of poisoning
 *  arithmetic downstream. */
export function parseISODuration(iso: string | undefined): number {
  const m = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(iso || '');
  if (!m) return 0;
  const [, d, h, mi, s] = m;
  return Math.round((Number(d || 0) * 86400) + (Number(h || 0) * 3600) + (Number(mi || 0) * 60) + Number(s || 0));
}

/**
 * Pull a playlist id out of anything a listener is likely to paste: a YouTube or
 * YouTube Music URL, a share link, or the bare id.
 *
 * `list=` is checked first so a URL wins over any id-shaped text elsewhere in
 * the string. A bare id must carry a known playlist prefix, otherwise a random
 * word would be accepted and then 404 confusingly at the API.
 */
export function parsePlaylistId(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const fromUrl = raw.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1];
  if (fromUrl) return fromUrl;
  // YouTube Music prefixes ids with VL in its own URLs; the API wants it bare.
  const bare = raw.replace(/^VL/, '');
  if (/^[A-Za-z0-9_-]{2,}$/.test(bare) && /^(PL|OL|UU|FL|RD|LL|LM)/.test(bare)) return bare;
  return null;
}

/** Deterministic, pleasant per-track colour, used for cover-art backdrops. */
export function dominantColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 58%, 40%)`;
}
