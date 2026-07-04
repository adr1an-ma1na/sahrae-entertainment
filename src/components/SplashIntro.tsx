import { useEffect, useState } from 'react';

/**
 * Cinematic launch intro. Plays once on cold start: an aurora bloom, the SAHRAE
 * wordmark revealing with a gold shimmer sweep, the tracked-out "ENTERTAINMENT"
 * subtitle, and a drawing gold underline — then the whole thing fades to reveal
 * the app. Pure CSS keyframes (see index.css) so it's smooth on low-end devices.
 */
export default function SplashIntro() {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>('in');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('out'), 1500);
    const t2 = setTimeout(() => setPhase('done'), 2050);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#070708] ${phase === 'out' ? 'splash-out' : ''}`}
      aria-hidden
    >
      <div className="splash-aurora" />
      <div className="relative flex flex-col items-center px-6">
        <h1 className="splash-word font-display font-black tracking-tighter leading-none text-[16vw] md:text-[8.5rem]">SAHRAE</h1>
        <span className="splash-sub mt-2 md:mt-3 text-white/70 font-light uppercase tracking-[0.55em] text-[0.7rem] md:text-base">Entertainment</span>
        <div className="splash-line mt-7 md:mt-9" />
      </div>
    </div>
  );
}
