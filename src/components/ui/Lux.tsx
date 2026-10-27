import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * The section header every destination shares, in the Live Sports language:
 * a tracked kicker, a heavy metal-finish title, a quiet meta line, and a slot
 * on the right for the section's own control (tabs, a search box).
 */
export function LuxHeader({ kicker, title, meta, right, className = '' }: {
  kicker: ReactNode; title: ReactNode; meta?: ReactNode; right?: ReactNode; className?: string;
}) {
  return (
    <header className={`flex flex-col md:flex-row md:items-end justify-between gap-5 mb-8 lux-enter ${className}`}>
      <div className="min-w-0">
        <p className="lux-kicker mb-2">{kicker}</p>
        <h1 className="lux-title text-4xl md:text-6xl pb-1">{title}</h1>
        {meta && <div className="mt-2 text-sm text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</div>}
      </div>
      {right && <div className="shrink-0 self-start md:self-end max-w-full">{right}</div>}
    </header>
  );
}

/** Pill segmented control. `aria-pressed` drives the gold state (see .lux-seg). */
export function LuxSeg<T extends string>({ items, active, onChange, className = '' }: {
  items: { id: NoInfer<T>; label: string; icon?: LucideIcon }[]; active: T; onChange: (id: NoInfer<T>) => void; className?: string;
}) {
  return (
    <div className={`lux-seg ${className}`} role="tablist">
      {items.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={active === id} aria-pressed={active === id}
          onClick={() => onChange(id)} tabIndex={0} data-tv-focusable>
          {Icon && <Icon className="w-4 h-4" />} {label}
        </button>
      ))}
    </div>
  );
}

/** The soft light behind a section header, in the current theme's colours. */
export function LuxGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-72 -z-10 opacity-80"
      style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgb(var(--acc-rgb) / .20), transparent 70%), radial-gradient(50% 60% at 85% 8%, rgb(var(--acc2-rgb) / .22), transparent 72%)', filter: 'blur(8px)' }} />
  );
}

/** A live count for a header meta line: pulsing red dot + text. */
export function LiveMeta({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--lux-live)' }}><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{children}</span>;
}

/**
 * A shelf header: optional kicker over the gold-bar title, a quiet count, and
 * round previous/next buttons on pointer screens (touch and D-pad scroll the
 * rail themselves).
 */
export function RailHeader({ title, kicker, icon, count, unit = "titles", canPrev, canNext, onPrev, onNext }: {
  title: ReactNode; kicker?: ReactNode; icon?: ReactNode; count?: number; unit?: string;
  canPrev?: boolean; canNext?: boolean; onPrev?: () => void; onNext?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div className="min-w-0">
        {kicker && <p className="lux-kicker mb-1.5">{kicker}</p>}
        <h2 className="lux-h text-xl md:text-2xl">{icon}{title}</h2>
      </div>
      {(onPrev || onNext || count) ? (
        <div className="shrink-0 flex items-center gap-2">
          {count ? <span className="hidden sm:inline text-xs font-semibold text-zinc-500 tabular mr-1">{count} {unit}</span> : null}
          {onPrev && (
            <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Scroll back" className="lux-arrow hidden md:inline-flex">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} disabled={!canNext} aria-label="Scroll on" className="lux-arrow hidden md:inline-flex">
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A chapter break on a long page: kicker, display title, a hairline that fades out. */
export function LuxChapter({ kicker, title, note }: { kicker: ReactNode; title: ReactNode; note?: ReactNode }) {
  return (
    <div className="px-4 md:px-12 pt-12 md:pt-16 pb-1 flex items-end gap-5">
      <div className="min-w-0">
        <p className="lux-kicker mb-2">{kicker}</p>
        <h2 className="lux-title text-3xl md:text-5xl pb-1">{title}</h2>
        {note && <p className="mt-1 text-sm text-zinc-400">{note}</p>}
      </div>
      <span aria-hidden className="hidden md:block flex-1 h-px mb-4" style={{ background: 'linear-gradient(90deg, var(--lux-line-2), transparent)' }} />
    </div>
  );
}
