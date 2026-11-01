import { useEffect, useState } from 'react';
import { playSonicLogo } from '../services/sonicLogo';

/**
 * The launch, in time with the Sahrae sound (services/sonicLogo.ts):
 *
 *   0.05  a thread of gold light draws the S out of black
 *   1.02  on the sound's arrival the ribbon lights, and the room fills with
 *         its glow
 *   1.25  SAHRAE settles, its letters drawing together; ENTERTAINMENT beneath
 *   1.90  a sheen crosses the S
 *   3.05  it dissolves into the app
 *
 * The S is the app's icon (assets/icon.svg): one gold ribbon folding into an
 * S. Pure CSS keyframes (index.css .intro-*), transforms and opacity, simpler
 * on TVs and low-power devices; a quick fade for anyone who asked for less motion.
 */
const S_PATH = 'M 650 350 A 138 128 0 1 0 512 520 A 138 128 0 1 1 374 690';
const WORD = 'SAHRAE';

export default function SplashIntro() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');

  useEffect(() => {
    void playSonicLogo();
    const t1 = setTimeout(() => setPhase('out'), reduce ? 600 : 3050);
    const t2 = setTimeout(() => setPhase('done'), reduce ? 950 : 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);

  if (phase === 'done') return null;

  return (
    <div className={`intro fixed inset-0 z-[200] overflow-hidden ${phase === 'out' ? 'intro-out' : ''} ${reduce ? 'intro-still' : ''}`} aria-hidden>
      <div className="intro-glow" />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <svg className="intro-mark" viewBox="200 160 624 704">
          <defs>
            <linearGradient id="intro-gold" gradientUnits="userSpaceOnUse" x1="660" y1="300" x2="370" y2="740">
              <stop offset="0" stopColor="#fff5d6" /><stop offset="0.2" stopColor="#ffd36b" />
              <stop offset="0.43" stopColor="#d48f26" /><stop offset="0.5" stopColor="#8f5512" /><stop offset="0.57" stopColor="#d48f26" />
              <stop offset="0.8" stopColor="#ffcf63" /><stop offset="1" stopColor="#fff0c4" />
            </linearGradient>
            <linearGradient id="intro-sheen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.85" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="intro-ribbon" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
              <path d={S_PATH} fill="none" stroke="#fff" strokeWidth="122" />
            </mask>
          </defs>
          <path className="intro-trace" d={S_PATH} pathLength={1} fill="none" stroke="url(#intro-gold)" strokeWidth="10" strokeLinecap="round" />
          <path className="intro-fill" d={S_PATH} fill="none" stroke="url(#intro-gold)" strokeWidth="122" />
          <g mask="url(#intro-ribbon)">
            <rect className="intro-sweep" x="200" y="160" width="220" height="704" fill="url(#intro-sheen)" />
          </g>
        </svg>
        <h1 className="intro-word font-display font-black leading-none">
          {WORD.split('').map((ch, i) => <span key={i} style={{ animationDelay: `${1.25 + i * 0.05}s` }}>{ch}</span>)}
        </h1>
        <span className="intro-sub font-light uppercase">Entertainment</span>
      </div>
    </div>
  );
}
