import { Play, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { useRef, useState, useEffect } from 'react';

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  defaultType?: 'movie' | 'tv';
  isLoading?: boolean;
}

export default function MediaRow({ title, items, onPlay, defaultType = 'movie', isLoading = false }: MediaRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isScrolledEnd, setIsScrolledEnd] = useState(false);

  const handleScroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handleScrollEvent = () => {
      if (rowRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        setIsScrolled(scrollLeft > 0);
        setIsScrolledEnd(Math.ceil(scrollLeft + clientWidth) >= scrollWidth);
      }
    };

    const currentRef = rowRef.current;
    if (currentRef) {
      currentRef.addEventListener('scroll', handleScrollEvent);
      // Check initial state
      // Use setTimeout to ensure DOM is fully rendered before checking scrollWidth
      setTimeout(handleScrollEvent, 100);
    }

    window.addEventListener('resize', handleScrollEvent);

    return () => {
      if (currentRef) {
        currentRef.removeEventListener('scroll', handleScrollEvent);
      }
      window.removeEventListener('resize', handleScrollEvent);
    };
  }, [items]);

  if (isLoading) {
    return (
      <div className="px-4 md:px-12 py-6 relative">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
        <div className="flex overflow-x-hidden gap-4 pb-4">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className="relative flex-none w-[160px] md:w-[200px] lg:w-[240px] aspect-[2/3] rounded-xl bg-zinc-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="px-4 md:px-12 py-6 relative group/row">
      <h2 className="text-xl md:text-2xl font-display font-bold text-white mb-4 tracking-tight">{title}</h2>
      
      <div className="relative">
        {isScrolled && (
          <button 
            onClick={() => handleScroll('left')}
            className="absolute left-0 top-0 bottom-4 z-40 w-12 bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 backdrop-blur-sm rounded-r-xl"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        <div 
          ref={rowRef}
          className="flex overflow-x-auto gap-4 pt-3 pb-6 scrollbar-hide snap-x scroll-smooth"
        >
          {items.map((item) => {
            const type = item.media_type || defaultType;
            return (
              <div
                key={`${type}-${item.id}`}
                tabIndex={0}
                data-tv-focusable
                role="button"
                aria-label={item.title || item.name}
                className="card-lift relative flex-none w-[140px] md:w-[168px] lg:w-[200px] xl:w-[220px] aspect-[2/3] rounded-2xl overflow-hidden group cursor-pointer snap-start bg-zinc-900 border border-white/10 hover:z-10 focus:outline-none"
                onClick={() => onPlay(item.id, type, true)}
              >
                <img
                  src={getImageUrl(item.poster_path)}
                  alt={item.title || item.name}
                  className="w-full h-full object-cover transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
                  loading="lazy"
                />

                {/* Rating Badge */}
                {item.vote_average ? (
                  <div className="absolute top-2 right-2 bg-black/55 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-400 border border-white/10 shadow-lg z-20 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    <span>{item.vote_average.toFixed(1)}</span>
                  </div>
                ) : null}

                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                  <h3 className="text-white font-display font-semibold text-xs md:text-sm line-clamp-2 mb-2 drop-shadow-md">
                    {item.title || item.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button className="btn-gold w-7 h-7 md:w-9 md:h-9 rounded-full flex items-center justify-center hover:scale-110">
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

        {!isScrolledEnd && (
          <button 
            onClick={() => handleScroll('right')}
            className="absolute right-0 top-0 bottom-4 z-40 w-12 bg-black/50 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 backdrop-blur-sm rounded-l-xl"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  );
}
