import { useState, useEffect } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { MediaItem, Genre, fetchDiscover } from '../services/tmdb';
import MediaGrid from './MediaGrid';

interface DiscoveryViewProps {
  type: 'movie' | 'tv';
  genres: Genre[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
}

export default function DiscoveryView({ type, genres, onPlay }: DiscoveryViewProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('popularity.desc');
  const [year, setYear] = useState<string>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchDiscover(type, page, selectedGenre || undefined, sortBy, year || undefined);
        if (page === 1) {
          setItems(data);
        } else {
          setItems(prev => [...prev, ...data]);
        }
      } catch (error) {
        console.error('Error fetching discovery data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [type, page, selectedGenre, sortBy, year]);

  const handleFilterChange = () => {
    setPage(1);
    setItems([]);
  };

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h2 className="text-3xl font-bold text-white capitalize">{type === 'movie' ? 'Movies' : 'TV Series'}</h2>
        
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/80 p-2 rounded-xl border border-white/5">
          <div className="flex items-center gap-2 px-3 border-r border-white/10">
            <Filter className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-zinc-400">Filters</span>
          </div>
          
          <select 
            value={selectedGenre || ''} 
            onChange={(e) => { setSelectedGenre(e.target.value ? Number(e.target.value) : null); handleFilterChange(); }}
            className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="">All Genres</option>
            {genres.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <select 
            value={sortBy} 
            onChange={(e) => { setSortBy(e.target.value); handleFilterChange(); }}
            className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="popularity.desc">Most Popular</option>
            <option value="vote_average.desc">Highest Rated</option>
            <option value="primary_release_date.desc">Newest</option>
            <option value="revenue.desc">Highest Grossing</option>
          </select>

          <select 
            value={year} 
            onChange={(e) => { setYear(e.target.value); handleFilterChange(); }}
            className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="">Any Year</option>
            {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {items.length > 0 ? (
        <>
          <MediaGrid title="" items={items} onPlay={onPlay} />
          
          <div className="mt-12 flex justify-center">
            <button 
              onClick={() => setPage(p => p + 1)}
              disabled={loading}
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 px-8 py-3 rounded-full font-bold transition-all hover:scale-105 shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-amber-950 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        </>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="text-center py-20 text-zinc-500">
          No results found for these filters.
        </div>
      )}
    </div>
  );
}
