import { useEffect, useState } from 'react';

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

export default function SplashIntro() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('out'), reduce ? 500 : 2150);
    const t2 = setTimeout(() => setPhase('done'), reduce ? 850 : 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);

  if (phase === 'done') return null;

  return (
    <div className={`dawn fixed inset-0 z-[200] overflow-hidden ${phase === 'out' ? 'dawn-out' : ''} ${reduce ? 'dawn-still' : ''}`} aria-hidden>
      <div className="dawn-sky" />
      <svg className="dawn-scene" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice">
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
        <circle className="dawn-halo" cx="600" cy="590" r="300" fill="url(#dawn-sun)" />
        <circle className="dawn-sun" cx="600" cy="590" r="92" fill="url(#dawn-sun)" />
        <path className="dawn-dune dawn-dune-back" d="M0 610 C 180 560 360 600 560 588 C 780 574 960 532 1200 596 L1200 800 L0 800 Z" fill="url(#dawn-dune-back)" />
        <path className="dawn-crest" d="M0 610 C 180 560 360 600 560 588 C 780 574 960 532 1200 596" fill="none" style={{ stroke: 'var(--logo-2)' }} strokeWidth="2.2" />
        <path className="dawn-dune dawn-dune-front" d="M0 690 C 220 640 420 712 650 668 C 880 624 1010 700 1200 662 L1200 800 L0 800 Z" fill="url(#dawn-dune-front)" />
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
