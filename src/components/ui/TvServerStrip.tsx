import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Server } from 'lucide-react';
import { setTvBackHandler, tvFocus } from '../../tv/spatialNavigation';

/** How long the strip stays with nothing pressed. */
const IDLE_MS = 7000;

/**
 * On a TV, pressing Up at the top of a playing match or film brings the servers
 * across the top of the picture (owner, 2026-11-08). Left and right move along
 * them, OK switches, Down or Back puts them away, and they leave by themselves.
 */
export function useTvServerStrip(enabled: boolean, picture: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  const timer = useRef(0);

  const close = () => {
    window.clearTimeout(timer.current);
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const p = picture.current;
    if (p) tvFocus(p);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const poke = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => closeRef.current(), IDLE_MS);
  };

  useEffect(() => {
    if (!enabled) { closeRef.current(); return; }
    const onEdge = (e: Event) => {
      const side = (e as CustomEvent<string>).detail;
      if (side === 'up' && !openRef.current) { e.preventDefault(); setOpen(true); poke(); }
      else if (side === 'up' && openRef.current) { e.preventDefault(); poke(); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!openRef.current) return;
      if (e.key === 'ArrowDown') closeRef.current(); else poke();
    };
    // A stream's own page can take focus when it loads, and then the remote's
    // arrows go to it and Up never reaches Sahrae. The picture keeps the focus.
    const onBlur = () => setTimeout(() => {
      const p = picture.current, a = document.activeElement;
      if (p && a?.tagName === 'IFRAME' && p.contains(a) && !document.documentElement.classList.contains('tv-pointer')) tvFocus(p);
    }, 0);
    window.addEventListener('sahrae:tv-edge', onEdge);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('sahrae:tv-edge', onEdge);
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back closes the strip before it closes the player.
  useEffect(() => {
    if (!open) return;
    setTvBackHandler(() => { closeRef.current(); return true; });
    return () => setTvBackHandler(null);
  }, [open]);

  return { open, close };
}

export interface StripServer { id: string; label: string; detail?: string; down?: boolean }

export function TvServerStrip({ servers, active, onPick, children }: {
  servers: StripServer[];
  /** Index in `servers` of the one playing. */
  active: number;
  onPick: (i: number) => void;
  /** Anything else offered on the strip, after the servers. */
  children?: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chip = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]') || row.current?.querySelector<HTMLElement>('button');
    const id = requestAnimationFrame(() => { if (chip) tvFocus(chip); });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div data-tv-strip className="dark absolute inset-x-0 top-0 z-40 px-8 pt-6 pb-12 bg-gradient-to-b from-black/95 via-black/75 to-transparent animate-in fade-in slide-in-from-top-2 duration-200">
      <p className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300"><Server className="w-4 h-4" /> Servers</p>
      <div ref={row} className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-2 px-1">
        {servers.map((s, i) => (
          <button key={s.id} type="button" onClick={() => onPick(i)} tabIndex={0} data-tv-focusable aria-pressed={i === active}
            className={`shrink-0 h-12 px-5 rounded-full text-base font-bold flex items-center gap-2 ${i === active ? 'bg-amber-400 text-amber-950' : s.down ? 'bg-white/5 text-zinc-500' : 'bg-white/15 text-white'}`}>
            {s.label}
            {s.detail && <span className="text-xs font-semibold opacity-75">{s.detail}</span>}
            {s.down && <span className="text-xs font-semibold opacity-75">not working</span>}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
