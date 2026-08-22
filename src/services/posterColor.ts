/**
 * Dominant colour of a poster, for tinting detail headers.
 *
 * The music player already tints itself from `track.dominantColor`, but that
 * value is a HASH of the track id — a stable pseudo-colour, not the artwork's.
 * For film and series art we can do the real thing: image.tmdb.org serves
 * `Access-Control-Allow-Origin: *` (verified), so the pixels are readable from a
 * canvas and the header can genuinely take its colour from the poster.
 *
 * Deliberately cheap: one 32x32 downscale, a coarse colour histogram, and a
 * bias against the near-black/near-white pixels that dominate letterboxed art
 * without saying anything about the film. Results are cached per URL, and every
 * failure path returns null so a caller simply keeps its default styling.
 */

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

/** How aggressively colours are bucketed when counting (lower = finer). */
const BUCKET = 24;

function isUninformative(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Near-black or near-white: common in posters and carries no identity.
  if (max < 32 || min > 226) return true;
  // Near-grey: saturation too low to read as a colour on screen.
  return max - min < 18;
}

/** Push a colour to a usable backdrop: keep the hue, control light and depth. */
function toBackdrop(r: number, g: number, b: number): string {
  // Convert to HSL so lightness/saturation can be constrained without shifting hue.
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  // Rich but never garish, and dark enough that white text stays legible.
  const sat = Math.min(0.72, Math.max(0.32, s));
  const light = Math.min(0.34, Math.max(0.18, l));
  return `hsl(${Math.round(h * 360)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%)`;
}

export function cachedPosterColor(url: string | null | undefined): string | null {
  if (!url) return null;
  return cache.get(url) ?? null;
}

/**
 * Resolve the dominant colour of an image. Returns null when the image cannot
 * be read (offline, blocked, decode failure) — callers keep their default.
 */
export function posterColor(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof document === 'undefined') return Promise.resolve(null);
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  const running = inflight.get(url);
  if (running) return running;

  const job = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      cache.set(url, v);
      inflight.delete(url);
      resolve(v);
    };
    // Never let a hung image hold a header in its placeholder state.
    const timer = setTimeout(() => done(null), 6000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return done(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue; // skip transparent
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (isUninformative(r, g, b)) continue;
          const key = `${Math.round(r / BUCKET)},${Math.round(g / BUCKET)},${Math.round(b / BUCKET)}`;
          const hit = counts.get(key);
          if (hit) { hit.n++; hit.r += r; hit.g += g; hit.b += b; }
          else counts.set(key, { n: 1, r, g, b });
        }
        if (!counts.size) return done(null);

        let best = { n: 0, r: 0, g: 0, b: 0 };
        for (const c of counts.values()) if (c.n > best.n) best = c;
        done(toBackdrop(best.r / best.n, best.g / best.n, best.b / best.n));
      } catch {
        // Tainted canvas or a decode failure — fall back to default styling.
        done(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = url;
  });

  inflight.set(url, job);
  return job;
}
