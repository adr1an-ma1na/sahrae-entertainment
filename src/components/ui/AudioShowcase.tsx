import type { ReactNode } from 'react';
import { CoverArt } from './CoverArt';
import { useShowcase } from '../../hooks/useShowcase';
import { haptics } from '../../services/haptics';

export interface ShowcaseAction { label: string; icon?: ReactNode; onClick: () => void }
export interface ShowcaseSlide {
  id: string;
  kicker: string;
  title: string;
  subtitle?: string;
  art?: string;
  tint?: string;
  /** 0 to 100: how far through, for an episode in progress. */
  progress?: number;
  note?: string;
  primary: ShowcaseAction;
  secondary?: ShowcaseAction;
}

const SLIDE_MS = 8000;

/**
 * The top of Music and Podcasts, in the Home language: one thing at a time,
 * its artwork blown up into the room's light and set on a pedestal, with a
 * kicker, a metal title and two actions. A timer bar per slide; it holds still
 * on pointer, focus, off screen and under reduced motion (useShowcase).
 */
export default function AudioShowcase({ slides, label }: { slides: ShowcaseSlide[]; label: string }) {
  const { ref, idx, go, running, hold } = useShowcase<HTMLElement>(slides.length, SLIDE_MS);
  if (!slides.length) return null;
  const s = slides[idx];

  return (
    <section ref={ref} aria-label={label} {...hold}
      className="lux-stage relative overflow-hidden rounded-[2rem] mb-9 min-h-[300px] md:min-h-[380px] shadow-[inset_0_0_0_1px_var(--lux-line-2),0_30px_70px_-28px_rgba(0,0,0,0.75)]">
      {slides.map((x, n) => (
        <div key={x.id} aria-hidden className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${n === idx ? 'opacity-100' : 'opacity-0'}`}>
          {x.art && <img src={x.art} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-70" />}
          <div className="absolute inset-0" style={{ background: `radial-gradient(80% 90% at 85% 40%, ${x.tint || 'rgb(var(--acc-rgb) / .35)'}, transparent 70%)`, opacity: 0.75 }} />
        </div>
      ))}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      <div className="relative flex items-center gap-6 md:gap-10 p-6 md:p-10 min-h-[300px] md:min-h-[380px]">
        <div key={s.id} className="min-w-0 flex-1 lux-enter">
          <p className="lux-kicker mb-3">{s.kicker}</p>
          <h2 className="lux-title text-3xl md:text-5xl pb-1 line-clamp-2">{s.title}</h2>
          {s.subtitle && <p className="mt-2 text-sm md:text-base text-zinc-300 line-clamp-2 max-w-xl">{s.subtitle}</p>}
          {typeof s.progress === 'number' && (
            <div className="mt-4 max-w-xs">
              <div className="h-1 rounded-full bg-white/15 overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(2, Math.min(100, s.progress))}%` }} /></div>
              {s.note && <p className="mt-1.5 text-xs font-semibold text-zinc-400 tabular">{s.note}</p>}
            </div>
          )}
          {typeof s.progress !== 'number' && s.note && <p className="mt-3 text-xs font-semibold text-zinc-400">{s.note}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={() => { haptics.press(); s.primary.onClick(); }} data-tv-focusable className="lux-btn px-6 md:px-7 py-3 text-sm md:text-base">
              {s.primary.icon}{s.primary.label}
            </button>
            {s.secondary && (
              <button onClick={() => { haptics.tap(); s.secondary!.onClick(); }} data-tv-focusable className="btn-glass px-5 py-3 rounded-full font-bold text-sm md:text-base flex items-center gap-2">
                {s.secondary.icon}{s.secondary.label}
              </button>
            )}
          </div>
          {slides.length > 1 && (
            <div className="mt-7 flex gap-2 w-full max-w-[200px]" role="tablist" aria-label={label}>
              {slides.map((x, n) => (
                <button key={x.id} type="button" role="tab" aria-selected={n === idx} aria-label={`Show ${x.title}`} data-tv-focusable
                  onClick={() => { haptics.tap(); go(n); }} className="flex-1 py-2 focus:outline-none group">
                  <span className="block h-[3px] rounded-full bg-[#fff]/20 overflow-hidden group-focus-visible:ring-2 group-focus-visible:ring-amber-400">
                    <span
                      key={n === idx ? `on-${idx}-${running}` : 'off'}
                      className={`block h-full origin-left rounded-full ${n === idx ? (running ? 'lux-slide-fill' : 'bg-amber-400') : 'scale-x-0'}`}
                      style={n === idx && running ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* The artwork on a pedestal: lit rim, soft reflection below. */}
        <div key={`art-${s.id}`} className="hidden sm:block shrink-0 w-40 md:w-64 lux-enter">
          <div className="relative aspect-square rounded-2xl overflow-hidden shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.12)]">
            <CoverArt imageUrl={s.art} dominantColor={s.tint} rounded="" className="absolute inset-0 w-full h-full" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
          </div>
          <div aria-hidden className="h-10 mt-1 rounded-2xl opacity-25 blur-md" style={{ background: `linear-gradient(180deg, ${s.tint || 'rgb(var(--acc-rgb) / .5)'}, transparent)` }} />
        </div>
      </div>
    </section>
  );
}
