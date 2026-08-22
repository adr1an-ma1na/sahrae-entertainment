import EmptyState from './EmptyState';
import { SearchX } from 'lucide-react';
import { Fragment } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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

// Parent container staggers children
const gridContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.02,
      delayChildren: 0.05,
    }
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.01,
      staggerDirection: -1,
    }
  }
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.96 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 280,
      damping: 24
    }
  },
  exit: { 
    opacity: 0, 
    y: 10, 
    scale: 0.96,
    transition: { duration: 0.15, ease: 'easeInOut' as const }
  }
};

const pillVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: (index: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      delay: index * 0.015,
      type: 'spring' as const,
      stiffness: 260,
      damping: 20
    }
  })
};

export default function MediaGrid({ title, items, onPlay, defaultType = 'movie', genres, selectedGenre, onGenreSelect, showRanking = false, onRemove }: MediaGridProps) {
  if (!items || items.length === 0) {
    // A guided empty state rather than a line of grey text — it says what
    // happened and what to do next, in the same shape used elsewhere.
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing here yet"
        message={`We couldn't find anything for ${title}. Try a different spelling, a broader filter, or browse what's trending.`}
      />
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
          <motion.button
            variants={pillVariants}
            initial="hidden"
            animate="show"
            custom={0}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onGenreSelect(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
              selectedGenre === null ? 'bg-amber-500 text-amber-950 shadow-md shadow-amber-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
            }`}
          >
            All
          </motion.button>
          {genres.map((genre, idx) => (
            <motion.button
              key={genre.id}
              variants={pillVariants}
              initial="hidden"
              animate="show"
              custom={idx + 1}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onGenreSelect(genre.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedGenre === genre.id ? 'bg-amber-500 text-amber-950 shadow-md shadow-amber-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {genre.name}
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence mode="popLayout">
        <motion.div 
          key={selectedGenre || 'all'}
          variants={gridContainerVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          className="flex flex-wrap gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4"
        >
          {items.map((item) => {
            const type = item.media_type || defaultType;
            return (
              <motion.div 
                key={`${type}-${item.id}`} 
                variants={gridItemVariants}
                layout
                className="flex-none"
              >
                <PosterCard
                  item={item}
                  type={type}
                  onPlay={() => onPlay(item.id, type, true)}
                  onRemove={onRemove ? () => onRemove(item) : undefined}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
