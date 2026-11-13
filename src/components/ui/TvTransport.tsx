import { useEffect, useRef, useState, type RefObject } from 'react';
import { Pause, Play, RotateCcw, RotateCw, Settings, Subtitles } from 'lucide-react';
import { CLOCK_EVENT } from '../SkipButton';
import { setTvBackHandler, tvFocus } from '../../tv/spatialNavigation';
import { seekStep, clockText } from '../../services/tvTransportCore';

/**
 * The remote's own controls over a server's player, on a TV (owner,
 * 2026-11-13: "make the player's bar clickable on the TV, smooth").
 *
 * A server's play button, timeline, CC and settings live in its page, inside
 * a frame a D-pad cannot enter. These are Sahrae's, drawn over the picture
 * and wired to that player through the app's frame helper
 * (frame-options.js: clock, seek; installFrameHelper: play/pause):
 *
 *   OK            play / pause, and the controls come up
 *   Left / Right  back / ahead 10 s (held: 30 s, then 60 s), the bar shows
 *                 where it will land and the jump is made once, on release
 *   Down          the controls, on Play/Pause
 *   Up            the servers, quality, sound and subtitles (TvServerStrip)
 *   Back          the controls away, then the player
 *
 * They go away by themselves after a few seconds while the film plays, and
 * stay while it is paused.
 */
const HIDE_MS = 5000;
const SETTLE_MS = 450;

export interface TransportApi {
  /** A remote key reached the picture. Returns true when it was used. */
  key(k: string, repeat: boolean): boolean;
  visible(): boolean;
}

export default function TvTransport({ apiRef, picture, onSeek, onToggle, onSettings, title }: {
  apiRef: { current: TransportApi | null };
  picture: RefObject<HTMLElement | null>;
  onSeek: (to: number) => void;
  onToggle: () => void;
  /** Opens the server strip (quality, sound, subtitles). */
  onSettings: () => void;
  title?: string;
}) {
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  shownRef.current = shown;
  const [clock, setClock] = useState<{ t: number; d: number; paused: boolean } | null>(null);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  /** Where a run of Left/Right presses will land, before it is sent. */
  const [aim, setAim] = useState<number | null>(null);
  const aimRef = useRef<number | null>(null);
  const held = useRef(0);
  const settle = useRef(0);
  const hide = useRef(0);
  const playBtn = useRef<HTMLButtonElement>(null);
  const seekBar = useRef<HTMLDivElement>(null);

  // The player's clock, from the frame helper (an event, so the page does not redraw each second).
  useEffect(() => {
    const on = (e: Event) => {
      const { t, d, paused } = ((e as CustomEvent).detail || {}) as { t?: number; d?: number; paused?: boolean };
      if (typeof t !== 'number' || !(t >= 0)) return;
      setClock((c) => ({ t, d: typeof d === 'number' && d > 0 && d !== Infinity ? d : c?.d || 0, paused: paused === true }));
    };
    window.addEventListener(CLOCK_EVENT, on);
    return () => window.removeEventListener(CLOCK_EVENT, on);
  }, []);

  const armHide = () => {
    window.clearTimeout(hide.current);
    hide.current = window.setTimeout(() => {
      if (clockRef.current?.paused || aimRef.current !== null) { armHide(); return; }
      close();
    }, HIDE_MS);
  };
  const open = (focus?: 'play' | 'seek') => {
    if (!shownRef.current) { shownRef.current = true; setShown(true); }
    armHide();
    if (focus) requestAnimationFrame(() => {
      const el = focus === 'play' ? playBtn.current : seekBar.current;
      if (el) tvFocus(el);
    });
  };
  const close = () => {
    window.clearTimeout(hide.current);
    if (!shownRef.current) return;
    shownRef.current = false;
    setShown(false);
    // The remote goes back to the picture, or OK would press a button nobody can see.
    const a = document.activeElement;
    if (picture.current && (!a || a === document.body || a.closest('[data-tv-transport]'))) tvFocus(picture.current);
  };

  const nudge = (dir: -1 | 1, repeat: boolean) => {
    const c = clockRef.current;
    if (!c) { open(); return; }
    held.current = repeat ? held.current + 1 : 0;
    const from = aimRef.current ?? c.t;
    const to = Math.max(0, Math.min(c.d > 0 ? c.d - 1 : Infinity, from + dir * seekStep(held.current)));
    aimRef.current = to;
    setAim(to);
    open();
    window.clearTimeout(settle.current);
    // One jump when the presses stop, not one per press: each seek makes the player fetch again.
    settle.current = window.setTimeout(() => {
      const land = aimRef.current;
      aimRef.current = null;
      setAim(null);
      held.current = 0;
      if (land !== null) {
        onSeek(land);
        setClock((x) => (x ? { ...x, t: land } : x));
      }
    }, SETTLE_MS);
  };

  const toggle = () => {
    onToggle();
    // The frame confirms within a second; show the change at once.
    setClock((c) => (c ? { ...c, paused: !c.paused } : c));
    open();
  };

  apiRef.current = {
    visible: () => shownRef.current,
    key: (k, repeat) => {
      if (k === 'ArrowLeft') { nudge(-1, repeat); return true; }
      if (k === 'ArrowRight') { nudge(1, repeat); return true; }
      if (k === 'ArrowDown') { open('play'); return true; }
      if (k === 'Enter') { toggle(); return true; }
      return false;
    },
  };

  // Back puts the controls away before it leaves the player.
  useEffect(() => {
    if (!shown) return;
    setTvBackHandler(() => { close(); return true; });
    return () => setTvBackHandler(null);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any press inside the controls keeps them up.
  useEffect(() => {
    if (!shown) return;
    const keep = (e: KeyboardEvent) => { if (document.activeElement?.closest('[data-tv-transport]')) { if (e.key === 'ArrowUp' && document.activeElement === seekBar.current) { close(); return; } armHide(); } };
    window.addEventListener('keydown', keep);
    return () => window.removeEventListener('keydown', keep);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { window.clearTimeout(hide.current); window.clearTimeout(settle.current); }, []);

  if (!shown) return null;
  const t = aim ?? clock?.t ?? 0;
  const d = clock?.d ?? 0;
  const pct = d > 0 ? Math.min(100, (t / d) * 100) : 0;
  const paused = clock?.paused ?? false;
  const btn = 'h-14 min-w-14 px-4 rounded-full flex items-center justify-center gap-2 text-white text-base font-bold bg-white/15 focus:bg-white focus:text-black';
  return (
    <div data-tv-transport className="dark absolute inset-x-0 bottom-0 z-40 px-10 pb-8 pt-24 bg-gradient-to-t from-black/95 via-black/70 to-transparent animate-in fade-in slide-in-from-bottom-2 duration-150">
      {title && <p className="text-white text-xl font-bold mb-3 truncate">{title}</p>}
      <div ref={seekBar} tabIndex={0} data-tv-focusable data-tv-seek role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(d)} aria-valuenow={Math.round(t)}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nudge(e.key === 'ArrowLeft' ? -1 : 1, e.repeat); } }}
        className="group relative h-8 flex items-center rounded-full outline-none">
        <div className="relative w-full h-1.5 group-focus:h-2.5 rounded-full bg-white/25 transition-[height] duration-150">
          <div className={`absolute inset-y-0 left-0 rounded-full ${aim !== null ? 'bg-white' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 group-focus:w-5 group-focus:h-5 rounded-full bg-white shadow" style={{ left: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-1 text-sm font-semibold text-zinc-200 tabular-nums">
        <span>{clock ? clockText(t) : 'Starting…'}</span>
        <span>{d > 0 ? `-${clockText(Math.max(0, d - t))}` : ''}</span>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button type="button" data-tv-focusable aria-label="Back 10 seconds" onClick={() => nudge(-1, false)} className={btn}><RotateCcw className="w-6 h-6" /><span className="text-sm">10</span></button>
        <button ref={playBtn} type="button" data-tv-focusable aria-label={paused ? 'Play' : 'Pause'} onClick={toggle} className={`${btn} px-6`}>
          {paused ? <Play className="w-7 h-7 fill-current" /> : <Pause className="w-7 h-7 fill-current" />}
        </button>
        <button type="button" data-tv-focusable aria-label="Ahead 10 seconds" onClick={() => nudge(1, false)} className={btn}><span className="text-sm">10</span><RotateCw className="w-6 h-6" /></button>
        <span className="flex-1" />
        <button type="button" data-tv-focusable onClick={() => { close(); onSettings(); }} className={btn}><Subtitles className="w-6 h-6" /> Subtitles</button>
        <button type="button" data-tv-focusable onClick={() => { close(); onSettings(); }} className={btn}><Settings className="w-6 h-6" /> Settings</button>
      </div>
    </div>
  );
}
