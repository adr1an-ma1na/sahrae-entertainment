import { Play, Info, Star, Film } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';

interface HeroProps {
  item: MediaItem | null;
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean) => void;
}

export default function Hero({ item, onPlay }: HeroProps) {
  if (!item) return <div className="h-[85vh] bg-zinc-950 skeleton"></div>;

  const title = item.title || item.name;
  const type = item.media_type || 'movie';

  return (
    <div className="relative h-[85vh] w-full overflow-hidden bg-zinc-950">
      {/* Background Media */}
      <div className="absolute inset-0">
        <img
          src={getImageUrl(item.backdrop_path, 'original')}
          alt={title}
          className="w-full h-full object-cover kenburns"
        />

        {/* Dynamic Glow from Poster mapping (top color cast) */}
        <div className="absolute top-0 left-0 right-0 h-[80%] opacity-50 blur-[120px] mix-blend-screen z-10 pointer-events-none animate-pulse duration-[8000ms]">
          <img src={getImageUrl(item.poster_path, 'w500')} className="w-full h-full object-cover opacity-60" alt="" />
        </div>

        {/* Cinematic gradient scrims — side + deep bottom letterbox */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-black/70 to-black z-10 hidden md:block opacity-70"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent z-10"></div>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent z-10"></div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 w-full px-4 md:px-12 pb-24 md:pb-32 pt-32 z-20">
        <div className="max-w-2xl">
          <div className="overline mb-3 flex items-center gap-2.5">
            <span className="inline-block w-7 h-px bg-amber-400/70" />
            Featured {type === 'movie' ? 'Film' : 'Series'}
          </div>

          <h1 className="font-display font-extrabold text-white mb-4 leading-[1.03] drop-shadow-2xl tracking-tight text-4xl md:text-6xl lg:text-7xl">
            {title}
          </h1>

          <div className="flex items-center flex-wrap gap-2.5 mb-5">
            {item.vote_average ? (
              <span className="chip inline-flex items-center gap-1.5 px-2.5 py-1 text-amber-400 text-sm font-semibold tabular">
                <Star className="w-3.5 h-3.5 fill-current" /> {item.vote_average.toFixed(1)}
              </span>
            ) : null}
            {(item.release_date || item.first_air_date) && (
              <span className="chip px-2.5 py-1 text-zinc-200 text-sm font-medium tabular">
                {(item.release_date || item.first_air_date || '').slice(0, 4)}
              </span>
            )}
            <span className="chip px-2.5 py-1 text-zinc-200 text-sm font-medium uppercase tracking-wide">
              {type === 'movie' ? 'Movie' : 'Series'}
            </span>
          </div>

          <p className="text-zinc-300 text-base md:text-xl mb-8 line-clamp-3 max-w-xl drop-shadow-lg leading-relaxed">
            {item.overview}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => onPlay(item.id, type, false)}
              className="btn-gold flex items-center justify-center gap-2 px-7 md:px-9 py-3 rounded-xl font-bold text-lg hover:scale-[1.03]"
            >
              <Play className="w-6 h-6 fill-current" />
              Play
            </button>
            <button
              onClick={() => onPlay(item.id, type, true, true)}
              className="btn-glass flex items-center justify-center gap-2 px-7 md:px-9 py-3 rounded-xl font-bold text-lg"
            >
              <Film className="w-6 h-6" />
              Trailer
            </button>
            <button 
              onClick={() => onPlay(item.id, type, true)}
              className="w-12 h-12 flex items-center justify-center bg-white/10 text-white rounded-full hover:bg-white/15 hover:scale-105 transition-all backdrop-blur-md border border-white/15 shadow-lg cursor-pointer shrink-0"
              title="More Info"
            >
              <Info className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
