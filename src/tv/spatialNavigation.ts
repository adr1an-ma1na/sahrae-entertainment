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
  // INSTANT — no smooth animation. CSS scroll-padding/scroll-margin (see
  // index.css .tv-mode rules) keeps it clear of the fixed navbar and screen edges.
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Pick the best element in `dir` from `current` using a directional + alignment score. */
function pickInDirection(current: HTMLElement, dir: Dir, candidates: HTMLElement[]): HTMLElement | null {
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;

    let primary = 0;
    let cross = 0;
    switch (dir) {
      case 'left':
        if (dx >= -2) continue;
        primary = -dx;
        cross = Math.abs(dy);
        break;
      case 'right':
        if (dx <= 2) continue;
        primary = dx;
        cross = Math.abs(dy);
        break;
      case 'up':
        if (dy >= -2) continue;
        primary = -dy;
        cross = Math.abs(dx);
        break;
      case 'down':
        if (dy <= 2) continue;
        primary = dy;
        cross = Math.abs(dx);
        break;
    }
    // Strongly prefer well-aligned targets so straight moves feel natural.
    const score = primary + cross * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
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
