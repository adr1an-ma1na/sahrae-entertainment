import EmptyState from './EmptyState';
import { GridSkeleton } from './PageSkeleton';
import { SlidersHorizontal, ChevronDown, Flame, Star, CalendarDays, Coins } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { MediaItem, Genre, fetchDiscover, fetchTrending } from '../services/tmdb';
import { LOCAL_ROWS, localQuery } from '../services/discoverCore';
import MediaGrid from './MediaGrid';
import Hero from './Hero';
import Top10Row from './Top10Row';
import LazyShelf from './LazyShelf';
import { LuxChapter, LuxSeg } from './ui/Lux';

interface DiscoveryViewProps {
  type: 'movie' | 'tv';
  genres: Genre[];
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean, playTrailer?: boolean) => void;
  inList?: (id: number) => boolean;
  onToggleList?: (item: MediaItem) => void;
}

const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

// Genre shelves, by TMDB genre id. Series use TMDB's own combined TV genres.
const MOVIE_GENRES: [number, string][] = [
  [28, 'Action'], [35, 'Comedy'], [53, 'Thrillers'], [18, 'Drama'], [878, 'Science fiction'],
  [16, 'Animation'], [27, 'Horror'], [10749, 'Romance'], [80, 'Crime'], [99, 'Documentaries'],
];
const TV_GENRES: [number, string][] = [
  [18, 'Drama'], [80, 'Crime'], [35, 'Comedy'], [10765, 'Sci-fi and fantasy'], [10759, 'Action and adventure'],
  [9648, 'Mystery'], [16, 'Animation'], [99, 'Documentaries'], [10764, 'Reality'], [10762, 'Kids'],
];

/**
 * Movies and Series, in the Home language: a showcase of the week's top five,
 * chapters of curated shelves that load as they come into view, and the full
 * catalogue with its filters at the foot.
 */
export default function DiscoveryView({ type, genres, onPlay, inList, onToggleList }: DiscoveryViewProps) {
  const film = type === 'movie';
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<string>('popularity.desc');
  const [year, setYear] = useState<string>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let live = true;
    setTrending([]);
    fetchTrending(type).then((r) => { if (live) setTrending(r); }).catch(() => {});
    return () => { live = false; };
  }, [type]);

  // The filters reset when switching between Movies and Series (their genres differ).
  useEffect(() => { setSelectedGenre(null); setSortBy('popularity.desc'); setYear(''); setPage(1); setItems([]); }, [type]);

  useEffect(() => {
    let live = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchDiscover(type, page, selectedGenre || undefined, sortBy, year || undefined);
        if (!live) return;
        if (page === 1) {
          setItems(data);
        } else {
          setItems(prev => [...prev, ...data]);
        }
      } catch (error) {
        console.error('Error fetching discovery data:', error);
      } finally {
        if (live) setLoading(false);
      }
    };

    loadData();
    return () => { live = false; };
  }, [type, page, selectedGenre, sortBy, year]);

  const handleFilterChange = () => {
    setPage(1);
    setItems([]);
  };

  const genreName = useMemo(() => {
    const names = new Map(genres.map((g) => [g.id, g.name]));
    return (id: number) => names.get(id);
  }, [genres]);

  const sorts = film
    ? [
        { id: 'popularity.desc', label: 'Popular', icon: Flame },
        { id: 'vote_average.desc', label: 'Top rated', icon: Star },
        { id: 'primary_release_date.desc', label: 'Newest', icon: CalendarDays },
        { id: 'revenue.desc', label: 'Box office', icon: Coins },
      ]
    : [
        { id: 'popularity.desc', label: 'Popular', icon: Flame },
        { id: 'vote_average.desc', label: 'Top rated', icon: Star },
        { id: 'first_air_date.desc', label: 'Newest', icon: CalendarDays },
      ];

  // Newest means released already: without a ceiling TMDB leads with dates years away.
  const newest = film
    ? { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': day(), 'vote_count.gte': '40' }
    : { sort_by: 'first_air_date.desc', 'first_air_date.lte': day(), 'vote_count.gte': '20' };
  const shelves = film ? MOVIE_GENRES : TV_GENRES;
  const noun = film ? 'films' : 'series';

  return (
    <div className="min-h-screen pb-16">
      <Hero
        items={trending}
        onPlay={onPlay}
        genreName={genreName}
        inList={inList}
        onToggleList={onToggleList}
      />

      <div className="-mt-16 relative z-10">
        <LuxChapter
          kicker={film ? 'Movies' : 'Series'}
          title={film ? 'Now showing' : 'On air now'}
          note={film ? 'The week’s charts and the newest films.' : 'The week’s charts and the shows airing this week.'}
        />
        <Top10Row items={trending} onPlay={onPlay} title={film ? 'Top 10 Films This Week' : 'Top 10 Series This Week'} />
        {film ? (
          <LazyShelf type="movie" kicker="Just released" title="New films" params={newest} onPlay={onPlay} />
        ) : (
          <LazyShelf
            type="tv" kicker="New episodes" title="Airing this week" onPlay={onPlay}
            params={{ sort_by: 'popularity.desc', 'air_date.gte': day(-3), 'air_date.lte': day(4), 'vote_count.gte': '20' }}
          />
        )}
        <LazyShelf
          type={type} kicker="Critics and audiences agree" title={film ? 'Acclaimed films' : 'Acclaimed series'} onPlay={onPlay}
          params={{ sort_by: 'vote_average.desc', 'vote_count.gte': film ? '3000' : '1000' }}
        />
        {!film && <LazyShelf type="tv" kicker="Start a new one" title="New series" params={newest} onPlay={onPlay} />}

        <LuxChapter kicker="By genre" title={film ? 'Every kind of film' : 'Every kind of show'} note={`The most-watched ${noun} in each genre right now.`} />
        {shelves.map(([id, name]) => (
          <LazyShelf
            key={id} type={type} title={name} onPlay={onPlay}
            params={{ with_genres: String(id), sort_by: 'popularity.desc', 'vote_count.gte': film ? '200' : '80' }}
          />
        ))}

        <LuxChapter kicker="Close to home" title="Stories from here" note={`Kenyan ${noun}, and ${noun} from across Africa.`} />
        <LazyShelf type={type} title="Made in Kenya" params={localQuery(LOCAL_ROWS.kenya.origin, type)} onPlay={onPlay} />
        <LazyShelf type={type} title="African stories" params={localQuery(LOCAL_ROWS.africa.origin, type)} onPlay={onPlay} />

        <LuxChapter kicker="The catalogue" title="Browse everything" note="Pick a genre, an order and a year." />
        <div className="px-4 md:px-12 mt-4 mb-8 flex flex-col gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button" data-tv-focusable aria-pressed={selectedGenre === null} className="lux-chip"
              onClick={() => { setSelectedGenre(null); handleFilterChange(); }}
            >
              All genres
            </button>
            {genres.map((g) => (
              <button
                key={g.id} type="button" data-tv-focusable aria-pressed={selectedGenre === g.id} className="lux-chip"
                onClick={() => { setSelectedGenre(g.id); handleFilterChange(); }}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LuxSeg items={sorts} active={sortBy} onChange={(id) => { setSortBy(id); handleFilterChange(); }} />
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); handleFilterChange(); }}
              aria-label="Year"
              className="lux-field text-sm font-semibold px-4 py-2.5"
            >
              <option value="">Any year</option>
              {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-4 md:px-12">
          {items.length > 0 ? (
            <>
              <MediaGrid title="" items={items} onPlay={onPlay} defaultType={type} />

              <div className="mt-12 flex justify-center">
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={loading}
                  className="lux-btn px-8 py-3"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              </div>
            </>
          ) : loading ? (
            <GridSkeleton tiles={12} title={false} />
          ) : (
            <EmptyState
              icon={SlidersHorizontal}
              illustration="filters"
              title="No titles match those filters"
              message="Nothing lines up with this combination. Widening the year range or clearing a genre usually brings plenty back."
            />
          )}
        </div>
      </div>
    </div>
  );
}
