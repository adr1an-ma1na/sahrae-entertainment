import { MediaItem, Genre } from '../services/tmdb';
import PosterCard from './PosterCard';

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
      <div className="flex items-center gap-3 mb-6">
        <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
        <h2 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">{title}</h2>
      </div>
      
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

      <div className="flex flex-wrap gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4">
        {items.map((item) => {
          const type = item.media_type || defaultType;
          return (
            <PosterCard
              key={`${type}-${item.id}`}
              item={item}
              type={type}
              onPlay={() => onPlay(item.id, type, true)}
              onRemove={onRemove ? () => onRemove(item) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
