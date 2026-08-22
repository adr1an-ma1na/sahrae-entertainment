/**
 * Sports stream reliability engine.
 *
 * DISCOVER → VALIDATE → SCORE → RANK → SERVE → MONITOR → FAILOVER → RECOVER
 *
 * ─────────────────────────── ARCHITECTURAL LIMITS ───────────────────────────
 * Stated up front because the brief asks for a server-side reliability service
 * and this application does not have a server. Faking the capability would be
 * worse than naming the boundary.
 *
 *  1. NO BACKEND. Sahrae is a static PWA (GitHub Pages) plus a Capacitor
 *     Android shell. There is nowhere to run cross-user background monitoring,
 *     no API to reshape, and no env-var config. Everything here therefore runs
 *     ON THE USER'S DEVICE: validation happens when a screen is open, health is
 *     persisted per device, and source reliability is learned locally rather
 *     than pooled across users.
 *
 *  2. CORS BOUNDS VALIDATION ON THE WEB. Reading a manifest is a cross-origin
 *     fetch. Most stream hosts send no CORS headers, so the browser refuses the
 *     read — this was measured directly: several feeds that answer curl fine are
 *     unreadable from the app origin. In the ANDROID app the native proxy
 *     (/__hlsproxy, /__embed2m3u8) sits below that boundary and validation is
 *     genuinely real. On web, a stream we cannot read is reported as
 *     `unverified` — never as `working`. That is the whole point of §23.
 *
 *  3. DISCOVERY IS CAPPED BY THE FEED. Measured on the live feed: 322 of 356
 *     events carry no embeds at all. Validation cannot manufacture streams, and
 *     the app must not invent URLs to fill the gap (it used to).
 *
 * Everything below is the strongest correct implementation inside those limits.
 * All I/O is injected so the failure matrix is testable without a network.
 */

// ───────────────────────────────────────────────────────────────── config ──

/**
 * Tunables in ONE place (the brief asks for env vars; a static bundle has no
 * env, so this is the equivalent single source of truth).
 */
export interface StreamConfig {
  validationTimeoutMs: number;
  /** Parallel validations in flight. Bounded so we never flood the device or source. */
  validationConcurrency: number;
  /** How long a successful validation may be trusted before re-checking. */
  healthTtlMs: number;
  /** Base cooldown after a failure; grows with consecutive failures. */
  failureCooldownMs: number;
  maxFailureCooldownMs: number;
  /** Background re-check cadence while an event is on screen. */
  healthCheckIntervalMs: number;
  maxRetries: number;
  failoverEnabled: boolean;
  /** Latency above which a working stream is downgraded to `degraded`. */
  degradedLatencyMs: number;
}

export const DEFAULT_CONFIG: StreamConfig = {
  validationTimeoutMs: 9000,
  validationConcurrency: 4,
  healthTtlMs: 90_000,
  failureCooldownMs: 60_000,
  maxFailureCooldownMs: 5 * 60_000,
  healthCheckIntervalMs: 45_000,
  maxRetries: 1,
  failoverEnabled: true,
  degradedLatencyMs: 3500,
};

// ───────────────────────────────────────────────────────────────── types ──

export type StreamStatus =
  | 'unknown'      // never checked
  | 'checking'     // validation in flight
  | 'working'      // validated: real manifest with real segments
  | 'degraded'     // reachable but slow / thin / partially broken
  | 'unverified'   // COULD NOT be checked here (CORS on web) — not a claim of health
  | 'offline';     // failed validation

export type FailureReason =
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'NETWORK'
  | 'CORS_BLOCKED'
  | 'INVALID_MANIFEST'
  | 'EMPTY_MANIFEST'
  | 'NO_SEGMENTS'
  | 'HTML_ERROR_PAGE'
  | 'RESOLVE_FAILED'
  | 'PLAYBACK_STALL'
  | 'UNKNOWN';

export interface Failure {
  reason: FailureReason;
  /** Whether it is worth trying this stream again later. */
  retryable: boolean;
  at: number;
}

/** Retryability is a property of the failure kind, decided once, here. */
const RETRYABLE: Record<FailureReason, boolean> = {
  TIMEOUT: true,
  HTTP_ERROR: true,       // 5xx/429 recover; 404 is caught by repeated failures
  NETWORK: true,
  CORS_BLOCKED: false,    // a policy decision by the host — retrying changes nothing
  INVALID_MANIFEST: false,
  EMPTY_MANIFEST: true,   // a live playlist can fill in once the event starts
  NO_SEGMENTS: true,      // ditto
  HTML_ERROR_PAGE: true,  // often a transient upstream error page
  RESOLVE_FAILED: true,
  PLAYBACK_STALL: true,
  UNKNOWN: true,
};

export interface Stream {
  id: string;
  eventId: string;
  /** Host of the origin the stream comes from — the unit reliability is learned on. */
  source: string;
  /** Embed page to resolve (sports servers), when the playable URL isn't known yet. */
  embed?: string;
  /** Playable URL once known (channels have this from the start). */
  url?: string;
  kind: 'server' | 'channel';
  type: 'hls' | 'iframe';
  label: string;
  /** ONLY set when actually known. Never guessed — see §11. */
  quality?: string;

  status: StreamStatus;
  latencyMs?: number;
  lastChecked?: number;
  healthScore: number;

  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailure?: Failure;
  /** Excluded from automatic selection until this timestamp. */
  cooldownUntil?: number;
}

export interface ValidationResult {
  ok: boolean;
  latencyMs: number;
  /** True when the environment prevented a verdict (CORS), rather than failing. */
  indeterminate?: boolean;
  failure?: FailureReason;
  /** Set when the manifest advertised a resolution. */
  quality?: string;
  /** A master playlist with variants but no segments of its own is still fine. */
  segments?: number;
}

// ─────────────────────────────────────────────────────── manifest checking ──

/**
 * Decide whether a fetched body is a genuinely playable HLS manifest.
 *
 * Explicitly NOT "HTTP 200 means playable" (§4/§23). A 200 routinely carries an
 * upstream error page, an empty playlist, or a master playlist whose variants
 * are absent. Each of those is classified separately so failover can make an
 * informed retry decision.
 */
export function analyseManifest(body: string, contentType?: string): ValidationResult {
  const text = (body || '').trim();
  const base: ValidationResult = { ok: false, latencyMs: 0 };

  if (!text) return { ...base, failure: 'EMPTY_MANIFEST' };

  // An error page dressed as success.
  if (text.startsWith('<') || /text\/html/i.test(contentType || '')) {
    return { ...base, failure: 'HTML_ERROR_PAGE' };
  }
  if (!text.includes('#EXTM3U')) {
    return { ...base, failure: 'INVALID_MANIFEST' };
  }

  const isMaster = text.includes('#EXT-X-STREAM-INF');
  const segments = (text.match(/#EXTINF/g) || []).length;

  if (isMaster) {
    // A master playlist is valid when it actually advertises variants.
    const variants = (text.match(/#EXT-X-STREAM-INF/g) || []).length;
    if (variants === 0) return { ...base, failure: 'INVALID_MANIFEST' };
    const res = text.match(/RESOLUTION=(\d+)x(\d+)/g) || [];
    let quality: string | undefined;
    if (res.length) {
      const heights = res.map((r) => parseInt(r.split('x')[1], 10)).filter((n) => !Number.isNaN(n));
      const best = Math.max(...heights);
      if (Number.isFinite(best)) quality = `${best}p`;
    }
    return { ok: true, latencyMs: 0, quality, segments: 0 };
  }

  // Media playlist: it must actually list segments, otherwise nothing can play.
  if (segments === 0) return { ...base, failure: 'NO_SEGMENTS' };
  return { ok: true, latencyMs: 0, segments };
}

// ──────────────────────────────────────────────────────────────── scoring ──

/**
 * Deterministic health score, 0-100. Weights are stated rather than magic:
 *
 *   base                       50
 *   recent successes    up to +30   (6 each, capped at 5)
 *   latency              -8 .. +12  (fast streams are meaningfully better)
 *   source reliability  -10 .. +10  (learned from this device's history)
 *   recent failures     down to -75 (15 each, capped at 5)
 *   degraded                   -25
 *   unverified                 -15  (honest uncertainty, not a health claim)
 *
 * The governing principle from §6: a stream that has repeatedly worked outranks
 * one that has never been tested.
 */
export function scoreStream(s: Stream, sourceReliability = 0.5): number {
  if (s.status === 'offline') return 0;

  let score = 50;
  score += Math.min(s.consecutiveSuccesses, 5) * 6;

  if (typeof s.latencyMs === 'number') {
    if (s.latencyMs < 500) score += 12;
    else if (s.latencyMs < 1500) score += 6;
    else if (s.latencyMs < 3000) score += 0;
    else score -= 8;
  }

  score += Math.round(sourceReliability * 20) - 10;
  score -= Math.min(s.consecutiveFailures, 5) * 15;

  if (s.status === 'degraded') score -= 25;
  if (s.status === 'unverified') score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ──────────────────────────────────────────────────────────────── ranking ──

const STATUS_RANK: Record<StreamStatus, number> = {
  working: 0,
  degraded: 1,
  unverified: 2,
  unknown: 3,
  checking: 4,
  offline: 5,
};

/**
 * Deterministic ordering (§7): status class, then health, then proven
 * successes, then latency, then quality. No randomness anywhere.
 */
export function rankStreams(streams: Stream[]): Stream[] {
  return [...streams].sort((a, b) => {
    const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (sr !== 0) return sr;
    if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
    if (b.consecutiveSuccesses !== a.consecutiveSuccesses) return b.consecutiveSuccesses - a.consecutiveSuccesses;
    const la = a.latencyMs ?? Number.MAX_SAFE_INTEGER;
    const lb = b.latencyMs ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    const qa = parseInt(a.quality || '0', 10) || 0;
    const qb = parseInt(b.quality || '0', 10) || 0;
    if (qa !== qb) return qb - qa;
    return a.id.localeCompare(b.id); // stable, never random
  });
}

/** Streams a user may be handed right now. Offline and cooling-down excluded. */
export function selectableStreams(streams: Stream[], now: number): Stream[] {
  return rankStreams(streams).filter(
    (s) => s.status !== 'offline' && !(s.cooldownUntil && s.cooldownUntil > now),
  );
}

/**
 * Next stream to try after `currentId` failed (§7, §17).
 *
 * `failedThisSession` is the loop guard: a stream that already failed in this
 * sitting is skipped entirely, so A→B→A→B cannot happen. Only when every
 * stream has been tried do we allow a retryable one back in, and even then the
 * best-ranked is chosen deterministically.
 */
export function nextStream(
  streams: Stream[],
  currentId: string | null,
  failedThisSession: Set<string>,
  now: number,
): Stream | null {
  const fresh = selectableStreams(streams, now).filter(
    (s) => s.id !== currentId && !failedThisSession.has(s.id),
  );
  if (fresh.length) return fresh[0];

  // Everything has been tried. Allow a second pass over failures that are
  // retryable and out of cooldown, so a recovered stream can come back.
  const recovered = rankStreams(streams).filter(
    (s) =>
      s.id !== currentId &&
      s.status !== 'offline' &&
      (!s.cooldownUntil || s.cooldownUntil <= now) &&
      (!s.lastFailure || s.lastFailure.retryable),
  );
  return recovered.length ? recovered[0] : null;
}

// ─────────────────────────────────────────────────── health state changes ──

export function markSuccess(s: Stream, latencyMs: number, cfg: StreamConfig, now: number, quality?: string): Stream {
  const degraded = latencyMs >= cfg.degradedLatencyMs;
  const next: Stream = {
    ...s,
    status: degraded ? 'degraded' : 'working',
    latencyMs,
    lastChecked: now,
    consecutiveSuccesses: s.consecutiveSuccesses + 1,
    consecutiveFailures: 0,
    cooldownUntil: undefined,
    lastFailure: undefined,
    // Only record quality we actually read from the manifest (§11).
    quality: quality || s.quality,
    healthScore: s.healthScore,
  };
  return next;
}

export function markFailure(s: Stream, reason: FailureReason, cfg: StreamConfig, now: number): Stream {
  const consecutiveFailures = s.consecutiveFailures + 1;
  const retryable = RETRYABLE[reason];
  // Back off harder the more it fails, capped so recovery stays possible.
  const cooldown = Math.min(cfg.failureCooldownMs * consecutiveFailures, cfg.maxFailureCooldownMs);
  return {
    ...s,
    // A non-retryable failure, or repeated failures, means offline. One
    // retryable blip only degrades it — live sources flap constantly.
    status: !retryable || consecutiveFailures >= 2 ? 'offline' : 'degraded',
    lastChecked: now,
    consecutiveFailures,
    consecutiveSuccesses: 0,
    lastFailure: { reason, retryable, at: now },
    cooldownUntil: now + cooldown,
    healthScore: s.healthScore,
  };
}

/** Environment could not reach a verdict — record honestly, never as healthy. */
export function markUnverified(s: Stream, now: number): Stream {
  return { ...s, status: 'unverified', lastChecked: now, healthScore: s.healthScore };
}

/** Due for a (re)check? Drives both first validation and recovery (§18). */
export function needsCheck(s: Stream, cfg: StreamConfig, now: number): boolean {
  if (s.status === 'checking') return false;
  if (s.cooldownUntil && s.cooldownUntil > now) return false;
  if (!s.lastChecked) return true;
  return now - s.lastChecked >= cfg.healthTtlMs;
}

// ──────────────────────────────────────────────────── source reliability ──

export interface SourceStats { ok: number; fail: number }

/**
 * Reliability of an origin, 0..1, learned on this device (§22). Smoothed so a
 * single result never swings it, and unknown sources sit at neutral 0.5 rather
 * than being punished for being new.
 */
export function reliabilityOf(stats: SourceStats | undefined): number {
  if (!stats) return 0.5;
  const total = stats.ok + stats.fail;
  if (total === 0) return 0.5;
  // Laplace smoothing keeps small samples near neutral.
  return (stats.ok + 1) / (total + 2);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return 'unknown';
  }
}

// ──────────────────────────────────────────────────────────── concurrency ──

/**
 * Run `fn` over items with a bounded number in flight (§14). Results keep input
 * order. Never rejects — a thrown task resolves to its error via `fn`.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ───────────────────────────────────────────────────────── observability ──

export interface Metrics {
  validations: number;
  validationsOk: number;
  validationsFailed: number;
  validationsIndeterminate: number;
  failovers: number;
  failoversSucceeded: number;
  recoveries: number;
  totalLatencyMs: number;
  byReason: Partial<Record<FailureReason, number>>;
}

export const emptyMetrics = (): Metrics => ({
  validations: 0,
  validationsOk: 0,
  validationsFailed: 0,
  validationsIndeterminate: 0,
  failovers: 0,
  failoversSucceeded: 0,
  recoveries: 0,
  totalLatencyMs: 0,
  byReason: {},
});

export function summarise(m: Metrics) {
  return {
    ...m,
    successRate: m.validations ? +(m.validationsOk / m.validations).toFixed(3) : null,
    avgLatencyMs: m.validationsOk ? Math.round(m.totalLatencyMs / m.validationsOk) : null,
    failoverSuccessRate: m.failovers ? +(m.failoversSucceeded / m.failovers).toFixed(3) : null,
  };
}
