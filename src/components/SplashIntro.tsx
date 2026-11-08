import { useEffect, useState, type CSSProperties } from 'react';
import { Capacitor } from '@capacitor/core';
import { isTelevision } from '../tv/spatialNavigation';

/**
 * The launch: a desert dawn, Sahrae's own image (the name is the Sahara; the
 * icon is a sun rising over dunes). The sky warms, the sun rises behind two
 * dune lines and lights the crest, SAHRAE arrives letter by letter out of a
 * soft focus, ENTERTAINMENT settles beneath it, and the camera pushes gently
 * in as the scene dissolves into the app. Pure CSS keyframes (index.css), in
 * the theme's own colours; simpler on TVs and low-power devices, and a quick
 * fade for anyone who has asked for less motion.
 */
const WORD = 'SAHRAE';

/**
 * Each moving part of the scene is its own small picture, placed where it sits
 * in the 1200×800 scene (anchored bottom centre, cover, as one SVG with
 * xMidYMax slice would place it). Moving a whole picture is done by the
 * graphics chip; moving a shape inside one SVG redraws the SVG every frame,
 * which is what made the dawn stutter on a TV (owner, 2026-11-02). --u is one
 * scene unit in CSS pixels.
 */
const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
  left: `calc(50% + ${x - 600} * var(--u))`,
  top: `calc(100% - ${800 - y} * var(--u))`,
  width: `calc(${w} * var(--u))`,
  height: `calc(${h} * var(--u))`,
});
/**
 * The intro plays once per visit. A reload (a newer library from the cloud, a
 * language change, recovering from an error) does not play it again; opening
 * the app afresh does.
 */
const PLAYED_KEY = 'sahrae.introPlayed';
const playedThisVisit = () => { try { return sessionStorage.getItem(PLAYED_KEY) === '1'; } catch { return false; } };

const sceneUnit = () => {
  const el = document.documentElement; // the page's own box, without any scroll bar
  return Math.max((el.clientWidth || window.innerWidth) / 1200, (el.clientHeight || window.innerHeight) / 800);
};

/**
 * `onShown` is called once the dawn is really on screen. The app builds the
 * home page under it only then: on a TV, building it first held the screen
 * for longer than the whole intro, which was over before anything was drawn
 * (owner, TCL, 2026-11-01). The clock starts from that first frame too.
 * In the apps even building it during the dawn stalls the dawn, so there it is
 * built once the dawn has finished moving, under its last still frame, and
 * the dawn fades only after the home page has been drawn.
 */
export default function SplashIntro({ onShown }: { onShown?: () => void } = {}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => (playedThisVisit() ? 'done' : 'in'));

  const [unit] = useState(() => (typeof window === 'undefined' ? 1 : sceneUnit()));
  const native = Capacitor.isNativePlatform();

  useEffect(() => {
    if (playedThisVisit()) { onShown?.(); return; }
    let t1 = 0, t2 = 0, raf2 = 0, started = false;
    const twoFrames = (fn: () => void) => { raf2 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(fn); }); };
    const start = () => {
      if (started) return;
      started = true;
      try { sessionStorage.setItem(PLAYED_KEY, '1'); } catch { /* plays again next reload */ }
      if ((isTelevision() || native) && !reduce) {
        t1 = window.setTimeout(() => {
          onShown?.();
          twoFrames(() => {
            setPhase('out');
            t2 = window.setTimeout(() => setPhase('done'), 750);
          });
        }, 2300);
        return;
      }
      onShown?.();
      t1 = window.setTimeout(() => setPhase('out'), reduce ? 500 : 2150);
      t2 = window.setTimeout(() => setPhase('done'), reduce ? 850 : 2900);
    };
    // Two frames: the first is drawn by the time the second is asked for.
    const raf = requestAnimationFrame(() => requestAnimationFrame(start));
    const safety = window.setTimeout(start, 400); // a page in the background draws no frames
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); clearTimeout(safety); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  if (phase === 'done') return null;

  return (
    <div className={`dawn fixed inset-0 z-[200] overflow-hidden ${native ? 'dawn-lite' : ''} ${phase === 'out' ? 'dawn-out' : ''} ${reduce ? 'dawn-still' : ''}`} style={{ '--u': `${unit}px` } as CSSProperties} aria-hidden>
      <div className="dawn-sky" />
      <svg width="0" height="0" className="absolute">
        <defs>
          <radialGradient id="dawn-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: 'var(--logo-hi)' }} />
            <stop offset="45%" style={{ stopColor: 'var(--logo-1)' }} />
            <stop offset="75%" style={{ stopColor: 'var(--logo-3)', stopOpacity: 0.55 }} />
            <stop offset="100%" style={{ stopColor: 'var(--logo-3)', stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id="dawn-dune-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a1c0c" />
            <stop offset="100%" stopColor="#0d0905" />
          </linearGradient>
          <linearGradient id="dawn-dune-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#140d06" />
            <stop offset="100%" stopColor="#050302" />
          </linearGradient>
        </defs>
      </svg>
      <svg className="dawn-layer dawn-halo" style={box(300, 290, 600, 600)} viewBox="300 290 600 600">
        <circle cx="600" cy="590" r="300" fill="url(#dawn-sun)" />
      </svg>
      <svg className="dawn-layer dawn-sun" style={box(508, 498, 184, 184)} viewBox="508 498 184 184">
        <circle cx="600" cy="590" r="92" fill="url(#dawn-sun)" />
      </svg>
      <svg className="dawn-layer dawn-dune" style={box(0, 520, 1200, 280)} viewBox="0 520 1200 280">
        <path d="M0 610 C 180 560 360 600 560 588 C 780 574 960 532 1200 596 L1200 800 L0 800 Z" fill="url(#dawn-dune-back)" />
      </svg>
      {/* The crest is drawn left to right by a sliding window. */}
      <div className="dawn-layer dawn-wipe" style={box(0, 500, 1200, 140)}>
        <svg className="dawn-wipe-in" viewBox="0 500 1200 140">
          <path className="dawn-crest" d="M0 610 C 180 560 360 600 560 588 C 780 574 960 532 1200 596" fill="none" style={{ stroke: 'var(--logo-2)' }} strokeWidth="2.2" />
        </svg>
      </div>
      <svg className="dawn-layer dawn-dune dawn-dune-front" style={box(0, 610, 1200, 190)} viewBox="0 610 1200 190">
        <path d="M0 690 C 220 640 420 712 650 668 C 880 624 1010 700 1200 662 L1200 800 L0 800 Z" fill="url(#dawn-dune-front)" />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-[12vh]">
        <h1 className="dawn-word font-display font-black tracking-tighter leading-none text-[17vw] md:text-[8.5rem]">
          {WORD.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${0.7 + i * 0.07}s`, backgroundPosition: `${(i / (WORD.length - 1)) * 100}% 50%` }}>{ch}</span>
          ))}
        </h1>
        <span className="dawn-sub mt-3 md:mt-4 font-light uppercase text-[0.7rem] md:text-base">Entertainment</span>
      </div>
    </div>
  );
}
