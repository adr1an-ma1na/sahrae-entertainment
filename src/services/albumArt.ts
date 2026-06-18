/**
 * HD album-art resolver.
 *
 * YouTube/Piped thumbnails are often low-res (mq/hqdefault ≈ 320–480px), which
 * looks soft blown up on a phone's now-playing screen. For a high-end feel we
 * fetch the REAL cover from Apple's iTunes Search API (key-less, CORS-enabled)
 * and request it at 1000×1000. Results are cached per track id; failures fall
 * back to the YouTube artwork the caller already has.
 */

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

// Strip "(Official Video)", "[Lyrics]", "feat. …" noise so the search matches.
function clean(s: string): string {
  return (s || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(official\s*(music\s*)?video|official\s*audio|lyric\s*video|lyrics?|visuali[sz]er|audio|hd|4k|mv)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function hdArtwork(trackId: string, artist: string, title: string): Promise<string | null> {
  if (cache.has(trackId)) return cache.get(trackId) ?? null;
  if (pending.has(trackId)) return pending.get(trackId)!;

  const term = `${clean(artist)} ${clean(title)}`.trim() || `${artist} ${title}`.trim();
  const p = (async (): Promise<string | null> => {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      // iTunes sends NO CORS header, so a direct WebView fetch is silently
      // blocked (this is why covers stayed blurry). Route it through the native
      // passthrough, which fetches server-side and re-serves with ACAO:*.
      const itunes = `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${encodeURIComponent(term)}`;
      const r = await fetch(`https://localhost/__ddfetch?u=${encodeURIComponent(itunes)}`, { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) { cache.set(trackId, null); return null; }
      const j = await r.json();
      const art: string | undefined = j?.results?.[0]?.artworkUrl100 || j?.results?.[0]?.artworkUrl60;
      if (!art) { cache.set(trackId, null); return null; }
      // iTunes serves arbitrary sizes: 100x100bb.jpg → 1000x1000bb.jpg
      const hd = art.replace(/\/\d+x\d+bb\.(jpg|png)/, '/1000x1000bb.$1');
      cache.set(trackId, hd);
      return hd;
    } catch {
      cache.set(trackId, null);
      return null;
    } finally {
      pending.delete(trackId);
    }
  })();
  pending.set(trackId, p);
  return p;
}
