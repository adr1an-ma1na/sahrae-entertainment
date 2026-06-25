import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../services/tmdb';
import { useRef, useState, useEffect } from 'react';
import PosterCard from './PosterCard';

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
        <div className="flex items-center gap-3 mb-4">
          <span className="w-1 h-5 md:h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
          <h2 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">{title}</h2>
        </div>
        <div className="flex overflow-x-hidden gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4 pb-4">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="skeleton flex-none w-[120px] md:w-[140px] lg:w-[160px] xl:w-[180px] aspect-[2/3] rounded-lg border border-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <div className="px-4 md:px-12 py-6 relative group/row">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-1 h-5 md:h-6 rounded-full bg-gradient-to-b from-amber-300 to-amber-600" />
        <h2 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">{title}</h2>
      </div>
      
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
          className="flex overflow-x-auto gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4 pt-1 pb-6 scrollbar-hide snap-x scroll-smooth"
        >
          {items.map((item) => {
            const type = item.media_type || defaultType;
            return (
              <PosterCard key={`${type}-${item.id}`} item={item} type={type} onPlay={() => onPlay(item.id, type, true)} />
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
