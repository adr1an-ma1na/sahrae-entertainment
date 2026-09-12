/**
 * One bounded, retrying fetch for every remote call in the app.
 *
 * WHY THIS EXISTS
 * A bare fetch() has no timeout. It waits as long as the platform allows, which
 * on a stalled mobile connection is effectively forever. The catalog screen was
 * built on eleven such calls and became "Network Error — we had trouble
 * connecting to the movie database" the moment the network got slow, with no
 * recovery. That was fixed; this is the same fault in the other services, found
 * by looking rather than by waiting for the next report.
 *
 * It matters most exactly where it is hardest to test: a weak mobile signal.
 * Several of these services try a direct request and fall back to the native
 * proxy if it fails — but a request that HANGS never fails, so the fallback
 * never fires and the screen simply waits forever. A timeout is what turns a
 * hang into a failure, and a failure is what the fallback is waiting for.
 *
 * RETRY POLICY, deliberately narrow
 * Transient conditions get another attempt: network errors, our own timeout,
 * 429 rate limits, and 5xx. A 401, 403 or 404 will fail again identically, so
 * retrying only makes the viewer wait longer for the same answer.
 */

export interface HttpOptions {
  /**
   * Budget for the RESPONSE HEADERS, per attempt — not for the whole transfer.
   *
   * This distinction is what makes the helper safe to use on downloads. `await
   * fetch()` resolves as soon as the headers arrive; the body streams after
   * that. The timer is cleared in a `finally` at exactly that moment, so a
   * 6-second budget means "answer me within 6 seconds", not "finish sending a
   * 40 MB file within 6 seconds". A timeout that aborted mid-body would break
   * every download on a slow connection, which is the opposite of the point.
   */
  timeoutMs?: number;
  /** Extra attempts after the first. */
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Worth trying again; anything else is a settled answer. */
const isTransient = (status: number) => status === 429 || status >= 500;

export async function httpFetch(
  url: string,
  init?: RequestInit,
  opts: HttpOptions = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // A fresh controller per attempt. Reusing one would leave every retry
    // pre-aborted after the first timeout — a retry that only looks like one.
    //
    // AbortController + setTimeout rather than AbortSignal.timeout(), which
    // needs a newer engine than the oldest WebViews this app runs on.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (isTransient(res.status) && attempt < retries) {
        lastError = new Error(`HTTP ${res.status}`);
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

/**
 * For a call that has its own fallback path.
 *
 * One attempt, a short budget, and it resolves to null instead of throwing —
 * the caller is going to try something else anyway, so a long retry loop here
 * just delays the thing that will actually work.
 */
export async function tryFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = 6_000,
): Promise<Response | null> {
  try {
    return await httpFetch(url, init, { timeoutMs, retries: 0 });
  } catch {
    return null;
  }
}
