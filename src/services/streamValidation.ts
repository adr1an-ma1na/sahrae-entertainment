import { Capacitor } from '@capacitor/core';
import {
  analyseManifest, DEFAULT_CONFIG, hostOf, mapWithLimit, markFailure, markSuccess,
  markUnverified, needsCheck, reliabilityOf, scoreStream,
  type FailureReason, type SourceStats, type Stream, type StreamConfig, type ValidationResult,
  type Metrics, emptyMetrics,
} from './sportsStreams';

/**
 * The I/O half of the reliability engine: it actually reaches out and checks
 * whether a stream can deliver media, then feeds the result back into the pure
 * scoring/ranking logic in sportsStreams.ts.
 *
 * PLATFORM HONESTY. On Android, requests go through the native same-origin
 * proxy, so a manifest read is a real read and a verdict is a real verdict. In
 * the browser, most stream hosts send no CORS headers and the fetch is refused
 * before we see a byte — that is indistinguishable from a network error at the
 * JS level, so we report `unverified` rather than inventing a health claim.
 * §23 exists precisely to forbid the alternative.
 */

const nativeProxy = (url: string, referer?: string) =>
  Capacitor.isNativePlatform()
    ? `https://localhost/__hlsproxy?u=${encodeURIComponent(url)}${referer ? `&r=${encodeURIComponent(referer)}` : ''}`
    : url;

export const canValidateDeeply = () => Capacitor.isNativePlatform();

const RELIABILITY_KEY = 'sahrae.sports.sourceStats.v1';

export function loadSourceStats(): Record<string, SourceStats> {
  try {
    return JSON.parse(localStorage.getItem(RELIABILITY_KEY) || '{}');
  } catch {
    return {};
  }
}

export function recordSourceResult(host: string, success: boolean) {
  try {
    const stats = loadSourceStats();
    const s = stats[host] || { ok: 0, fail: 0 };
    if (success) s.ok++; else s.fail++;
    // Decay so a source can climb back out of a bad night rather than being
    // condemned by ancient history.
    if (s.ok + s.fail > 200) { s.ok = Math.round(s.ok / 2); s.fail = Math.round(s.fail / 2); }
    stats[host] = s;
    localStorage.setItem(RELIABILITY_KEY, JSON.stringify(stats));
  } catch { /* stats are advisory; never break playback over them */ }
}

export const metrics: Metrics = emptyMetrics();

function note(reason: FailureReason) {
  metrics.byReason[reason] = (metrics.byReason[reason] || 0) + 1;
}

/**
 * Fetch a manifest and decide whether it can actually play.
 *
 * Deliberately more than a status check: the body is parsed, master playlists
 * are followed one level to confirm the variant really carries segments, and an
 * HTML error page returned with 200 is treated as the failure it is.
 */
export async function validateHls(
  url: string,
  cfg: StreamConfig = DEFAULT_CONFIG,
  referer?: string,
): Promise<ValidationResult> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.validationTimeoutMs);
  try {
    const res = await fetch(nativeProxy(url, referer), { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) return { ok: false, latencyMs, failure: 'HTTP_ERROR' };

    const body = await res.text();
    const verdict = analyseManifest(body, res.headers.get('content-type') || undefined);
    verdict.latencyMs = latencyMs;
    if (!verdict.ok) return verdict;

    // A master playlist proves nothing on its own — follow one variant and make
    // sure media is genuinely reachable behind it.
    if ((verdict.segments ?? 0) === 0) {
      const variant = firstVariantUrl(body, url);
      if (variant) {
        try {
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), cfg.validationTimeoutMs);
          const r2 = await fetch(nativeProxy(variant, referer), { cache: 'no-store', signal: c2.signal });
          clearTimeout(t2);
          if (r2.ok) {
            const v2 = analyseManifest(await r2.text(), r2.headers.get('content-type') || undefined);
            if (!v2.ok) return { ...v2, latencyMs: Date.now() - started, quality: verdict.quality };
          }
        } catch {
          // Variant unreadable (often CORS on web). The master was valid, so
          // report success but without claiming we saw segments.
        }
      }
    }
    return { ...verdict, latencyMs: Date.now() - started };
  } catch (e: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    if (e?.name === 'AbortError') return { ok: false, latencyMs, failure: 'TIMEOUT' };
    // In a browser a blocked cross-origin read throws a bare TypeError that is
    // indistinguishable from a network drop. On web we must not call that a
    // failure of the stream, so it becomes "indeterminate".
    if (!canValidateDeeply()) return { ok: false, latencyMs, indeterminate: true, failure: 'CORS_BLOCKED' };
    return { ok: false, latencyMs, failure: 'NETWORK' };
  }
}

/** Absolute URL of the first variant listed in a master playlist. */
function firstVariantUrl(body: string, baseUrl: string): string | null {
  const lines = body.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const cand = lines[j];
      if (!cand || cand.startsWith('#')) continue;
      try { return new URL(cand, baseUrl).toString(); } catch { return null; }
    }
  }
  return null;
}

/** Resolve a sports embed page to a playable m3u8 (Android only). */
/** Referer each resolved playlist was requested with, as the app reported it. */
export const resolvedReferer = new Map<string, string>();

export async function resolveEmbedToStream(embed: string, cfg: StreamConfig = DEFAULT_CONFIG): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  // The app answers at once ({pending} while its hidden page looks; an older
  // build ignores async=1 and answers when done) and is asked again each second.
  const deadline = Date.now() + Math.max(cfg.validationTimeoutMs * 2, 16000);
  try {
    while (Date.now() < deadline) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.max(1000, deadline - Date.now()));
      const r = await fetch(`https://localhost/__embed2m3u8?async=1&u=${encodeURIComponent(embed)}`, {
        cache: 'no-store', signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      const j = await r.json();
      if (j && j.pending) { await new Promise((res) => setTimeout(res, 1000)); continue; }
      if (j && typeof j.m3u8 === 'string' && j.m3u8) {
        if (typeof j.referer === 'string' && j.referer) resolvedReferer.set(j.m3u8, j.referer);
        return j.m3u8;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate one stream and return its updated health. Pure-ish: it does the I/O,
 * then hands the outcome to the scoring functions rather than deciding health
 * inline, so the rules stay in one testable place.
 */
export async function validateStream(s: Stream, cfg: StreamConfig = DEFAULT_CONFIG): Promise<Stream> {
  metrics.validations++;
  const now = Date.now();

  let target = s.url;
  // A server that is still just an embed page: try to pull a direct manifest out
  // of it so the native player can take over and we can really validate it.
  // Sports feeds play in their provider's own page: Sahrae does not pull the
  // stream out of it (2026-10-27). Offered as the page, unverified.
  if (!target && s.embed && s.kind === 'server') {
    metrics.validationsIndeterminate++;
    return applyScore({ ...markUnverified(s, now), url: s.embed });
  }
  if (!target && s.embed) {
    const resolved = await resolveEmbedToStream(s.embed, cfg);
    if (resolved) {
      target = resolved;
    } else {
      // No manifest — either we are in a browser (the resolver is native-only)
      // or the resolver could not extract one. THE EMBED PAGE ITSELF STILL
      // PLAYS: it is a player page loaded in an iframe, which is exactly how
      // this worked before the engine landed. Offer it, marked unverified,
      // rather than calling a perfectly good source dead.
      //
      // Getting this wrong left every web user staring at "Loading…" forever,
      // because a server with no `url` renders neither the HLS player nor the
      // iframe.
      metrics.validationsIndeterminate++;
      return applyScore({ ...markUnverified(s, now), url: s.embed });
    }
  }

  if (!target) {
    metrics.validationsFailed++;
    note('UNKNOWN');
    return applyScore(markFailure(s, 'UNKNOWN', cfg, now));
  }

  // The playable target IS the embed page (web, or a native resolve that could
  // not extract a manifest). An embed page is HTML by definition, so fetching
  // it here would parse a player page as a playlist, classify it
  // HTML_ERROR_PAGE, and mark a perfectly good feed as failing — which is
  // precisely what turned working streams into "Reachable but slow" on every
  // background re-check. There is nothing to validate; report it honestly as
  // unverified and leave it playable.
  if (s.embed && target === s.embed) {
    metrics.validationsIndeterminate++;
    return applyScore({ ...markUnverified(s, now), url: s.embed });
  }

  // The relay must send what the feed page's player sent: usually just the
  // site, not the full page address (which the stream server answers 404 to).
  const referer = resolvedReferer.get(target) || s.referer || s.embed;
  const verdict = await validateHls(target, cfg, referer);

  if (verdict.indeterminate) {
    // Environment could not reach a verdict. Record the URL so it can still be
    // offered, but never dressed up as verified.
    metrics.validationsIndeterminate++;
    return applyScore({ ...markUnverified(s, now), url: target, referer });
  }

  if (verdict.ok) {
    metrics.validationsOk++;
    metrics.totalLatencyMs += verdict.latencyMs;
    recordSourceResult(s.source, true);
    return applyScore({ ...markSuccess(s, verdict.latencyMs, cfg, now, verdict.quality), url: target, referer });
  }

  metrics.validationsFailed++;
  note(verdict.failure || 'UNKNOWN');
  recordSourceResult(s.source, false);
  // The feed page gave up a playlist that cannot be played from outside its
  // own player (on the emulators every Streamed playlist answered 404 to the
  // relay, whatever the referer, 2026-10-26). The page itself still plays:
  // offer it, as films fall back to their server's page. The app's native
  // shield keeps its pop-ups out.
  if (s.embed && s.kind === 'server') {
    metrics.validationsIndeterminate++;
    return applyScore({ ...markUnverified(s, now), url: s.embed });
  }
  return applyScore({ ...markFailure(s, verdict.failure || 'UNKNOWN', cfg, now), url: target, referer });
}

function applyScore(s: Stream): Stream {
  const stats = loadSourceStats()[s.source];
  return { ...s, healthScore: scoreStream(s, reliabilityOf(stats)) };
}

/**
 * Validate a whole event's streams in parallel, bounded (§8, §14). Streams whose
 * health is still fresh are skipped so a re-open is instant rather than
 * re-probing everything.
 */
export async function validateAll(
  streams: Stream[],
  cfg: StreamConfig = DEFAULT_CONFIG,
  onProgress?: (s: Stream) => void,
): Promise<Stream[]> {
  const now = Date.now();
  return mapWithLimit(streams, cfg.validationConcurrency, async (s) => {
    if (!needsCheck(s, cfg, now)) return s;
    const updated = await validateStream(s, cfg);
    onProgress?.(updated);
    return updated;
  });
}

/** Build the stream objects for an event from what the feed actually published. */
export function buildStreams(
  eventId: string,
  embeds: string[],
  channels: { name: string; url: string }[],
): Stream[] {
  const out: Stream[] = [];
  embeds.forEach((embed, i) => {
    out.push({
      id: `srv-${i}`,
      eventId,
      source: hostOf(embed),
      embed,
      kind: 'server',
      type: 'hls',
      label: `Feed ${i + 1}`,
      status: 'unknown',
      healthScore: 50,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    });
  });
  channels.forEach((ch, i) => {
    out.push({
      id: `ch-${i}`,
      eventId,
      source: hostOf(ch.url),
      url: ch.url,
      kind: 'channel',
      type: 'hls',
      label: ch.name,
      status: 'unknown',
      healthScore: 50,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    });
  });
  return out;
}
