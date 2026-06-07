import { Play, Trash2 } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { useWatchProgress } from '../hooks/useWatchProgress';

interface ContinueWatchingViewProps {
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean, season?: number, episode?: number) => void;
}

export default function ContinueWatchingView({ onPlay }: ContinueWatchingViewProps) {
  const { progress, removeProgress } = useWatchProgress();

  if (progress.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 pt-24">
        <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
          <Play className="w-10 h-10 text-zinc-600 ml-2" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Nothing to continue</h2>
        <p className="text-zinc-400 max-w-md">
          Movies and TV shows you start watching will appear here so you can easily pick up where you left off.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-32 px-4 md:px-12 pb-12 min-h-screen">
      <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-6 tracking-tight">Continue Watching</h2>
      
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-5">
        {progress.map((item) => (
          <div key={`${item.mediaType}-${item.mediaId}`} className="group relative rounded-xl overflow-hidden bg-zinc-900 transition-transform duration-300 hover:scale-105 hover:z-10 shadow-xl">
            <div 
              className="aspect-[2/3] w-full cursor-pointer relative"
              onClick={() => onPlay(item.mediaId, item.mediaType, false, false, item.season, item.episode)}
            >
              <img 
                src={getImageUrl(item.item?.poster_path)} 
                alt={item.item?.title || item.item?.name || 'Unknown Title'} 
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300 shadow-lg shadow-amber-500/30">
                    <Play className="w-5 h-5 text-amber-950 ml-1 fill-current" />
                  </div>
                </div>
                
                <div className="absolute bottom-0 left-0 w-full p-4">
                  <p className="text-white font-bold text-sm line-clamp-1">{item.item?.title || item.item?.name || 'Unknown Title'}</p>
                  {item.mediaType === 'tv' && item.season && item.episode && (
                    <p className="text-amber-500 text-xs font-medium mt-1">
                      S{item.season} E{item.episode}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeProgress(item.mediaId);
              }}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-500 text-white rounded-full transition-colors duration-200 z-20 shadow-lg backdrop-blur-sm border border-white/10"
              title="Remove from Continue Watching"
              aria-label="Remove from Continue Watching"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            {/* Progress Bar (Visual only, as we don't track exact seconds yet) */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-800">
              <div className="h-full bg-amber-500 w-1/2 rounded-r-full"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
