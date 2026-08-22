/**
 * Spatial (D-pad) navigation for TV remotes, Chromebook/laptop keyboards and
 * anything else that drives the UI with arrow keys instead of a pointer.
 *
 * Android TV delivers remote presses to the WebView as ArrowUp/Down/Left/Right
 * + Enter key events. Browsers don't move focus spatially on their own, so this
 * module:
 *   - finds every visible focusable element (buttons, links, inputs and any
 *     element tagged [data-tv-focusable], e.g. poster cards),
 *   - on an arrow press, moves focus to the nearest element in that direction
 *     using a geometric score,
 *   - on Enter, activates the focused element,
 *   - draws a clear highlight ring on whatever is focused,
 *   - the FIRST time an arrow key is seen, switches the app into "TV mode"
 *     (<html class="tv-mode">) so the CSS can keep the top navigation bar always
 *     visible/reachable and give focus room to breathe.
 *
 * Movement is INSTANT (no smooth-scroll animation) so it feels as snappy as
 * Netflix on low-powered TV hardware. It's a no-op for touch/mouse users (they
 * never send arrow keys), so phones and desktop pointer use are unaffected.
 */

import { haptics } from '../services/haptics';

type Dir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-tv-focusable]',
].join(',');

const FOCUS_CLASS = 'tv-focused';

let tvMode = false;
/** Elements we've already auto-focused once (so dialogs don't trap focus). */
const autoFocused = new WeakSet<HTMLElement>();

function enableTvMode() {
  if (tvMode) return;
  tvMode = true;
  document.documentElement.classList.add('tv-mode');
}

/**
 * Is this almost certainly a television?
 *
 * TV mode used to switch on only after the first arrow press, which meant a TV
 * user landed on a layout built for touch — small targets, no focus ring, and
 * nothing selected — and had to guess. When the signals are unambiguous we turn
 * it on immediately so the first thing on screen is already remote-ready.
 *
 * Deliberately conservative: a laptop must never be mistaken for a TV, so this
 * requires an explicit TV signal, not merely a big screen.
 *   • Android TV / Google TV / Chromecast / Fire TV / webOS / Tizen in the UA
 *   • or a coarse, hover-less pointer on a large display, which is what a
 *     remote-driven browser reports and a laptop never does.
 */
function looksLikeTv(): boolean {
  try {
    const ua = navigator.userAgent;
    if (/\b(Android TV|GoogleTV|Google TV|CrKey|AFT[A-Z0-9]+|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|WebOS|HbbTV|NetCast|Viera)\b/i.test(ua)) {
      return true;
    }
    const remoteLike =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches &&
      (navigator.maxTouchPoints || 0) === 0; // coarse but NOT a touchscreen → remote
    return remoteLike && Math.min(window.screen.width, window.screen.height) >= 720;
  } catch {
    return false;
  }
}

// Fast visibility test. `checkVisibility()` (Chromium / Android WebView) covers
// display:none, visibility:hidden and content-visibility cheaply in native code;
// the rect check covers size. NO per-element getComputedStyle ancestor walk —
// that was the source of the remote lag with hundreds of focusables on screen.
function isElementVisible(el: HTMLElement): boolean {
  const cv = (el as unknown as { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof cv === 'function' && !cv.call(el)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

/** Within an open modal/dialog, only its own focusables should be reachable. */
function topLayerRoot(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [data-tv-layer]'),
  ).filter(isElementVisible);
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

// The set of focusables only changes when the DOM does, so we cache it and
// rebuild only on mutation / scope change / resize. Each keypress then just
// reads geometry (cheap), instead of re-querying + re-filtering the whole tree.
let cacheDirty = true;
let cachedScope: ParentNode | null = null;
let cachedFocusables: HTMLElement[] = [];
function invalidateFocusCache() { cacheDirty = true; }

function getFocusables(): HTMLElement[] {
  const scope: ParentNode = topLayerRoot() ?? document;
  if (cacheDirty || scope !== cachedScope) {
    cachedScope = scope;
    const all = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    cachedFocusables = all.filter((el) => {
      // Skip focusables nested inside a card — the card itself is the focus unit.
      const card = el.closest('[data-tv-focusable]');
      if (card && card !== el) return false;
      return isElementVisible(el);
    });
    cacheDirty = false;
  }
  return cachedFocusables;
}

/** Close the top-most open layer (modal/sheet/player) via its close control. */
function closeTopLayer(): boolean {
  const layers = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-layer]')).filter(isElementVisible);
  const top = layers[layers.length - 1];
  if (!top) return false;
  const closer =
    top.querySelector<HTMLElement>('[data-tv-close]') ||
    top.querySelector<HTMLElement>('button[aria-label*="lose" i], button[aria-label*="inimize" i], button[aria-label*="ack" i]');
  if (closer) { closer.click(); return true; }
  return false;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable === true;
}

function clearHighlight() {
  document.querySelectorAll('.' + FOCUS_CLASS).forEach((n) => n.classList.remove(FOCUS_CLASS));
}

function highlight(el: HTMLElement) {
  clearHighlight();
  el.classList.add(FOCUS_CLASS);
}

function focusElement(el: HTMLElement) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  highlight(el);
  // Tactile tick as focus lands on a new tile — the remote/gamepad equivalent of
  // the touch "selection" haptic. No-ops on devices without a rumble motor.
  haptics.select();
  // INSTANT — no smooth animation. CSS scroll-padding/scroll-margin (see
  // index.css .tv-mode rules) keeps it clear of the fixed navbar and screen edges.
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Pick the best element in `dir` from `current`.
 *
 * Overlap-first, which is what makes a remote feel predictable. The previous
 * version scored purely on centre-to-centre distance, so a press of Right could
 * land on a tile in a DIFFERENT row simply because its centre happened to be
 * closer — the diagonal drift that makes D-pad navigation feel broken on a
 * rail-based layout like this one.
 *
 * Now a candidate that overlaps the current element on the perpendicular axis —
 * i.e. genuinely in the same row for left/right, or the same column for
 * up/down — always beats one that does not, and among those the nearest edge
 * wins. Only when nothing overlaps (moving between sections, or off the end of
 * a rail) do we fall back to a distance score.
 *
 * Distances are measured EDGE to EDGE, so a tall tile next to a short one is
 * still correctly seen as adjacent.
 */
function pickInDirection(current: HTMLElement, dir: Dir, candidates: HTMLElement[]): HTMLElement | null {
  const c = current.getBoundingClientRect();
  const horizontal = dir === 'left' || dir === 'right';

  let bestAligned: HTMLElement | null = null;
  let bestAlignedDist = Infinity;
  let bestAlignedOverlap = -1;
  let bestLoose: HTMLElement | null = null;
  let bestLooseScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();

    // Must lie strictly in the pressed direction.
    let primary: number;
    switch (dir) {
      case 'right':
        if (r.left < c.right - 2) continue;
        primary = r.left - c.right;
        break;
      case 'left':
        if (r.right > c.left + 2) continue;
        primary = c.left - r.right;
        break;
      case 'down':
        if (r.top < c.bottom - 2) continue;
        primary = r.top - c.bottom;
        break;
      default: // up
        if (r.bottom > c.top + 2) continue;
        primary = c.top - r.bottom;
        break;
    }
    if (primary < 0) primary = 0;

    // Perpendicular overlap → same row (horizontal) or same column (vertical).
    const overlap = horizontal
      ? Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)
      : Math.min(c.right, r.right) - Math.max(c.left, r.left);

    if (overlap > 0) {
      // Nearest wins; when several sit at the same distance — which is the norm
      // in a grid, where a whole rail shares one top edge — the one that
      // overlaps MOST wins. Without this tie-break every downward press from
      // anywhere in a rail landed on the same leftmost tile of the next rail.
      const nearer = primary < bestAlignedDist - 1;
      const tiedButBetterAligned = primary <= bestAlignedDist + 1 && overlap > bestAlignedOverlap;
      if (nearer || tiedButBetterAligned) {
        bestAlignedDist = primary;
        bestAlignedOverlap = overlap;
        bestAligned = el;
      }
    } else if (!bestAligned) {
      const cross = horizontal
        ? Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2)
        : Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2);
      const score = primary + cross * 2;
      if (score < bestLooseScore) {
        bestLooseScore = score;
        bestLoose = el;
      }
    }
  }
  return bestAligned || bestLoose;
}

function nearestToViewportTopLeft(candidates: HTMLElement[]): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) continue; // prefer on-screen
    const score = r.top * 2 + r.left;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best ?? candidates[0] ?? null;
}

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function initSpatialNavigation() {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __tvNavInit?: boolean }).__tvNavInit) return;
  (window as unknown as { __tvNavInit?: boolean }).__tvNavInit = true;

  // On an actual television, be remote-ready from the first frame rather than
  // waiting for a keypress to reveal that this is a TV.
  if (looksLikeTv()) {
    enableTvMode();
    // Claim focus once the first screen has rendered, so there is always
    // something selected to move from — landing with nothing focused is a large
    // part of why a remote felt unresponsive.
    const claim = () => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const first = document.querySelector<HTMLElement>('[data-tv-autofocus]')
        || nearestToViewportTopLeft(getFocusables());
      if (first) focusElement(first);
    };
    setTimeout(claim, 600);
    setTimeout(claim, 1800); // again after the first data load paints
  }

  // Remove the highlight ring as soon as a pointer is used, so mouse/touch
  // sessions don't show a stale selection.
  window.addEventListener('mousedown', clearHighlight, true);
  window.addEventListener('touchstart', clearHighlight, true);

  // When a dialog (modal / sign-in / player) appears, jump focus to its primary
  // action so "press OK to play / sign in" is a single click. Each element is
  // auto-focused only once, so the user can freely move away afterwards.
  const observer = new MutationObserver(() => {
    invalidateFocusCache();
    if (!tvMode) return;
    const target = document.querySelector<HTMLElement>('[data-tv-autofocus]');
    if (target && !autoFocused.has(target) && isElementVisible(target)) {
      autoFocused.add(target);
      // Defer so the element is laid out before we scroll to it.
      requestAnimationFrame(() => focusElement(target));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', invalidateFocusCache);

  // Expose a Back handler for the native Android Back button (MainActivity calls
  // this; if it returns false, the app does its default Back/exit).
  (window as unknown as { __sahraeBack?: () => boolean }).__sahraeBack = closeTopLayer;

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;

      // Escape / Back — close the top-most open layer (player, sheet, modal).
      if (e.key === 'Escape') {
        if (closeTopLayer()) e.preventDefault();
        return;
      }

      // Enter / "OK" — activate the focused element.
      if (e.key === 'Enter') {
        enableTvMode();
        if (active && active !== document.body && !isTypingTarget(active)) {
          const tag = active.tagName.toLowerCase();
          const isNative = tag === 'button' || tag === 'a' || tag === 'select' || tag === 'textarea' || tag === 'input';
          if (!isNative) {
            e.preventDefault();
            active.click();
          }
        }
        return;
      }

      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;

      enableTvMode();

      // Let arrow keys move the caret while typing in a text field.
      if (isTypingTarget(active)) return;

      const focusables = getFocusables();
      if (focusables.length === 0) return;

      const current =
        active && active !== document.body && focusables.includes(active)
          ? active
          : nearestToViewportTopLeft(focusables);

      if (!current) return;

      // If nothing was focused yet, the first arrow press just claims focus.
      if (current !== active) {
        e.preventDefault();
        focusElement(current);
        return;
      }

      const next = pickInDirection(current, dir, focusables);
      if (next) {
        e.preventDefault();
        focusElement(next);
      } else {
        // No candidate in that direction. Don't let the page jump-scroll the
        // focus off-screen — keep the current item put (feels controlled).
        e.preventDefault();
        current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    },
    true,
  );
}
