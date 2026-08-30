/**
 * Catches the failures nobody reports.
 *
 * Three bugs this month were invisible by design: the equaliser did nothing on
 * the web build, podcast episodes sat at 0:00 pretending to play, and videos the
 * uploader had blocked were skipped in silence. All three were found by reading
 * code. At a hundred users that is luck; past that it is a support queue with no
 * evidence in it.
 *
 * Deliberately not a vendor SDK. Sentry's browser bundle is ~30 KB gzipped and
 * this file is under two, which matters on a build already carrying 680 KB. It
 * captures the same three sources a vendor would — uncaught errors, unhandled
 * rejections, failed resource loads — and posts them wherever
 * VITE_ERROR_ENDPOINT points. Set that to a Sentry-compatible endpoint, a
 * Vercel function, or nothing at all.
 *
 * With no endpoint configured it still keeps the last errors in memory, so the
 * diagnostics readout can show a listener what went wrong on their own device
 * when they get in touch — which beats "it just stopped working" by a mile.
 */

export interface ReportedError {
  at: number;
  kind: 'error' | 'rejection' | 'resource' | 'manual';
  message: string;
  source?: string;
  stack?: string;
}

const RING = 25;          // enough for a session's worth of context
const MAX_POSTS = 20;     // never let a failing app flood a logging endpoint
const DEDUPE_MS = 10_000; // the same error twenty times a second helps nobody

const recent: ReportedError[] = [];
const lastSeen = new Map<string, number>();
let posted = 0;
let started = false;

const endpoint = (): string => {
  try { return (import.meta.env?.VITE_ERROR_ENDPOINT as string) || ''; } catch { return ''; }
};

/** The last errors this session, newest first. For the diagnostics view. */
export function recentErrors(): ReportedError[] {
  return [...recent].reverse();
}

function send(e: ReportedError): void {
  const url = endpoint();
  if (!url || posted >= MAX_POSTS) return;
  posted += 1;
  const body = JSON.stringify({
    ...e,
    // Enough to reproduce, nothing that identifies a person: no user id, no
    // email, no page contents. A bug report should not become a privacy problem.
    url: location.pathname,
    ua: navigator.userAgent,
    build: (import.meta.env?.VITE_BUILD as string) || 'dev',
  });
  // sendBeacon survives the page being closed, which is exactly when a fatal
  // error tends to happen. fetch is the fallback where it is unavailable.
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall through */ }
  void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .catch(() => { /* reporting must never itself throw */ });
}

export function report(message: string, opts: Partial<ReportedError> = {}): void {
  const msg = String(message || '').slice(0, 500);
  if (!msg) return;

  const now = Date.now();
  const seen = lastSeen.get(msg);
  if (seen && now - seen < DEDUPE_MS) return; // a loop reporting itself is noise
  lastSeen.set(msg, now);

  const entry: ReportedError = { at: now, kind: 'manual', message: msg, ...opts };
  recent.push(entry);
  if (recent.length > RING) recent.shift();

  // Always visible locally, whether or not an endpoint is configured.
  console.error(`[sahrae] ${entry.kind}: ${msg}`, entry.source || '');
  send(entry);
}

export function startErrorReporting(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  const onError = (e: ErrorEvent) => {
    report(e.message, {
      kind: 'error',
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      stack: e.error?.stack?.slice(0, 2000),
    });
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), {
      kind: 'rejection',
      stack: r instanceof Error ? r.stack?.slice(0, 2000) : undefined,
    });
  };

  /**
   * A failed <img>, <script> or <audio> does not bubble as an error event, so
   * it is caught in the capture phase. This is the category that produced the
   * silent podcast failure — the audio element failed to load and nothing in the
   * app noticed.
   */
  const onResource = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || t === (window as unknown as HTMLElement)) return;
    const tag = t.tagName?.toLowerCase();
    if (!tag || !['img', 'script', 'link', 'audio', 'video', 'iframe'].includes(tag)) return;
    const src = (t as HTMLImageElement).src || (t as HTMLLinkElement).href || '';
    // Thumbnails fail constantly and harmlessly as feeds churn; reporting every
    // one would bury the failures that matter.
    if (tag === 'img') return;
    report(`Failed to load ${tag}`, { kind: 'resource', source: String(src).slice(0, 300) });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onResource, true);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onResource, true);
    started = false;
  };
}
