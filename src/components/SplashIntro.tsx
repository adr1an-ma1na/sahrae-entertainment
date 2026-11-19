import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Capacitor } from '@capacitor/core';
import { isTelevision } from '../tv/spatialNavigation';
import { t as tr } from '../i18n';
import { diveSound, playIntro, releaseIntro, stopIntro } from '../services/introSound';

/**
 * The launch: Horizon (owner's choice, 2026-11-16, from three proposals; the
 * desert dawn and its sun kept). Darkness and the last stars; a spark on the
 * horizon opens into a line of gold; the sky warms from the horizon up while
 * the sun crests behind it with a long light streak; then SAHRAE lands in
 * gold over a thin rule and ENTERTAINMENT, and the viewer is welcomed.
 *
 * Every moving part is its own layer, moved by transform or opacity only, so
 * the graphics chip does the work (one SVG with moving shapes stuttered on a
 * TV, owner 2026-11-02). On a TV and on weak phones (html.tv-mode / low-gfx)
 * the light sweeping over the letters is left out. Anyone who asked for less
 * motion gets the finished scene, no sound, and a quick fade.
 * Colours follow the theme (--logo-*, --acc-*).
 *
 * In depth (owner, 2026-11-17: "3D motion graphics that is interactive"):
 * the layers sit at real distances (stars far, the name near) and the scene
 * turns toward the mouse, a finger, the phone's tilt or the remote's arrows.
 * A tap or OK enters the app.
 * Every layer is a flat plane turned by the graphics chip; the planes are
 * scaled so that, facing straight on, the scene is exactly as before.
 *
 * Smooth, at Netflix's pace, with sound (owner, 2026-11-19: "very laggy …
 * giving off cheap"). The lag was work redrawn every frame on the page's own
 * thread while the home page was being built under it: the name's spacing and
 * reveal mask, the light sweeping over the letters, the sand, the moving grain
 * and the closing circle mask. Now every moving part only moves, grows or
 * fades, which the graphics chip does alone, so nothing the page is doing can
 * hold it up; the sweep is a window moving over a still copy of the name, the
 * ending a burst of light from the sun. Four seconds in all, as Netflix's is,
 * and its sound (services/introSound) starts with the first frame on the same
 * clock: the warp rises as the light opens, lands as SAHRAE does (HIT), and
 * rushes as the camera dives into the sun. Then the viewer is welcomed by name.
 */
const WORD = 'SAHRAE';

/**
 * The intro plays once per visit. A reload (a newer library from the cloud, a
 * language change, recovering from an error) does not play it again; opening
 * the app afresh does.
 */
const PLAYED_KEY = 'sahrae.introPlayed';
const playedThisVisit = () => { try { return sessionStorage.getItem(PLAYED_KEY) === '1'; } catch { return false; } };

/** One scene unit: a hundredth of the largest 16:9 frame that fits the screen's width. */
const sceneUnit = () => {
  const el = document.documentElement;
  const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
  return Math.min(w, (h * 16) / 9) / 100;
};

/** The last stars: one dot with many shadows, placed once. */
function starShadows(): string {
  const w = window.innerWidth, h = window.innerHeight;
  const out: string[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 64; i++) {
    const x = Math.round(rnd() * w), y = Math.round(rnd() * h * 0.55), a = (0.2 + rnd() * 0.55).toFixed(2);
    out.push(`${x}px ${y}px 0 ${rnd() < 0.15 ? 1 : 0}px rgba(255,240,220,${a})`);
  }
  return out.join(',');
}

/** When the scene has finished arriving: the name is lit, the sun is up, the viewer welcomed (index.css .hz-*). */
const SETTLED_MS = 2900;
/** When the dive into the app starts on the website. */
const OUT_MS = 3150;
/** The dive into the sun that opens onto the app: four seconds in all. */
const FADE_MS = 850;

/**
 * `onShown` is called once the opening is really on screen. The app builds the
 * home page under it only then: on a TV, building it first held the screen
 * for longer than the whole intro (owner, TCL, 2026-11-01). In the apps and on
 * a TV even building it during the opening stalls the opening, so there it is
 * built once the scene has settled, under its still frame, and the opening
 * fades only after the home page has been drawn.
 */
/** A layer at depth `z` (px; negative is further away), scaled to look the same size head-on. */
const PERSPECTIVE = 900;
const plane = (z: number): CSSProperties => ({ transform: `translateZ(${z}px) scale(${((PERSPECTIVE - z) / PERSPECTIVE).toFixed(4)})` });

/** "Good evening, Amina. Welcome back." Or, the first time on this device, "Welcome to Sahrae, Amina." */
const WELCOMED_KEY = 'sahrae.welcomed.v1';
function welcomeLine(name?: string, profileId?: string): string {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) return '';
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(WELCOMED_KEY) || '[]'); } catch { /* none */ }
  const id = profileId || first;
  if (!seen.includes(id)) {
    try { localStorage.setItem(WELCOMED_KEY, JSON.stringify([...seen, id].slice(-20))); } catch { /* asked again next time */ }
    return `${tr('Welcome to Sahrae')}, ${first}.`;
  }
  const h = new Date().getHours();
  const part = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 22 ? 'Good evening' : 'Hello';
  return `${tr(part)}, ${first}. ${tr('Welcome back.')}`;
}

export default function SplashIntro({ onShown, name, profileId }: { onShown?: () => void; name?: string; profileId?: string } = {}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => (playedThisVisit() ? 'done' : 'in'));
  const [unit] = useState(() => (typeof window === 'undefined' ? 10 : sceneUnit()));
  const [stars] = useState(() => (typeof window === 'undefined' ? '' : starShadows()));
  const native = Capacitor.isNativePlatform();
  const plain = typeof document !== 'undefined' && (isTelevision() || document.documentElement.classList.contains('low-gfx'));
  const [hello] = useState(() => (typeof window === 'undefined' || playedThisVisit() ? '' : welcomeLine(name, profileId)));
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const showOnce = () => { if (shownRef.current) return; shownRef.current = true; onShown?.(); };
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (playedThisVisit()) { showOnce(); return; }
    const out = () => { setPhase('out'); diveSound(); releaseIntro(); };
    let t1 = 0, t2 = 0, raf2 = 0, started = false;
    const twoFrames = (fn: () => void) => { raf2 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(fn); }); };
    const start = () => {
      if (started) return;
      started = true;
      try { sessionStorage.setItem(PLAYED_KEY, '1'); } catch { /* plays again next reload */ }
      // The scene's clock starts here, the sound's with it.
      rootRef.current?.classList.add('hz-go');
      if (!reduce) playIntro(performance.now());
      if ((isTelevision() || native) && !reduce) {
        t1 = window.setTimeout(() => {
          showOnce();
          twoFrames(() => {
            out();
            t2 = window.setTimeout(() => setPhase('done'), FADE_MS);
          });
        }, SETTLED_MS);
        return;
      }
      showOnce();
      t1 = window.setTimeout(out, reduce ? 500 : OUT_MS);
      t2 = window.setTimeout(() => setPhase('done'), reduce ? 850 : OUT_MS + FADE_MS);
    };
    // A tap or OK enters the app at once.
    skipRef.current = () => {
      start();
      clearTimeout(t1); clearTimeout(t2);
      showOnce();
      stopIntro(0.35);
      twoFrames(() => {
        setPhase('out');
        t2 = window.setTimeout(() => setPhase('done'), FADE_MS);
      });
    };
    // Two frames: the first is drawn by the time the second is asked for.
    const raf = requestAnimationFrame(() => requestAnimationFrame(start));
    const safety = window.setTimeout(start, 400); // a page in the background draws no frames
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); clearTimeout(safety); clearTimeout(t1); clearTimeout(t2); stopIntro(0.2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // The scene turns toward the mouse, a finger, the phone's tilt or the remote.
  useEffect(() => {
    if (phase === 'done' || reduce) return;
    const world = worldRef.current;
    if (!world) return;
    // Up and down a little less than side to side: the name sits low, near the bottom of the frame.
    const maxY = plain ? 5 : 9, maxX = plain ? 2 : 3;
    let tx = 0, ty = 0, back = 0;
    const aim = (nx: number, ny: number) => {
      tx = Math.max(-1, Math.min(1, nx)); ty = Math.max(-1, Math.min(1, ny));
      world.style.setProperty('--ry', `${(tx * maxY).toFixed(2)}deg`);
      world.style.setProperty('--rx', `${(-ty * maxX).toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent) => aim(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
    const onTilt = (e: DeviceOrientationEvent) => { if (e.gamma == null || e.beta == null) return; aim(e.gamma / 30, (e.beta - 45) / 30); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'Enter' || k === ' ' || k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); skipRef.current(); return; }
      const d: Record<string, [number, number]> = { ArrowLeft: [-0.6, 0], ArrowRight: [0.6, 0], ArrowUp: [0, -0.6], ArrowDown: [0, 0.6] };
      if (!d[k]) return;
      e.preventDefault(); e.stopImmediatePropagation();
      aim(tx + d[k][0], ty + d[k][1]);
      window.clearTimeout(back);
      back = window.setTimeout(() => aim(0, 0), 1400);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(back);
    };
  }, [phase === 'done', reduce, plain]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') return null;

  const cls = ['hz fixed inset-0 z-[200] overflow-hidden', plain ? 'hz-plain' : '', phase === 'out' ? 'hz-out' : '', reduce ? 'hz-still' : ''].filter(Boolean).join(' ');
  return (
    <div ref={rootRef} className={cls} style={{ '--s': `${unit}px` } as CSSProperties} aria-hidden onClick={() => skipRef.current()}>
      <div className="hz-scene">
        <div className="hz-world" ref={worldRef}>
          <div className="hz-plane" style={plane(-420)}><div className="hz-stars" style={{ boxShadow: stars }} /></div>
          <div className="hz-plane" style={plane(-260)}><div className="hz-dawn" /></div>
          <div className="hz-plane" style={plane(-200)}><div className="hz-sunmask"><div className="hz-halo" /><div className="hz-sun" /></div></div>
          <div className="hz-plane" style={plane(-120)}>
            <div className="hz-ground" />
            <div className="hz-spill" />
            <div className="hz-bloom" />
            <div className="hz-line" />
            <div className="hz-streak" />
            <div className="hz-spark" />
          </div>
          <div className="hz-plane" style={plane(140)}>
            <div className="hz-title">
              {/* The sweep of light: a window moving over a still, brighter copy of the name. */}
              <h1 className="hz-word">{WORD}{!plain && <span className="hz-sheenwin"><span className="hz-sheen">{WORD}</span></span>}</h1>
              <div className="hz-rule" />
              <span className="hz-sub">Entertainment</span>
              {hello && <p className="hz-hello">{hello}</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="hz-vignette" />
      {/* The ending: light bursting from the sun, opening onto the app. */}
      <div className="hz-flash" />
    </div>
  );
}
