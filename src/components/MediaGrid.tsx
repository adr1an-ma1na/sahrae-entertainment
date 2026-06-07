import { Play, Star, Trash2 } from 'lucide-react';
import { MediaItem, getImageUrl, Genre } from '../services/tmdb';

interface MediaGridProps {
  title: string;
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  defaultType?: 'movie' | 'tv';
  genres?: Genre[];
  selectedGenre?: number | null;
  onGenreSelect?: (id: number | null) => void;
  showRanking?: boolean;
  /** When provided, each card shows a delete button that calls this (e.g. My List). */
  onRemove?: (item: MediaItem) => void;
}

export default function MediaGrid({ title, items, onPlay, defaultType = 'movie', genres, selectedGenre, onGenreSelect, showRanking = false, onRemove }: MediaGridProps) {
  if (!items || items.length === 0) {
    return (
      <div className="pt-32 px-4 md:px-12 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
        <p className="text-zinc-400">No results found.</p>
      </div>
    );
  }

  return (
    <div className="pt-32 px-4 md:px-12 pb-12">
      <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-6 tracking-tight">{title}</h2>
      
      {genres && genres.length > 0 && onGenreSelect && (
        <div className="flex overflow-x-auto gap-2 pb-6 scrollbar-hide">
          <button
            onClick={() => onGenreSelect(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedGenre === null ? 'bg-amber-500 text-amber-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {genres.map(genre => (
            <button
              key={genre.id}
              onClick={() => onGenreSelect(genre.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedGenre === genre.id ? 'bg-amber-500 text-amber-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-5">
        {items.map((item) => {
          const type = item.media_type || defaultType;
          return (
            <div
              key={`${type}-${item.id}`}
              tabIndex={0}
              data-tv-focusable
              role="button"
              aria-label={item.title || item.name}
              className="relative aspect-[2/3] rounded-xl overflow-hidden group cursor-pointer bg-zinc-900 border border-white/5 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:border-white/20 hover:z-10 focus:outline-none"
              onClick={() => onPlay(item.id, type, true)}
            >
              <img
                src={getImageUrl(item.poster_path)}
                alt={item.title || item.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />

              {/* Remove button (e.g. My List) — always visible so it works on touch */}
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                  className="absolute top-2 left-2 z-30 p-1.5 bg-black/70 hover:bg-red-500 text-white rounded-full transition-colors shadow-lg backdrop-blur-sm border border-white/10"
                  title="Remove from My List"
                  aria-label="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Rating Badge */}
              {item.vote_average ? (
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-500 border border-white/10 shadow-lg z-20 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  <span>{item.vote_average.toFixed(1)}</span>
                </div>
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                <h3 className="text-white font-display font-medium text-xs md:text-sm line-clamp-2 mb-1.5 drop-shadow-md">
                  {item.title || item.name}
                </h3>
                <div className="flex items-center gap-2">
                  <button className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center hover:bg-amber-400 hover:scale-110 transition-all shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                    <Play className="w-3 h-3 md:w-4 md:h-4 fill-current ml-0.5" />
                  </button>
                  <span className="text-[10px] md:text-xs text-zinc-300 font-medium drop-shadow-md">
                    {item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
