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
 *   - draws a clear highlight ring on whatever is focused.
 *
 * It's a no-op for touch/mouse users (they never send arrow keys), so phones and
 * desktop pointer use are unaffected.
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

function isElementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  let node: HTMLElement | null = el;
  while (node) {
    const s = window.getComputedStyle(node);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0) {
      return false;
    }
    node = node.parentElement;
  }
  return true;
}

function getFocusables(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return all.filter((el) => {
    // Skip focusables nested inside a card — the card itself is the focus unit.
    const card = el.closest('[data-tv-focusable]');
    if (card && card !== el) return false;
    return isElementVisible(el);
  });
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
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;

      // Enter / "OK" — activate the focused element.
      if (e.key === 'Enter') {
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
      }
      // No candidate in that direction → let the browser do its default
      // (e.g. scroll), so the user is never stuck.
    },
    true,
  );
}
