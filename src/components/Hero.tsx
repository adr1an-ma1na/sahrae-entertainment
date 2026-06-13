import { Play, Info, Star } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';

interface HeroProps {
  item: MediaItem | null;
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean) => void;
}

export default function Hero({ item, onPlay }: HeroProps) {
  if (!item) return <div className="h-[70vh] bg-zinc-950 animate-pulse"></div>;

  const title = item.title || item.name;
  const type = item.media_type || 'movie';

  return (
    <div className="relative h-[85vh] w-full overflow-hidden bg-zinc-950">
      {/* Background Media */}
      <div className="absolute inset-0">
        <img
          src={getImageUrl(item.backdrop_path, 'original')}
          alt={title}
          className="w-full h-full object-cover"
        />
        
        {/* Dynamic Glow from Poster mapping (top color cast) */}
        <div className="absolute top-0 left-0 right-0 h-[80%] opacity-50 blur-[120px] mix-blend-screen z-10 pointer-events-none animate-pulse duration-[8000ms]">
          <img src={getImageUrl(item.poster_path, 'w500')} className="w-full h-full object-cover opacity-60" alt="" />
        </div>

        {/* Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-950/80 to-zinc-950 z-10 hidden md:block opacity-50"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent z-10"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-zinc-950/20 to-zinc-950 z-10 mix-blend-multiply"></div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 w-full px-4 md:px-12 pb-32 pt-32 z-20">
        <div className="max-w-2xl">
          <div className="flex items-center gap-4 mb-4">
            <span className="px-2 py-1 bg-amber-500 text-amber-950 text-xs font-bold uppercase tracking-wider rounded shadow-[0_0_10px_rgba(245,158,11,0.3)]">
              {type === 'movie' ? 'Movie' : 'Series'}
            </span>
            {item.vote_average ? (
              <div className="flex items-center gap-1 text-amber-500 font-semibold drop-shadow-md">
                <Star className="w-4 h-4 fill-current" />
                <span>{item.vote_average.toFixed(1)}</span>
              </div>
            ) : null}
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-display font-bold text-white mb-4 leading-tight drop-shadow-2xl tracking-tight">
            {title}
          </h1>
          
          <p className="text-zinc-300 text-lg md:text-xl mb-8 line-clamp-3 max-w-xl drop-shadow-lg font-medium">
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
              className="flex items-center justify-center gap-2 px-7 md:px-9 py-3 bg-white/10 text-white rounded-xl font-bold text-lg hover:bg-white/15 transition-colors backdrop-blur-md border border-white/15 shadow-lg"
            >
              <Play className="w-6 h-6 fill-current" />
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
