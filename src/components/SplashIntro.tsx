import { useEffect, useState } from 'react';
import { playSonicLogo } from '../services/sonicLogo';
import { WORDMARK_H, WORDMARK_LETTERS, WORDMARK_W } from '../brand/wordmark';

/**
 * The opening: stepping into Sahrae. In time with the Sahrae sound
 * (services/sonicLogo.ts):
 *
 *   0.35  out of black, a horizon of light opens across the screen
 *   1.50  on the arrival, light breaks over the horizon and SAHRAE rises out of
 *         it, from the middle outwards, its letters drawing together
 *   2.20  ENTERTAINMENT beneath; a slow sheen passes over the name
 *   3.40  stepping through: the view moves forward through the light into
 *         the app
 *
 * The wordmark is the brand's outlines (brand/wordmark.ts), the same as the
 * app icon. CSS keyframes (index.css .rl-*), transforms and opacity; no
 * drifting dust or blur on TVs and weak graphics; a short fade for reduced motion.
 */
// Letters rise from the middle outwards: H R, then A A, then S E.
const ORDER = [2, 1, 0, 0, 1, 2];
const SPREAD = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];
const DUST = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 61) % 100}%`,
  delay: `${0.4 + ((i * 37) % 23) / 10}s`,
  size: 2 + ((i * 7) % 3),
  drift: `${-40 - ((i * 13) % 60)}px`,
}));

export default function SplashIntro() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');

  useEffect(() => {
    void playSonicLogo();
    const t1 = setTimeout(() => setPhase('out'), reduce ? 700 : 3400);
    const t2 = setTimeout(() => setPhase('done'), reduce ? 1050 : 4250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);

  if (phase === 'done') return null;

  return (
    <div className={`rl fixed inset-0 z-[200] overflow-hidden ${phase === 'out' ? 'rl-through' : ''} ${reduce ? 'rl-still' : ''}`} aria-hidden>
      <div className="rl-stage absolute inset-0">
        <div className="rl-dawn" />
        <div className="rl-dust">
          {DUST.map((d, i) => <span key={i} style={{ left: d.left, width: d.size, height: d.size, animationDelay: d.delay, ['--drift' as string]: d.drift }} />)}
        </div>
        <div className="rl-horizon"><div className="rl-horizon-glow" /><div className="rl-horizon-line" /></div>
        <div className="rl-title">
          <svg className="rl-word" viewBox={`0 0 ${WORDMARK_W} ${WORDMARK_H}`}>
            <defs>
              <linearGradient id="rl-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={WORDMARK_H}>
                <stop offset="0" stopColor="#fff7e2" /><stop offset="0.5" stopColor="#f3cd7c" /><stop offset="1" stopColor="#c58d34" />
              </linearGradient>
              <linearGradient id="rl-sheen" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <mask id="rl-letters" maskUnits="userSpaceOnUse" x="0" y="0" width={WORDMARK_W} height={WORDMARK_H}>
                {WORDMARK_LETTERS.map((d, i) => <path key={i} d={d} fill="#fff" />)}
              </mask>
            </defs>
            {WORDMARK_LETTERS.map((d, i) => (
              <path key={i} className="rl-letter" d={d} fill="url(#rl-gold)"
                style={{ animationDelay: `${1.5 + ORDER[i] * 0.11}s`, ['--spread' as string]: `${SPREAD[i] * 60}px` }} />
            ))}
            <g mask="url(#rl-letters)">
              <rect className="rl-sheen" x="0" y="0" width={WORDMARK_W * 0.35} height={WORDMARK_H} fill="url(#rl-sheen)" />
            </g>
          </svg>
          <span className="rl-sub">Entertainment</span>
        </div>
      </div>
    </div>
  );
}
