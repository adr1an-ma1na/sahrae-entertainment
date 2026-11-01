/**
 * OK on a TV remote, delivered to another site's player.
 *
 * A live match or a film server plays in the provider's own page, inside a
 * frame. Its play button is in that frame, where a D-pad cannot go, so on a
 * TV nothing could press it (owner, TCL, 2026-11-01). The Android app can
 * make a real tap (/__tap in MainActivity): pressing OK on the player taps its
 * middle, where every one of these players puts its play button, and focus
 * comes back to Sahrae so the remote keeps working.
 */

/** True in an Android app that understands /__tap (from 2026-11-01). */
export function canTap(): boolean {
  try { return !!(window as unknown as { __sahraeCaps?: { tap?: boolean } }).__sahraeCaps?.tap; } catch { return false; }
}

/** Tap the middle of `el`. Returns false where taps are not possible (website, older app). */
export function tapCenterOf(el: Element, refocus?: HTMLElement | null): boolean {
  if (!canTap()) return false;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  const fx = Math.min(1, Math.max(0, (r.left + r.width / 2) / window.innerWidth));
  const fy = Math.min(1, Math.max(0, (r.top + r.height / 2) / window.innerHeight));
  fetch(`https://localhost/__tap?fx=${fx.toFixed(4)}&fy=${fy.toFixed(4)}`, { cache: 'no-store' }).catch(() => {});
  // The tap puts focus inside the provider's frame, where the remote's arrows
  // would be lost: bring it back once the tap has landed.
  if (refocus) {
    const back = () => { try { refocus.focus({ preventScroll: true }); } catch { /* gone */ } };
    setTimeout(back, 350);
    setTimeout(back, 1200);
  }
  return true;
}
