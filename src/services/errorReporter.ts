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
 * this file is under two, which matters on a build already carrying too much.
 * It captures the same three sources a vendor would: uncaught errors, unhandled
 * rejections, and failed resource loads — that last category being the one that
 * produced the silent podcast failure, where an audio element failed to load and
 * nothing in the app noticed.
 *
 * WHERE REPORTS GO
 * Supabase, by default — the error_log table, no extra service to run. Set
 * VITE_ERROR_ENDPOINT to send them somewhere else instead.
 *
 * Either way the last errors stay in memory too, so a listener's own device can
 * say what went wrong when they get in touch. That beats "it just stopped
 * working" even when the network was the thing that failed.
 *
 * WHAT IS NOT SENT
 * No user id, no email, no page contents, no query strings — the path only.
 * A bug report should not become a privacy problem.
 */

import { SUPABASE_KEY, SUPABASE_REST } from '../supabase';

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

/** Supabase is the default destination — no extra service to run. */
const supabaseSink = (): string => (SUPABASE_REST ? `${SUPABASE_REST}/error_log` : '');

/** The last errors this session, newest first. For the diagnostics view. */
export function recentErrors(): ReportedError[] {
  return [...recent].reverse();
}

function send(e: ReportedError): void {
  if (posted >= MAX_POSTS) return;

  const payload = {
    // ISO, not epoch: the column is timestamptz and PostgREST will not coerce a
    // bare number into one.
    at: new Date(e.at).toISOString(),
    kind: e.kind,
    message: e.message,
    source: e.source,
    stack: e.stack,
    // Enough to reproduce, nothing that identifies a person: no user id, no
    // email, no page contents. A bug report should not become a privacy problem.
    url: location.pathname,
    ua: navigator.userAgent,
    build: (import.meta.env?.VITE_BUILD as string) || 'dev',
  };
  const body = JSON.stringify(payload);

  const custom = endpoint();
  if (custom) {
    posted += 1;
    // sendBeacon survives the page being closed, which is exactly when a fatal
    // error tends to happen. It cannot set headers, so it is only usable for a
    // plain endpoint — not for Supabase, which needs an apikey.
    try {
      if (navigator.sendBeacon?.(custom, new Blob([body], { type: 'application/json' }))) return;
    } catch { /* fall through */ }
    void fetch(custom, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .catch(() => { /* reporting must never itself throw */ });
    return;
  }

  const sink = supabaseSink();
  if (!sink) return; // nothing configured — the in-memory ring is still there
  posted += 1;
  void fetch(sink, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      // Without this PostgREST returns the inserted row, which we neither need
      // nor are permitted to read — there is no select policy on the table.
      Prefer: 'return=minimal',
    },
    body,
    keepalive: true,
  }).catch(() => { /* reporting must never itself throw */ });
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
