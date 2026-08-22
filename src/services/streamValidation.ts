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
export async function resolveEmbedToStream(embed: string, cfg: StreamConfig = DEFAULT_CONFIG): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.validationTimeoutMs * 2);
    const r = await fetch(`https://localhost/__embed2m3u8?u=${encodeURIComponent(embed)}`, {
      cache: 'no-store', signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.m3u8 === 'string' && j.m3u8 ? j.m3u8 : null;
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
  // A server that is still just an embed page has to be resolved first.
  if (!target && s.embed) {
    const resolved = await resolveEmbedToStream(s.embed, cfg);
    if (!resolved) {
      metrics.validationsFailed++;
      note('RESOLVE_FAILED');
      recordSourceResult(s.source, false);
      return applyScore(markFailure(s, 'RESOLVE_FAILED', cfg, now));
    }
    target = resolved;
  }

  if (!target) {
    metrics.validationsFailed++;
    note('UNKNOWN');
    return applyScore(markFailure(s, 'UNKNOWN', cfg, now));
  }

  const verdict = await validateHls(target, cfg, s.embed);

  if (verdict.indeterminate) {
    // Environment could not reach a verdict. Record the URL so it can still be
    // offered, but never dressed up as verified.
    metrics.validationsIndeterminate++;
    return applyScore({ ...markUnverified(s, now), url: target });
  }

  if (verdict.ok) {
    metrics.validationsOk++;
    metrics.totalLatencyMs += verdict.latencyMs;
    recordSourceResult(s.source, true);
    return applyScore({ ...markSuccess(s, verdict.latencyMs, cfg, now, verdict.quality), url: target });
  }

  metrics.validationsFailed++;
  note(verdict.failure || 'UNKNOWN');
  recordSourceResult(s.source, false);
  return applyScore({ ...markFailure(s, verdict.failure || 'UNKNOWN', cfg, now), url: target });
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
      label: `Server ${i + 1}`,
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
