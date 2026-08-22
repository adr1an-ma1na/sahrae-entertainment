import { Play, Star, Trash2 } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';

/**
 * Single shared movie/series poster card — used by every shelf and grid (Home,
 * Movies, Series, Search, My List) so sizing is consistent everywhere.
 * 2:3 poster, title + year BELOW the art. Responsive widths:
 *   mobile 120 · tablet 140 · laptop 160 · TV 180  (px)
 */
export default function PosterCard({ item, type, onPlay, onRemove }: {
  item: MediaItem;
  type: 'movie' | 'tv';
  onPlay: () => void;
  onRemove?: () => void;
}) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  return (
    <div
      tabIndex={0}
      data-tv-focusable
      data-media-type={type}
      role="button"
      aria-label={item.title || item.name}
      onClick={onPlay}
      className="poster-card group flex-none w-[120px] md:w-[140px] lg:w-[160px] xl:w-[180px] snap-start cursor-pointer focus:outline-none"
    >
      {/* Lift + shadow, not just scale: a card that rises off the page reads as
          physical, and the shadow separates it from the poster behind it in a
          dense rail. The easing matches the app's --ease-premium curve. */}
      <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-zinc-900 border border-white/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06] group-hover:-translate-y-1 group-hover:border-amber-400/60 group-hover:shadow-[0_18px_38px_rgba(0,0,0,0.6)] group-focus-visible:scale-[1.06] group-focus-visible:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-amber-400">
        <img
          src={getImageUrl(item.poster_path)}
          alt={item.title || item.name}
          // Fade in once decoded. Posters used to pop in one by one as they
          // arrived, which makes a scrolling rail feel jumpy.
          className="w-full h-full object-cover opacity-0 transition-opacity duration-500"
          loading="lazy"
          onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
        />
        {item.vote_average ? (
          <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400 border border-white/10 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-current" /><span>{item.vote_average.toFixed(1)}</span>
          </div>
        ) : null}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute top-1.5 left-1.5 z-10 p-1.5 bg-black/70 hover:bg-red-500 text-white rounded-full transition-colors border border-white/10"
            title="Remove" aria-label="Remove"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        {/* A gradient from the foot of the card rather than a flat wash — it
            keeps the artwork readable while still seating the play button. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <span className="btn-gold w-9 h-9 rounded-full flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 group-focus-visible:scale-100 transition-transform duration-300"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
        </div>
      </div>
      <p className="mt-1.5 text-[13px] font-semibold text-white truncate leading-tight group-hover:text-amber-300 transition-colors">{item.title || item.name}</p>
      {year ? <p className="text-[11px] text-zinc-400 truncate">{year}</p> : null}
    </div>
  );
}
