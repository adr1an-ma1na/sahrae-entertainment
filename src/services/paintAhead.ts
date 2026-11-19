/**
 * Rows painted before they are reached, on small-memory phones (owner,
 * 2026-11-19: "when scrolling … items are lagging to load up, I have to wait").
 *
 * On a phone reporting 4 GB or less (deviceTier `lite`, which is most phones),
 * rows far off screen are not painted, so a home of a dozen rails holds a few
 * decoded images instead of all of them. The browser decided "near" itself and
 * painted a row only as it reached the edge of the screen: every poster was
 * decoded as it came into view, which is the wait. Here every section within
 * a screen and a half of the view is marked near and painted ahead of the
 * scroll; only the ones further away are skipped, so the memory saving stays.
 */
const AHEAD = '150% 0px';

export function startPaintAhead(): void {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      if (e.isIntersecting) el.setAttribute('data-near', '');
      else el.removeAttribute('data-near');
    }
  }, { rootMargin: AHEAD });
  const seen = new WeakSet<Element>();
  const scan = () => {
    for (const s of document.querySelectorAll('section')) {
      if (seen.has(s)) continue;
      seen.add(s);
      io.observe(s);
    }
  };
  // New pages and rows arrive all the time: looked for after each burst of changes.
  let queued = 0;
  new MutationObserver(() => {
    if (queued) return;
    queued = window.setTimeout(() => { queued = 0; scan(); }, 120);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
}
