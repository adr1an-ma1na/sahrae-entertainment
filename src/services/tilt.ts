/**
 * Posters that lean toward you (owner, 2026-11-17: "3D motion graphics that
 * is interactive"). The card under the mouse turns toward it with a glint of
 * light where the pointer is; a finger pressing a card tips it in under the
 * finger; on a TV the poster the remote lands on turns slightly toward the
 * middle of the screen, as if lifted off the row.
 *
 * Only CSS variables on one card at a time are written (--rx, --ry, --gx,
 * --gy, read by `.poster-card > div:first-child` in index.css), once per
 * frame at most, so nothing else on the page is restyled. Not on weak
 * graphics, and not for anyone who asked for less motion.
 */
const CARD = '.poster-card';

export function initTilt(): void {
  if (typeof window === 'undefined' || (window as unknown as { __tiltInit?: boolean }).__tiltInit) return;
  (window as unknown as { __tiltInit?: boolean }).__tiltInit = true;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const weak = () => document.documentElement.classList.contains('low-gfx');

  let on: HTMLElement | null = null;
  let raf = 0;
  let last: { x: number; y: number; press: boolean } | null = null;

  const surface = (card: HTMLElement) => card.firstElementChild as HTMLElement | null;
  const reset = (card: HTMLElement | null) => {
    const s = card && surface(card);
    if (!s) return;
    for (const k of ['--rx', '--ry', '--gx', '--gy', '--press']) s.style.removeProperty(k);
    card!.classList.remove('is-tilted');
  };
  const apply = () => {
    raf = 0;
    if (!on || !last) return;
    const s = surface(on);
    if (!s) return;
    const r = on.getBoundingClientRect();
    const nx = Math.max(-0.5, Math.min(0.5, (last.x - r.left) / r.width - 0.5));
    const ny = Math.max(-0.5, Math.min(0.5, (last.y - r.top) / r.height - 0.5));
    // Toward the pointer when hovering; away from the finger when pressing (it tips in under it).
    const sign = last.press ? -1 : 1;
    s.style.setProperty('--ry', `${(nx * 18 * sign).toFixed(2)}deg`);
    s.style.setProperty('--rx', `${(-ny * 16 * sign).toFixed(2)}deg`);
    s.style.setProperty('--gx', `${((nx + 0.5) * 100).toFixed(1)}%`);
    s.style.setProperty('--gy', `${((ny + 0.5) * 100).toFixed(1)}%`);
    s.style.setProperty('--press', last.press ? '0.97' : '1');
    on.classList.add('is-tilted');
  };
  const track = (e: PointerEvent, press: boolean) => {
    if (weak() || document.documentElement.classList.contains('tv-mode')) return;
    const card = (e.target as Element | null)?.closest?.(CARD) as HTMLElement | null;
    if (card !== on) { reset(on); on = card; }
    if (!card) return;
    last = { x: e.clientX, y: e.clientY, press };
    if (!raf) raf = requestAnimationFrame(apply);
  };

  document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') track(e, false); }, { passive: true });
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') track(e, true); }, { passive: true });
  const release = () => { reset(on); on = null; last = null; };
  document.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') release(); }, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.documentElement.addEventListener('pointerleave', release, { passive: true });
  window.addEventListener('scroll', () => { if (on && last?.press) release(); }, { passive: true, capture: true });

  // The remote: the poster it lands on turns a little toward the middle of the screen.
  let tvOn: HTMLElement | null = null;
  window.addEventListener('sahrae:tv-focused', (e) => {
    const el = (e as CustomEvent).detail as HTMLElement | null;
    if (tvOn && tvOn !== el) reset(tvOn);
    tvOn = null;
    if (!el || weak() || !el.matches?.(CARD)) return;
    const s = surface(el);
    if (!s) return;
    const r = el.getBoundingClientRect();
    const toward = ((r.left + r.width / 2) / window.innerWidth - 0.5) * -12;
    s.style.setProperty('--ry', `${toward.toFixed(2)}deg`);
    s.style.setProperty('--rx', '4deg');
    el.classList.add('is-tilted');
    tvOn = el;
  });
}
