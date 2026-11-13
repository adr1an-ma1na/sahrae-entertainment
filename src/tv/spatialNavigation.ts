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
 * It's a no-op for touch/mouse users (they never send arrow keys), so phones
 * and desktop pointer use are unaffected.
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
  // The dedicated TV APK (built with VITE_TARGET=tv) is always on a television.
  // The app presents a phone browser identity to stream providers, so the
  // user-agent test below cannot see the TV there.
  try { if ((import.meta.env?.VITE_TARGET as string) === 'tv') return true; } catch { /* not a Vite build */ }
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
/** The remote pointer (TvPointer.tsx) has the keys while it is out. */
const pointerOut = () => document.documentElement.classList.contains('tv-pointer');

/** Something on screen that Back should put away before the layer itself closes. */
let backHandler: (() => boolean) | null = null;
export function setTvBackHandler(fn: (() => boolean) | null) { backHandler = fn; }

/**
 * Back, for what lies over the picture: the pointer, then whatever registered
 * a back handler (the TV controls, the server strip). The Android shell asks
 * the player to leave full screen before anything else, so the player asks
 * this first; otherwise Back took a TV out of full screen with the controls
 * still up (2026-11-13).
 */
export function tvBackFirst(): boolean {
  if (pointerOut()) { window.dispatchEvent(new Event('sahrae:pointer-exit')); return true; }
  return !!(backHandler && backHandler());
}

function closeTopLayer(): boolean {
  if (pointerOut()) { window.dispatchEvent(new Event('sahrae:pointer-exit')); return true; }
  if (backHandler && backHandler()) return true;
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
  // A slider, switch or button-like input is not typed into. Treating the
  // music player's progress bar as a text box handed it every arrow key, so a
  // remote that reached it could never leave it (owner, TV, 2026-11-01).
  if (tag === 'input') return !NOT_TYPED.has((el as HTMLInputElement).type);
  return tag === 'textarea' || (el as HTMLElement).isContentEditable === true;
}
const NOT_TYPED = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image']);

// ── The focus highlight ───────────────────────────────────────────────────────
// One ring that glides from control to control, with the row sliding under it
// in the same frames, the way Netflix and Apple TV move. It used to be a large
// glow painted on the focused element: the TV repainted two big blurred shadows
// on every press, and focus jumped from one button to the next with the page
// snapping after it (owner, TV, 2026-11-08). The ring is a single small layer
// moved by transform, so a press costs next to nothing to draw.
const GLIDE_MS = 170;
const GLIDE_HELD_MS = 80; // A held key: keep up with the repeat.

interface Box { x: number; y: number; w: number; h: number }
let ring: HTMLDivElement | null = null;
let ringBox: Box | null = null;
let ringOn: HTMLElement | null = null;
let glideFrame = 0;
let gliding = false;
let settleTimer = 0;

function ringElement(): HTMLDivElement {
  if (!ring) {
    ring = document.createElement('div');
    ring.className = 'tv-ring';
    ring.setAttribute('aria-hidden', 'true');
  }
  // Inside the browser's full screen only that element is drawn.
  const host = document.fullscreenElement || document.body;
  if (ring.parentElement !== host) host.appendChild(ring);
  return ring;
}

function paintRing(b: Box) {
  const r = ringElement();
  r.style.transform = `translate3d(${b.x}px,${b.y}px,0)`;
  r.style.width = `${b.w}px`;
  r.style.height = `${b.h}px`;
  r.style.opacity = '1';
  ringBox = b;
}

function hideRing() {
  cancelAnimationFrame(glideFrame);
  gliding = false;
  window.clearTimeout(settleTimer);
  if (ring) ring.style.opacity = '0';
  ringBox = null;
  ringOn = null;
}

/**
 * Whether the ring belongs on this control. Never around a picture, and never
 * on a control the viewer cannot see: a gold box hung over films and matches,
 * around the picture itself, around buttons that had faded out, and around the
 * Play button a player had opened on top of (owner, TV, 2026-11-08).
 */
function ringBelongsOn(el: HTMLElement, r: DOMRect): boolean {
  if (el.closest('[data-tv-noring]') || el.matches('iframe, video') || el.querySelector('iframe, video')) return false;
  if (r.width * r.height >= window.innerWidth * window.innerHeight * 0.6) return false;
  const st = getComputedStyle(el);
  if (st.pointerEvents === 'none' || st.visibility === 'hidden') return false;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return true; // Off screen until the scroll lands.
  const top = document.elementFromPoint(cx, cy);
  return !(top && top.matches('iframe, video') && !el.contains(top));
}

/** Put the ring back on its control after something else moved it (content loading, a list growing). */
function syncRing() {
  if (gliding || !ringOn) return;
  if (!ringOn.isConnected) { hideRing(); return; }
  const r = ringOn.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) { hideRing(); return; }
  if (!ringBelongsOn(ringOn, r)) {
    // Kept in mind: a bar that fades back in gets its ring back.
    if (ring) ring.style.opacity = '0';
    ringBox = null;
    return;
  }
  const b = ringBox;
  if (!b || Math.abs(b.x - r.left) > 0.5 || Math.abs(b.y - r.top) > 0.5 || Math.abs(b.w - r.width) > 0.5 || Math.abs(b.h - r.height) > 0.5) {
    paintRing({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
}

function clearHighlight() {
  document.querySelectorAll('.' + FOCUS_CLASS).forEach((n) => n.classList.remove(FOCUS_CLASS));
  hideRing();
}

function highlight(el: HTMLElement) {
  document.querySelectorAll('.' + FOCUS_CLASS).forEach((n) => n.classList.remove(FOCUS_CLASS));
  el.classList.add(FOCUS_CLASS);
}

/** The nearest ancestor that scrolls vertically (a dialog's body), or null for the page itself. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 2) return p;
  }
  return null;
}

/** The nearest ancestor that scrolls sideways (a rail), or null. */
function railParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (p.scrollWidth <= p.clientWidth + 2) continue;
    const ox = getComputedStyle(p).overflowX;
    if (ox === 'auto' || ox === 'scroll') return p;
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Bring `el` into place and move the ring onto it, together. Up and down settle
 * the new row near the middle of the screen, the way a TV app scrolls a page;
 * left and right only bring a tile into view. With the least possible movement
 * the banner above the first row and everything below the last were never shown
 * (owner, TV, 2026-11-01). `end` takes the page to its very top or bottom instead.
 */
function glideTo(el: HTMLElement, vertical: boolean, end?: 'top' | 'bottom') {
  cancelAnimationFrame(glideFrame);
  window.clearTimeout(settleTimer);
  const r = el.getBoundingClientRect();
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  // Sideways: the rail the tile sits in.
  const rail = railParent(el);
  let dx = 0;
  if (rail) {
    const b = rail.getBoundingClientRect();
    const pad = 2.5 * rem;
    if (r.left < b.left + pad) dx = r.left - (b.left + pad);
    else if (r.right > b.right - pad) dx = r.right - (b.right - pad);
    dx = clamp(dx, -rail.scrollLeft, rail.scrollWidth - rail.clientWidth - rail.scrollLeft);
  }

  // Up and down: the dialog it is in, or the page. Clear of the fixed navbar.
  const sp = scrollParent(el);
  const scroller = sp || (document.scrollingElement as HTMLElement) || document.documentElement;
  const view = sp ? sp.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const padTop = sp ? rem : 7 * rem;
  const padBottom = (sp ? 1 : 3) * rem;
  let dy = 0;
  if (end === 'top') dy = -scroller.scrollTop;
  else if (end === 'bottom') dy = scroller.scrollHeight;
  else if (vertical) dy = (r.top + r.height / 2) - (view.top + view.bottom) / 2;
  else if (r.top < view.top + padTop) dy = r.top - (view.top + padTop);
  else if (r.bottom > view.bottom - padBottom) dy = r.bottom - (view.bottom - padBottom);
  dy = clamp(dy, -scroller.scrollTop, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);

  const showRing = ringBelongsOn(el, r);
  if (showRing) {
    ringOn = el;
    ringElement().style.borderRadius = getComputedStyle(el).borderTopLeftRadius || '0.75rem';
  } else hideRing();

  const to: Box = { x: r.left - dx, y: r.top - dy, w: r.width, h: r.height };
  const from: Box = ringBox || to;
  const fromLeft = rail ? rail.scrollLeft : 0;
  const fromTop = scroller.scrollTop;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The sidebar moves at once, as it always did (owner, 2026-11-08).
  const ms = reduce || el.closest('.tv-full, .tv-rail') ? 0 : heldKey ? GLIDE_HELD_MS : GLIDE_MS;
  const start = performance.now();
  gliding = true;
  const step = (now: number) => {
    const p = ms ? Math.min(1, (now - start) / ms) : 1;
    const e = 1 - (1 - p) ** 3;
    if (rail && dx) rail.scrollLeft = fromLeft + dx * e;
    if (dy) scroller.scrollTop = fromTop + dy * e;
    if (showRing) {
      paintRing({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
    }
    if (p < 1) { glideFrame = requestAnimationFrame(step); return; }
    gliding = false;
    syncRing();
    // A tile still finishing its own entrance has not reached its final place.
    settleTimer = window.setTimeout(syncRing, 350);
  };
  glideFrame = requestAnimationFrame(step);
}

/** The current press is a key held down: glide faster, to keep up. */
let heldKey = false;

function focusElement(el: HTMLElement, vertical = false, end?: 'top' | 'bottom') {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  highlight(el);
  // Tactile tick as focus lands on a new tile — the remote/gamepad equivalent of
  // the touch "selection" haptic. No-ops on devices without a rumble motor.
  haptics.select();
  glideTo(el, vertical, end);
}

/** Give a control the remote's focus from the page (the Sports player's title bar and picture). */
export function tvFocus(el: HTMLElement) { focusElement(el); }

/**
 * The one thing OK does right now, whatever has the focus, as Netflix's Skip
 * Intro: it pops up and OK skips (owner, 2026-11-13). Only while the remote is
 * resting on the picture (or nothing): a viewer who moved to a button on
 * purpose still presses that button.
 */
let priorityAction: (() => void) | null = null;
export function setTvPriorityAction(fn: (() => void) | null): void { priorityAction = fn; }
export function clearTvPriorityAction(fn: () => void): void { if (priorityAction === fn) priorityAction = null; }
/** Would OK, pressed now with `active` focused, go to the priority action? */
export function okGoesToPriority(active: Element | null): boolean {
  if (!priorityAction) return false;
  if (!active || active === document.body || active.tagName === 'IFRAME') return true;
  return !!active.closest('[data-tv-noring], [data-tv-priority]');
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
  let bestLooseReach = Infinity;

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
    } else {
      const cross = horizontal
        ? Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2)
        : Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2);
      const score = primary + cross * 2;
      if (score < bestLooseScore) {
        bestLooseScore = score;
        bestLooseReach = primary + cross;
        bestLoose = el;
      }
    }
  }
  // A control just off the column, nearer than anything in it, is the one
  // meant: from the music player's top bar, Down reached the progress bar
  // under the artwork and skipped the Song/Video switch right below.
  if (bestAligned && bestLoose && bestLooseReach < bestAlignedDist) return bestLoose;
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

/** Is this a television (the TV app, or a TV browser)? Same test the TV layout uses. */
export function isTelevision(): boolean { return looksLikeTv(); }

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
      // A page may name where a remote should start ([data-tv-initial]: the
      // showcase Play), so the TV opens on it instead of whatever sits
      // nearest the corner.
      const first = document.querySelector<HTMLElement>('[data-tv-autofocus]')
        || document.querySelector<HTMLElement>('[data-tv-initial]')
        || nearestToViewportTopLeft(getFocusables());
      if (first) focusElement(first);
    };
    // Repeated through start-up: a slow TV box can take several seconds to draw
    // its first screen, and a claim before then finds nothing to select. Each
    // one does nothing once something has focus.
    for (const ms of [600, 1800, 4000, 8000, 15000]) setTimeout(claim, ms);
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
    syncRing();
    const target = document.querySelector<HTMLElement>('[data-tv-autofocus]');
    if (target && !autoFocused.has(target) && isElementVisible(target)) {
      autoFocused.add(target);
      // Defer so the element is laid out before we scroll to it.
      requestAnimationFrame(() => focusElement(target));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', () => { invalidateFocusCache(); syncRing(); });
  // Anything else that scrolls under the ring takes it along.
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (gliding || !ringOn || scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => { scrollPending = false; syncRing(); });
  }, { capture: true, passive: true });
  // A control can fade away or be covered with nothing else changing (the bar
  // over a film hiding itself), and no event says so.
  window.setInterval(() => { if (tvMode && ringOn && !gliding && !document.hidden) syncRing(); }, 300);
  // The ring has to live inside the browser's full screen while there is one.
  document.addEventListener('fullscreenchange', () => { if (ring && ringOn) { ringElement(); syncRing(); } });

  // Expose a Back handler for the native Android Back button (MainActivity calls
  // this; if it returns false, the app does its default Back/exit).
  (window as unknown as { __sahraeBack?: () => boolean }).__sahraeBack = closeTopLayer;

  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (pointerOut()) return;
      const active = document.activeElement as HTMLElement | null;

      // Escape / Back — close the top-most open layer (player, sheet, modal).
      if (e.key === 'Escape') {
        if (closeTopLayer()) e.preventDefault();
        return;
      }

      // Enter / "OK" — activate the focused element.
      if (e.key === 'Enter') {
        // Enter in a text field is a phone keyboard's Go key, not a remote's OK.
        // Treating it as a TV signal laid the TV sidebar over the phone layout
        // for anyone who searched.
        if (isTypingTarget(active)) return;
        enableTvMode();
        if (priorityAction && okGoesToPriority(active)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          priorityAction();
          return;
        }
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
      heldKey = e.repeat;

      // Let arrow keys move the caret while typing in a text field.
      if (isTypingTarget(active)) return;

      // A slider (the music player's progress bar) takes left and right to
      // seek; up and down leave it, like any other control.
      if ((dir === 'left' || dir === 'right') && active instanceof HTMLInputElement && active.type === 'range') return;

      // Sahrae's own film player skips 10 s on left and right; up and down
      // still move between the buttons.
      if ((dir === 'left' || dir === 'right') && active?.closest('[data-tv-seek]')) return;

      // A server's picture on a TV takes every arrow itself (ui/TvTransport.tsx).
      if (active?.closest('[data-tv-keys]')) return;

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

      const vertical = dir === 'up' || dir === 'down';
      // Rows of choices (the servers strip). Sideways stays on the row; up and
      // down go to the next row even when it is too short to sit under this chip.
      let pool = focusables;
      const stripRow = current.closest('[data-strip-row]');
      if (stripRow) {
        const rows = Array.from(stripRow.parentElement?.querySelectorAll(':scope > [data-strip-row]') ?? []);
        const beside = vertical ? rows[rows.indexOf(stripRow) + (dir === 'down' ? 1 : -1)] : stripRow;
        if (beside) pool = focusables.filter((f) => beside.contains(f));
      }
      const next = pickInDirection(current, dir, pool);
      if (next) {
        e.preventDefault();
        // Up onto the first row: show the top of the page too (the banner, the title).
        focusElement(next, vertical, dir === 'up' && !pickInDirection(next, 'up', focusables) ? 'top' : undefined);
      } else {
        // Nothing further that way: show the rest of the page in that direction
        // (its top, or what sits below the last row), keeping the focus put.
        e.preventDefault();
        // Unless the page has a use for the press (the players' server strip).
        if (!window.dispatchEvent(new CustomEvent('sahrae:tv-edge', { detail: dir, cancelable: true }))) return;
        if (vertical) glideTo(current, true, dir === 'up' ? 'top' : 'bottom');
        else glideTo(current, false);
      }
    },
    true,
  );
}
