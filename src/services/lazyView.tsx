import { lazy, useState, type ComponentType, type ReactElement } from 'react';

/**
 * A screen loaded apart from the app's first download, so opening the app only
 * parses what the first screen needs: it was one 1.1 MB file, read in full on
 * every launch, which a TV box feels.
 *
 * Each screen is fetched quietly once the app is idle (preloadViews), so going
 * to it later draws at once with no placeholder.
 */
const RELOADED = 'sahrae.chunkReload';

/** A new release replaces the files: an open app reloads once rather than failing. */
async function loadOrReload<M>(load: () => Promise<M>): Promise<M> {
  try {
    return await load();
  } catch (first) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      return await load();
    } catch {
      let already = false;
      try { already = sessionStorage.getItem(RELOADED) === '1'; sessionStorage.setItem(RELOADED, '1'); } catch { /* private mode */ }
      if (!already) window.location.reload();
      throw first;
    }
  }
}

export interface LazyView<P> {
  (props: P): ReactElement;
  preload: () => Promise<unknown>;
}

const all: LazyView<never>[] = [];

export function lazyView<P extends object>(load: () => Promise<{ default: ComponentType<P> }>): LazyView<P> {
  let ready: ComponentType<P> | null = null;
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const start = () => {
    pending ||= loadOrReload(load).then((m) => { ready = m.default; return m; }).catch((e) => { pending = null; throw e; });
    return pending;
  };
  const Later = lazy(start) as unknown as ComponentType<P>;
  const View = ((props: P) => {
    // Chosen once for each mount: changing it later would rebuild the screen.
    const [C] = useState<ComponentType<P>>(() => ready || Later);
    return <C {...props} />;
  }) as LazyView<P>;
  View.preload = start;
  all.push(View as unknown as LazyView<never>);
  return View;
}

/** Fetch every screen, one at a time, only while the device has nothing else to do. */
export function preloadViews(): void {
  const idle = (fn: () => void) => {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(fn, { timeout: 3000 }); else setTimeout(fn, 400);
  };
  let i = 0;
  const next = () => {
    if (i >= all.length) return;
    all[i++].preload().catch(() => { /* tried again when it is opened */ }).finally(() => idle(next));
  };
  idle(next);
}
