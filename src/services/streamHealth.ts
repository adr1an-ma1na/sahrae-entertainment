/**
 * On-device stream health probes.
 *
 * Build-time auditing of these links is impossible: the CI sandbox DNS-blackholes
 * many broadcaster CDNs, and real availability is geo-dependent anyway. So we
 * verify on the USER's actual network at runtime and only ever surface entries
 * that respond — guaranteeing "if it's listed, it plays".
 */

/**
 * HLS playlist health, probed through the native same-origin proxy — the exact
 * path the player uses — so a pass means it will actually play. Returns true
 * when the response is a real #EXTM3U playlist.
 */
export async function probeHls(proxiedUrl: string, timeoutMs = 9000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(proxiedUrl, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(to);
    if (!r.ok) return false;
    const text = (await r.text()).slice(0, 800);
    return text.includes('#EXTM3U');
  } catch {
    return false;
  }
}

/**
 * Audio stream health via an <audio> element (needs no CORS, unlike fetch).
 * Resolves true as soon as the stream can play or data starts flowing.
 */
export function probeAudio(url: string, timeoutMs = 9000): Promise<boolean> {
  return new Promise((resolve) => {
    const a = new Audio();
    let done = false;
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      a.oncanplay = a.onloadeddata = a.onprogress = a.onerror = a.onstalled = null;
      try { a.pause(); a.src = ''; a.load(); } catch { /* ignore */ }
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), timeoutMs);
    a.oncanplay = () => finish(true);
    a.onloadeddata = () => finish(true);
    a.onprogress = () => { if (a.buffered && a.buffered.length > 0) finish(true); };
    a.onerror = () => finish(false);
    a.preload = 'auto';
    a.muted = true; // reachability only — never actually audible
    try { a.src = url; a.load(); } catch { finish(false); }
  });
}

/**
 * Run probes with bounded concurrency, reporting each result as it lands so the
 * UI can drop dead entries progressively instead of blocking on the slowest.
 */
export async function probeAll<T>(
  items: T[],
  key: (t: T) => string,
  probe: (t: T) => Promise<boolean>,
  onResult: (k: string, ok: boolean) => void,
  concurrency = 5,
): Promise<void> {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const t = items[i++];
      const ok = await probe(t);
      onResult(key(t), ok);
    }
  };
  await Promise.all(new Array(Math.min(concurrency, items.length || 1)).fill(0).map(run));
}
