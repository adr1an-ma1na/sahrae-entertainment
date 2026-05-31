import { Play, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { MediaItem, getImageUrl } from '../services/tmdb';
import { useRef, useState, useEffect } from 'react';

interface Top10RowProps {
  items: MediaItem[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
  title?: string;
}

export default function Top10Row({ items, onPlay, title = "Top 10 Trending Today" }: Top10RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isScrolledEnd, setIsScrolledEnd] = useState(false);

  const top10Items = items.slice(0, 10);

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

  if (!top10Items || top10Items.length === 0) return null;

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
          className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide snap-x scroll-smooth pl-8"
        >
          {top10Items.map((item, index) => {
            const type = item.media_type || 'movie';
            return (
              <div 
                key={`top10-${type}-${item.id}`} 
                className="relative flex-none w-[130px] md:w-[160px] lg:w-[200px] aspect-[2/3] rounded-xl group cursor-pointer snap-start flex items-center"
                onClick={() => onPlay(item.id, type, true)}
              >
                {/* Giant Number */}
                <div className="absolute -left-8 md:-left-10 bottom-0 z-10 select-none pointer-events-none drop-shadow-2xl">
                  <span 
                    className="text-[100px] md:text-[130px] font-display font-black leading-none tracking-tighter"
                    style={{
                      WebkitTextStroke: '3px rgba(255,255,255,0.7)',
                      color: 'rgba(0,0,0,0.8)',
                    }}
                  >
                    {index + 1}
                  </span>
                </div>

                {/* Poster Image */}
                <div className="w-full h-full rounded-xl overflow-hidden relative bg-zinc-900 z-20 ml-6 md:ml-8 shadow-2xl border border-white/5 transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] group-hover:border-white/20">
                  <img
                    src={getImageUrl(item.poster_path)}
                    alt={item.title || item.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />

                  {/* Rating Badge */}
                  {item.vote_average ? (
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-500 border border-white/10 shadow-lg z-20 flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      <span>{item.vote_average.toFixed(1)}</span>
                    </div>
                  ) : null}

                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
                    <h3 className="text-white font-display font-medium text-xs md:text-sm line-clamp-2 mb-1.5 drop-shadow-md">
                      {item.title || item.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center hover:bg-amber-400 hover:scale-110 transition-all shadow-[0_0_10px_rgba(245,158,11,0.5)]">
                        <Play className="w-3 h-3 md:w-4 md:h-4 fill-current ml-0.5" />
                      </button>
                    </div>
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
