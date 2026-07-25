import { useState, useEffect, useCallback } from 'react';
import { Search, User, Clapperboard, Film, Tv, ArrowLeft, Sparkles, TrendingUp, X, Calendar, MapPin, Award, Loader2, Play } from 'lucide-react';
import { fetchPopularPeople, searchPeople, fetchPersonDetails, fetchDiscover, fetchMediaDetails, getImageUrl, MediaItem } from '../services/tmdb';
import { haptics } from '../services/haptics';

interface TalentExplorerProps {
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
}

interface Person {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for?: any[];
  character?: string;
  job?: string;
  associatedTitle?: string;
}

const TALENT_GENRES = [
  { id: 28, name: 'Action' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 878, name: 'Sci-Fi' },
  { id: 27, name: 'Horror' },
  { id: 53, name: 'Thriller' },
  { id: 10749, name: 'Romance' },
  { id: 16, name: 'Animation' },
  { id: 12, name: 'Adventure' },
  { id: 9648, name: 'Mystery' },
];

export default function TalentExplorer({ onPlay }: TalentExplorerProps) {
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [directors, setDirectors] = useState<Person[]>([]);
  const [actors, setActors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  
  // Person details state
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'movies' | 'tv'>('movies');
  const [filmographyQuery, setFilmographyQuery] = useState('');

  // Load popular people by default
  const loadPopularPeople = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPopularPeople(1);
      setPeople(data.results);
      setDirectors([]);
      setActors([]);
    } catch (err) {
      console.error('Error fetching popular talent:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch talent for a specific genre dynamically by looking up top movies
  const loadGenreTalent = useCallback(async (genreId: number) => {
    setLoading(true);
    try {
      // 1. Fetch top popular movies of this genre
      const topMovies = await fetchDiscover('movie', 1, genreId, 'popularity.desc');
      const sampleMovies = topMovies.slice(0, 6);

      // 2. Fetch full credits for each movie in parallel
      const detailsResults = await Promise.allSettled(
        sampleMovies.map(movie => fetchMediaDetails(movie.id, 'movie'))
      );

      const directorsMap = new Map<number, Person>();
      const actorsMap = new Map<number, Person>();

      detailsResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const movieDetails = result.value;
          const movieTitle = movieDetails.title || movieDetails.name || 'Top Film';

          // Extract directors
          const directorsCrew = movieDetails.credits?.crew?.filter(
            (c: any) => c.job === 'Director' || c.department === 'Directing'
          ) || [];

          directorsCrew.forEach((dir: any) => {
            if (!directorsMap.has(dir.id)) {
              directorsMap.set(dir.id, {
                id: dir.id,
                name: dir.name,
                profile_path: dir.profile_path,
                known_for_department: 'Directing',
                popularity: dir.popularity || 10,
                associatedTitle: movieTitle,
              });
            }
          });

          // Extract top cast (actors)
          const topCast = movieDetails.credits?.cast?.slice(0, 4) || [];
          topCast.forEach((cast: any) => {
            if (!actorsMap.has(cast.id)) {
              actorsMap.set(cast.id, {
                id: cast.id,
                name: cast.name,
                profile_path: cast.profile_path,
                known_for_department: 'Acting',
                popularity: cast.popularity || 10,
                character: cast.character,
                associatedTitle: movieTitle,
              });
            }
          });
        }
      });

      // Sort by popularity descendng
      setDirectors(Array.from(directorsMap.values()).sort((a, b) => b.popularity - a.popularity));
      setActors(Array.from(actorsMap.values()).sort((a, b) => b.popularity - a.popularity));
      setPeople([]);
    } catch (err) {
      console.error('Error fetching genre talent:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query) {
      // If there is active search, let the search trigger handle it
      return;
    }
    if (selectedGenre !== null) {
      loadGenreTalent(selectedGenre);
    } else {
      loadPopularPeople();
    }
  }, [selectedGenre, query, loadPopularPeople, loadGenreTalent]);

  // Handle Search Input
  const handleSearch = async (val: string) => {
    setQuery(val);
    if (!val) {
      setSearchMode(false);
      if (selectedGenre !== null) {
        loadGenreTalent(selectedGenre);
      } else {
        loadPopularPeople();
      }
      return;
    }

    setSearchMode(true);
    setLoading(true);
    try {
      const data = await searchPeople(val, 1);
      setPeople(data.results);
      setDirectors([]);
      setActors([]);
    } catch (err) {
      console.error('Error searching people:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open Talent Bio & Filmography Details
  const handleOpenPerson = async (id: number) => {
    haptics.press();
    setLoadingDetails(true);
    setFilmographyQuery('');
    try {
      const details = await fetchPersonDetails(id);
      setSelectedPerson(details);
      setDetailsTab('movies');
    } catch (err) {
      console.error('Error getting person details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Process credits to split into Movies & TV Shows
  const getProcessedCredits = () => {
    if (!selectedPerson || !selectedPerson.combined_credits) return { movies: [], tv: [] };
    
    const cast = selectedPerson.combined_credits.cast || [];
    const crew = selectedPerson.combined_credits.crew || [];
    
    // Group all items
    const moviesMap = new Map<number, any>();
    const tvMap = new Map<number, any>();

    const processItem = (item: any, role: string) => {
      const isMovie = item.media_type === 'movie';
      const targetMap = isMovie ? moviesMap : tvMap;
      
      if (!targetMap.has(item.id)) {
        targetMap.set(item.id, {
          ...item,
          roles: [role],
        });
      } else {
        const existing = targetMap.get(item.id);
        if (!existing.roles.includes(role)) {
          existing.roles.push(role);
        }
      }
    };

    // Actors
    cast.forEach((item: any) => {
      processItem(item, item.character ? `Actor (${item.character})` : 'Actor');
    });

    // Crew (mainly check if Directed/Produced)
    crew.forEach((item: any) => {
      if (item.job === 'Director') {
        processItem(item, 'Director');
      } else if (item.job === 'Producer' || item.job === 'Executive Producer') {
        processItem(item, 'Producer');
      } else if (item.department === 'Writing') {
        processItem(item, 'Writer');
      }
    });

    // Convert to arrays and sort by popularity desc
    let sortedMovies = Array.from(moviesMap.values())
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
      
    let sortedTv = Array.from(tvMap.values())
      .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));

    if (filmographyQuery) {
      const q = filmographyQuery.toLowerCase().trim();
      sortedMovies = sortedMovies.filter(
        (m: any) => (m.title || m.name || '').toLowerCase().includes(q) || 
                    (m.roles || []).some((r: string) => r.toLowerCase().includes(q))
      );
      sortedTv = sortedTv.filter(
        (t: any) => (t.title || t.name || '').toLowerCase().includes(q) || 
                    (t.roles || []).some((r: string) => r.toLowerCase().includes(q))
      );
    }

    return { movies: sortedMovies, tv: sortedTv };
  };

  const personCredits = getProcessedCredits();

  return (
    <div className="w-full">
      {/* Search Bar specifically for stars */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search legendary directors or actors (e.g. Christopher Nolan, Al Pacino)..."
          className="w-full bg-zinc-900/60 hover:bg-zinc-900/90 border border-white/10 focus:border-amber-500/50 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all shadow-inner"
        />
        {query && (
          <button 
            onClick={() => handleSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Genre Filter Scrollable Panel */}
      {!searchMode && (
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
          <button
            onClick={() => { haptics.tap(); setSelectedGenre(null); }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap active:scale-95 flex items-center gap-1.5 border ${
              selectedGenre === null
                ? 'bg-amber-500 text-amber-950 border-amber-400'
                : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/5'
            }`}
          >
            <TrendingUp className="w-3 h-3" /> All Popular
          </button>
          {TALENT_GENRES.map((genre) => (
            <button
              key={genre.id}
              onClick={() => { haptics.tap(); setSelectedGenre(genre.id); }}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap active:scale-95 border ${
                selectedGenre === genre.id
                  ? 'bg-amber-500 text-amber-950 border-amber-400'
                  : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 border-white/5'
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      )}

      {/* Main Results Board */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-zinc-500 text-xs font-semibold tracking-wider uppercase animate-pulse">
            Assembling Top Talent...
          </p>
        </div>
      ) : selectedPerson ? (
        /* Person Detail & Filmography Sub-View */
        <div className="glass rounded-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200 border border-white/10 shadow-2xl">
          <button
            onClick={() => { haptics.tap(); setSelectedPerson(null); }}
            className="mb-6 flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-400 uppercase tracking-wider active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Talent List
          </button>

          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start mb-8">
            <img
              src={getImageUrl(selectedPerson.profile_path, 'w185')}
              alt={selectedPerson.name}
              referrerPolicy="no-referrer"
              className="w-32 h-44 md:w-40 md:h-56 object-cover rounded-xl shadow-xl border-2 border-white/10 bg-zinc-900 shrink-0 self-center md:self-start"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  {selectedPerson.known_for_department}
                </span>
                {selectedPerson.popularity && (
                  <span className="text-[10px] font-mono text-zinc-400">
                    Popularity: {Math.round(selectedPerson.popularity)}
                  </span>
                )}
              </div>
              <h3 className="text-2xl md:text-3xl font-display font-black text-white tracking-tight mb-4">
                {selectedPerson.name}
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs text-zinc-400">
                {selectedPerson.birthday && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Born: {selectedPerson.birthday} {selectedPerson.deathday && `(Died: ${selectedPerson.deathday})`}</span>
                  </div>
                )}
                {selectedPerson.place_of_birth && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate" title={selectedPerson.place_of_birth}>From: {selectedPerson.place_of_birth}</span>
                  </div>
                )}
              </div>

              {selectedPerson.biography ? (
                <p className="text-zinc-300 text-sm leading-relaxed max-h-40 overflow-y-auto pr-2 custom-scrollbar whitespace-pre-line">
                  {selectedPerson.biography}
                </p>
              ) : (
                <p className="text-zinc-500 text-xs italic">No biography available for this talent.</p>
              )}
            </div>
          </div>

          {/* Filmography Section */}
          <div className="border-t border-white/5 pt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" /> Feature Filmography
                <span className="text-xs font-normal text-zinc-500">({personCredits[detailsTab].length} items)</span>
              </h4>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search box inside Filmography */}
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={filmographyQuery}
                    onChange={(e) => setFilmographyQuery(e.target.value)}
                    placeholder="Search titles or roles..."
                    className="w-full bg-zinc-950 text-white text-xs pl-9 pr-8 py-1.5 rounded-lg border border-white/10 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 outline-none transition-all"
                  />
                  {filmographyQuery && (
                    <button
                      onClick={() => setFilmographyQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
                
                <div className="flex gap-1.5 bg-black/40 p-1 rounded-lg border border-white/5 shrink-0 self-end sm:self-auto">
                  <button
                    onClick={() => { haptics.tap(); setDetailsTab('movies'); }}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      detailsTab === 'movies' ? 'bg-amber-500 text-amber-950' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Movies
                  </button>
                  <button
                    onClick={() => { haptics.tap(); setDetailsTab('tv'); }}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                      detailsTab === 'tv' ? 'bg-amber-500 text-amber-950' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    TV Series
                  </button>
                </div>
              </div>
            </div>

            {/* List of credits */}
            {personCredits[detailsTab].length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                {personCredits[detailsTab].map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() => onPlay(item.id, detailsTab === 'movies' ? 'movie' : 'tv', true)}
                    className="group cursor-pointer flex flex-col active:scale-95 transition-all duration-200"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden border border-white/10 bg-zinc-900 shadow-md group-hover:border-amber-500/50 group-hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all">
                      <img
                        src={getImageUrl(item.poster_path, 'w185')}
                        alt={item.title || item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <div className="w-10 h-10 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center font-bold shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        </div>
                      </div>
                      {item.vote_average > 0 && (
                        <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm border border-white/10 px-1.5 py-0.5 rounded text-[9px] font-bold text-amber-400">
                          ⭐ {item.vote_average.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <h5 className="text-xs font-bold text-zinc-100 mt-2 truncate group-hover:text-amber-400 transition-colors">
                      {item.title || item.name}
                    </h5>
                    {item.roles && item.roles.length > 0 && (
                      <p className="text-[10px] text-zinc-500 truncate" title={item.roles.join(', ')}>
                        {item.roles[0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-black/20 border border-white/5 rounded-xl">
                <p className="text-zinc-500 text-xs italic">
                  {filmographyQuery 
                    ? `No ${detailsTab === 'movies' ? 'movies' : 'TV shows'} match "${filmographyQuery}" for this talent.`
                    : `No ${detailsTab === 'movies' ? 'movies' : 'TV shows'} found for this talent in our catalog.`}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Grid of people (search mode or popular lists) */
        <div>
          {/* Genre Specific Headers */}
          {selectedGenre !== null && !searchMode && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Top Masters of {TALENT_GENRES.find((g) => g.id === selectedGenre)?.name}
                </h3>
                <p className="text-xs text-zinc-400">
                  Dynamically compiled based on legendary blockbusters and highest-rated titles.
                </p>
              </div>
            </div>
          )}

          {/* If looking at genre, render Directors & Actors in clear columns / rows */}
          {selectedGenre !== null && !searchMode ? (
            <div className="space-y-10">
              {/* Top Directors Row */}
              {directors.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-amber-500/90 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Clapperboard className="w-4 h-4 text-amber-400" /> Legendary Directors
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {directors.map((dir) => (
                      <div
                        key={`dir-${dir.id}`}
                        onClick={() => handleOpenPerson(dir.id)}
                        className="group bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-amber-500/30 rounded-xl p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all shadow-md hover:shadow-lg"
                      >
                        <img
                          src={getImageUrl(dir.profile_path, 'w185')}
                          alt={dir.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                            {dir.name}
                          </h5>
                          {dir.associatedTitle && (
                            <p className="text-[10px] text-zinc-400 truncate">
                              🎬 {dir.associatedTitle}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Actors Row */}
              {actors.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-amber-500/90 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <User className="w-4 h-4 text-amber-400" /> Featured Cast & Stars
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {actors.map((act) => (
                      <div
                        key={`act-${act.id}`}
                        onClick={() => handleOpenPerson(act.id)}
                        className="group bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-amber-500/30 rounded-xl p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all shadow-md hover:shadow-lg"
                      >
                        <img
                          src={getImageUrl(act.profile_path, 'w185')}
                          alt={act.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-full object-cover bg-zinc-800 shrink-0 border border-white/10"
                        />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-zinc-100 group-hover:text-amber-400 transition-colors truncate">
                            {act.name}
                          </h5>
                          <p className="text-[10px] text-zinc-400 truncate">
                            {act.character ? `as ${act.character}` : `🎬 ${act.associatedTitle}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* General Popular or Search grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {people.map((person) => (
                <div
                  key={person.id}
                  onClick={() => handleOpenPerson(person.id)}
                  className="group cursor-pointer bg-zinc-900/30 hover:bg-zinc-900/70 border border-white/5 hover:border-amber-500/30 rounded-xl overflow-hidden active:scale-95 transition-all shadow-md"
                >
                  <div className="aspect-[4/5] w-full bg-zinc-800 relative">
                    <img
                      src={getImageUrl(person.profile_path, 'w185')}
                      alt={person.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-6">
                      <span className="px-1.5 py-0.5 bg-amber-500 text-amber-950 font-bold rounded text-[8px] uppercase tracking-wide">
                        {person.known_for_department === 'Directing' ? 'Director' : 'Actor'}
                      </span>
                      <h4 className="text-xs font-bold text-white mt-1 group-hover:text-amber-400 transition-colors truncate">
                        {person.name}
                      </h4>
                      {person.known_for && person.known_for.length > 0 && (
                        <p className="text-[9px] text-zinc-400 truncate mt-0.5">
                          {person.known_for.map((k) => k.title || k.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {people.length === 0 && directors.length === 0 && actors.length === 0 && (
            <div className="text-center py-20 text-zinc-500">
              No actors or directors found matching that name or criteria.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
