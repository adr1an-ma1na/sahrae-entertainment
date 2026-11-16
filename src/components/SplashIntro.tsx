import { useEffect, useState, type CSSProperties } from 'react';
import { Capacitor } from '@capacitor/core';
import { isTelevision } from '../tv/spatialNavigation';

/**
 * The launch: Horizon (owner's choice, 2026-11-16, from three proposals; the
 * desert dawn and its sun kept). Darkness with a little film grain and the last
 * stars; a spark on the horizon opens into a line of gold; the sky warms from
 * the horizon up while the sun crests behind it with a long light streak; then
 * SAHRAE, lit from above, settles in fine wide gold letters over a thin rule
 * and ENTERTAINMENT. Nothing snaps: every part keeps easing until the app.
 *
 * Every moving part is its own layer, moved by transform or opacity only, so
 * the graphics chip does the work (one SVG with moving shapes stuttered on a
 * TV, owner 2026-11-02). On a TV and on weak phones (html.tv-mode / low-gfx)
 * the parts that need redrawing each frame are left out: the grain, the
 * letters' light sweep and the gleam; the word fades in instead. Anyone who
 * asked for less motion gets the finished scene and a quick fade.
 * Colours follow the theme (--logo-*, --acc-*).
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

/** Film grain: one small tile of noise, made once and moved in steps (never redrawn). */
let grainUrl = '';
function grainTile(): string {
  if (grainUrl) return grainUrl;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (!g) return '';
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainUrl = c.toDataURL();
  } catch { grainUrl = ''; }
  return grainUrl;
}

/** When the scene has finished arriving: the name is lit and the sun is up. */
const SETTLED_MS = 3600;
/** When the fade into the app starts on the website. */
const OUT_MS = 4300;
const FADE_MS = 800;

/**
 * `onShown` is called once the opening is really on screen. The app builds the
 * home page under it only then: on a TV, building it first held the screen
 * for longer than the whole intro (owner, TCL, 2026-11-01). In the apps and on
 * a TV even building it during the opening stalls the opening, so there it is
 * built once the scene has settled, under its still frame, and the opening
 * fades only after the home page has been drawn.
 */
export default function SplashIntro({ onShown }: { onShown?: () => void } = {}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => (playedThisVisit() ? 'done' : 'in'));
  const [unit] = useState(() => (typeof window === 'undefined' ? 10 : sceneUnit()));
  const [stars] = useState(() => (typeof window === 'undefined' ? '' : starShadows()));
  const native = Capacitor.isNativePlatform();
  const plain = typeof document !== 'undefined' && (isTelevision() || document.documentElement.classList.contains('low-gfx'));
  const [grain] = useState(() => (typeof window === 'undefined' || plain || native || reduce ? '' : grainTile()));

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
            t2 = window.setTimeout(() => setPhase('done'), FADE_MS);
          });
        }, SETTLED_MS);
        return;
      }
      onShown?.();
      t1 = window.setTimeout(() => setPhase('out'), reduce ? 500 : OUT_MS);
      t2 = window.setTimeout(() => setPhase('done'), reduce ? 850 : OUT_MS + FADE_MS);
    };
    // Two frames: the first is drawn by the time the second is asked for.
    const raf = requestAnimationFrame(() => requestAnimationFrame(start));
    const safety = window.setTimeout(start, 400); // a page in the background draws no frames
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(raf2); clearTimeout(safety); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  if (phase === 'done') return null;

  const cls = ['hz fixed inset-0 z-[200] overflow-hidden', plain ? 'hz-plain' : '', phase === 'out' ? 'hz-out' : '', reduce ? 'hz-still' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ '--s': `${unit}px` } as CSSProperties} aria-hidden>
      <div className="hz-scene">
        <div className="hz-stars" style={{ boxShadow: stars }} />
        <div className="hz-dawn" />
        <div className="hz-sunmask"><div className="hz-halo" /><div className="hz-sun" /></div>
        <div className="hz-ground" />
        <div className="hz-spill" />
        <div className="hz-bloom" />
        <div className="hz-line" />
        <div className="hz-streak" />
        <div className="hz-spark" />
        <div className="hz-title">
          <h1 className="hz-word">{WORD}{!plain && <span className="hz-sheen">{WORD}</span>}</h1>
          <div className="hz-rule" />
          <span className="hz-sub">Entertainment</span>
        </div>
      </div>
      {grain && <div className="hz-grain" style={{ backgroundImage: `url(${grain})` }} />}
      <div className="hz-vignette" />
    </div>
  );
}
