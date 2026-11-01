import { useEffect, useRef, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import { canTap } from '../services/nativeTap';

/**
 * A pointer for the TV remote, over a server's or stream site's own player.
 *
 * Those players have their own controls (quality, volume, subtitles, settings)
 * inside a frame the D-pad cannot enter, so on a TV only Sahrae's own buttons
 * could be used (owner, 2026-11-01). With the pointer out, the arrows move a
 * cursor (faster while held), OK taps where it points (a real tap, /__tap in
 * the Android app), and Back or the button puts it away. The page's own
 * navigation steps aside meanwhile (spatialNavigation.ts, html.tv-pointer).
 */
export default function TvPointer({ area, onExit }: { area: HTMLElement | null; onExit: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const rootRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    if (!area) return;
    const r = area.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    document.documentElement.classList.add('tv-pointer');
    rootRef.current?.focus({ preventScroll: true });

    let held = 0;
    let lastKey = '';
    const onKey = (e: KeyboardEvent) => {
      const p = posRef.current;
      if (!p) return;
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') { e.preventDefault(); e.stopPropagation(); exitRef.current(); return; }
      const box = area.getBoundingClientRect();
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        tapAt(p.x, p.y);
        setFlash(true); setTimeout(() => setFlash(false), 180);
        // The tap moves focus into the player's frame; take it back for the arrows.
        const back = () => rootRef.current?.focus({ preventScroll: true });
        setTimeout(back, 300); setTimeout(back, 900);
        return;
      }
      const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key] as [number, number] | undefined;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      held = e.key === lastKey && e.repeat ? held + 1 : 0;
      lastKey = e.key;
      const step = Math.min(18 + held * 6, 72);
      setPos({
        x: Math.min(box.right - 4, Math.max(box.left + 4, p.x + d[0] * step)),
        y: Math.min(box.bottom - 4, Math.max(box.top + 4, p.y + d[1] * step)),
      });
    };
    const onExitEvent = () => exitRef.current();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('sahrae:pointer-exit', onExitEvent);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('sahrae:pointer-exit', onExitEvent);
      document.documentElement.classList.remove('tv-pointer');
    };
  }, [area]);

  // Hold the keys from the first frame the pointer is drawn.
  const shown = !!pos;
  useEffect(() => { if (shown) rootRef.current?.focus({ preventScroll: true }); }, [shown]);

  if (!pos || !canTap()) return null;
  return (
    <div ref={rootRef} tabIndex={-1} aria-label="Pointer: arrows move, OK taps, Back closes" className="fixed inset-0 z-[450] pointer-events-none outline-none">
      <div className="absolute" style={{ left: pos.x, top: pos.y, transform: 'translate(-3px, -2px)' }}>
        <MousePointer2 className={`w-9 h-9 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] transition-transform ${flash ? 'scale-75' : ''}`} style={{ color: '#fff', fill: 'rgb(var(--acc-rgb))' }} />
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 text-white text-sm font-semibold">
        Arrows move · OK taps · Back closes the pointer
      </div>
    </div>
  );
}

function tapAt(x: number, y: number) {
  const fx = Math.min(1, Math.max(0, x / window.innerWidth));
  const fy = Math.min(1, Math.max(0, y / window.innerHeight));
  fetch(`https://localhost/__tap?fx=${fx.toFixed(4)}&fy=${fy.toFixed(4)}`, { cache: 'no-store' }).catch(() => {});
}
