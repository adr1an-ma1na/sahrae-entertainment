import { Play, Pause, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { CoverArt } from './CoverArt';

/**
 * The layout primitives Spotify's home is built from, in Sahrae's palette.
 *
 * Four pieces do nearly all the work there, and both Music and Podcasts use the
 * same four so the two pages read as one product:
 *
 *   ShelfHeader — bold title, "Show all" on the right
 *   QuickTile   — the 2-column grid at the top: artwork flush to the tile's left
 *                 edge, one bold line of text, nothing else
 *   ArtCard     — square art, title and subtitle BELOW it, and a round play
 *                 button that lifts out of the artwork on hover
 *   WideRow     — art left, text middle, meta and actions right
 *
 * The play button lifting on hover is the detail that makes a shelf feel like a
 * music app rather than a grid of pictures: it sits inside the artwork, is
 * hidden until wanted, and rises on hover instead of fading in.
 */

export function ShelfHeader({ children, onShowAll, showAllLabel = 'Show all' }: {
  children: ReactNode;
  onShowAll?: () => void;
  showAllLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-4">
      <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">{children}</h3>
      {onShowAll && (
        <button onClick={onShowAll} tabIndex={0} data-tv-focusable
          className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded px-1 py-0.5">
          {showAllLabel}
        </button>
      )}
    </div>
  );
}

/** Horizontal scrolling rail. Cards keep their width; the rail scrolls. */
export function Shelf({ children }: { children: ReactNode }) {
  return (
    <div className="flex overflow-x-auto gap-4 pb-3 -mx-1 px-1 scrollbar-hide snap-x">
      {children}
    </div>
  );
}

/**
 * Spotify's signature quick-access tile: a short wide block, artwork square and
 * flush to the left edge (no padding around it), one bold line of text. Two per
 * row on desktop, one on a phone.
 */
export function QuickTile({ title, artwork, dominantColor, onClick, active, icon }: {
  title: string;
  artwork?: string;
  dominantColor?: string;
  onClick: () => void;
  active?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button onClick={onClick} tabIndex={0} data-tv-focusable aria-label={title}
      className={`group flex items-center gap-3 rounded-md overflow-hidden h-16 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        active ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
      }`}>
      <span className="w-16 h-16 shrink-0 relative bg-zinc-800 flex items-center justify-center">
        {artwork || dominantColor
          ? <CoverArt imageUrl={artwork} dominantColor={dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
          : icon}
      </span>
      <span className="font-bold text-sm text-white truncate pr-3 flex-1">{title}</span>
      {/* Appears on hover, the way Spotify's does — a quiet affordance, not a
          permanent button competing with the title. */}
      <span className="mr-3 w-9 h-9 rounded-full btn-sauti hidden sm:flex items-center justify-center shrink-0 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 transition-all duration-200 shadow-lg">
        <Play className="w-4 h-4 fill-current ml-0.5" />
      </span>
    </button>
  );
}

/**
 * Square artwork, title and subtitle below it. `round` gives the circular
 * artwork Spotify uses for artists.
 */
export function ArtCard({ title, subtitle, artwork, dominantColor, onClick, onPlay, playing, round, width = 'w-[160px] md:w-[176px]' }: {
  title: string;
  subtitle?: string;
  artwork?: string;
  dominantColor?: string;
  onClick: () => void;
  onPlay?: () => void;
  playing?: boolean;
  round?: boolean;
  width?: string;
}) {
  return (
    <div onClick={onClick} tabIndex={0} data-tv-focusable role="button" aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group relative shrink-0 snap-start ${width} p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}>
      <div className={`relative w-full aspect-square mb-3 overflow-hidden bg-zinc-800 shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${round ? 'rounded-full' : 'rounded-md'}`}>
        <CoverArt imageUrl={artwork} dominantColor={dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        {onPlay && (
          <button onClick={(e) => { e.stopPropagation(); onPlay(); }} tabIndex={-1}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            className="absolute bottom-2 right-2 w-11 h-11 rounded-full btn-sauti flex items-center justify-center shadow-[0_8px_18px_rgba(0,0,0,0.5)] opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
            {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>
        )}
      </div>
      <p className="text-sm font-bold text-white truncate">{title}</p>
      {subtitle && <p className="text-xs text-zinc-400 truncate mt-0.5 leading-snug">{subtitle}</p>}
    </div>
  );
}

/** Art left, text middle, meta/actions right — episode rows and chart rows. */
export function WideRow({ title, subtitle, artwork, dominantColor, meta, progress, onClick, onPlay, playing, rank, children }: {
  title: string;
  subtitle?: string;
  artwork?: string;
  dominantColor?: string;
  meta?: string;
  progress?: number;
  onClick: () => void;
  onPlay?: () => void;
  playing?: boolean;
  rank?: number;
  children?: ReactNode;
}) {
  return (
    <div onClick={onClick} tabIndex={0} data-tv-focusable role="button" aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onClick(); } }}
      className="group flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.07] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
      {typeof rank === 'number' && (
        <span className="w-6 text-center text-sm font-display font-extrabold text-zinc-500 tabular shrink-0">{rank}</span>
      )}
      <div className="w-14 h-14 rounded-md overflow-hidden bg-zinc-800 shrink-0 relative">
        <CoverArt imageUrl={artwork} dominantColor={dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">{title}</p>
        {subtitle && <p className="text-xs text-zinc-500 truncate mt-0.5">{subtitle}</p>}
        {meta && <p className="text-[11px] text-zinc-500 truncate mt-1 tabular">{meta}</p>}
        {typeof progress === 'number' && progress > 0 && (
          <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1.5 max-w-[200px]">
            <div className="h-full bg-sauti rounded-full" style={{ width: `${Math.min(100, progress)}%` }} />
          </div>
        )}
      </div>
      {children}
      {onPlay && (
        <button onClick={(e) => { e.stopPropagation(); onPlay(); }}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          className="btn-sauti w-10 h-10 rounded-full flex items-center justify-center shrink-0">
          {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>
      )}
    </div>
  );
}

/** Skeleton matching ArtCard's shape, so loading doesn't shift the layout. */
export function CardSkeleton({ count = 6, width = 'w-[160px] md:w-[176px]' }: { count?: number; width?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`shrink-0 ${width} p-3 animate-pulse`}>
          <div className="w-full aspect-square rounded-md bg-white/5 mb-3" />
          <div className="h-3 rounded bg-white/5 w-4/5 mb-1.5" />
          <div className="h-2.5 rounded bg-white/5 w-2/5" />
        </div>
      ))}
    </>
  );
}

/** Time-of-day greeting — Spotify's home opens with one. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export { ChevronRight };
