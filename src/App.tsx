/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import MediaRow from './components/MediaRow';
import Top10Row from './components/Top10Row';
import MediaGrid from './components/MediaGrid';
import PlayerModal from './components/PlayerModal';
import AudioHubView from './components/AudioHubView';
import PodcastsView from './components/PodcastsView';
import LiveTVView from './components/LiveTVView';
import SportsView from './components/SportsView';
import ContinueWatchingView from './components/ContinueWatchingView';
import FlowChannelsView from './components/FlowChannelsView';
import GlobalAudioPlayer from './components/GlobalAudioPlayer';
import ProfileSelection from './components/ProfileSelection';
import DiscoveryView from './components/DiscoveryView';
import TalentExplorer from './components/TalentExplorer';
import Sidebar from './components/Sidebar';
import BottomTabBar from './components/BottomTabBar';
import PodcastProgressTracker from './components/PodcastProgressTracker';
import MusicView from './components/MusicView';
import DownloadsView from './components/DownloadsView';
import MusicPlayer from './components/MusicPlayer';
import AddToPlaylistSheet from './components/AddToPlaylistSheet';
import VoiceAssistant from './components/VoiceAssistant';
import { BrowseSkeleton, GridSkeleton, ListSkeleton } from './components/PageSkeleton';
import SpotlightBand from './components/SpotlightBand';
import ContinueRow from './components/ContinueRow';
import { STATIONS } from './components/AudioHubView';
import { CHANNELS } from './components/LiveTVView';
import { VoiceIntent } from './services/voiceIntents';
import { requestChannel } from './services/voiceBus';
import { useRadio } from './hooks/useRadio';
import { ChevronDown, AlertCircle, RefreshCw, Heart } from 'lucide-react';
import { fetchTrending, fetchDiscover, searchMedia, fetchGenres, fetchRecommendations, MediaItem, Genre } from './services/tmdb';
import { useMyList } from './hooks/useMyList';
import { useWatchProgress } from './hooks/useWatchProgress';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { haptics } from './services/haptics';
import SplashIntro from './components/SplashIntro';
import Onboarding, { TasteGenre } from './components/Onboarding';
import EmptyState from './components/EmptyState';
import Coachmark from './components/Coachmark';
import { applyEq, loadEq } from './services/eq';

export default function App() {
  const { user, activeProfile, loading: authLoading } = useAuth();
  const radio = useRadio(); // voice commands drive radio playback
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  // Desktop/TV sidebar can be hidden to reclaim the full width; the CSS class
  // `nav-collapsed` (index.css) zeroes the lg:pl-64 / lg:left-64 shell offsets.
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => { try { return localStorage.getItem('sahrae.navCollapsed') === '1'; } catch { return false; } });
  useEffect(() => {
    try { localStorage.setItem('sahrae.navCollapsed', navCollapsed ? '1' : '0'); } catch { /* ignore */ }
    document.documentElement.classList.toggle('nav-collapsed', navCollapsed);
  }, [navCollapsed]);
  
  // Data states
  const [trending, setTrending] = useState<MediaItem[]>([]);
  const [trendingSeries, setTrendingSeries] = useState<MediaItem[]>([]);
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [series, setSeries] = useState<MediaItem[]>([]);
  const [awardDramas, setAwardDramas] = useState<MediaItem[]>([]);
  const [sciFi, setSciFi] = useState<MediaItem[]>([]);
  const [bingeShows, setBingeShows] = useState<MediaItem[]>([]);
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [heroItem, setHeroItem] = useState<MediaItem | null>(null);
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [recommendations, setRecommendations] = useState<{ items: MediaItem[], basedOn: string } | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Search filters
  const [searchCategory, setSearchCategory] = useState<'media' | 'talent'>('media');
  const [searchType, setSearchType] = useState<'all' | 'movie' | 'tv'>('all');
  const [searchYear, setSearchYear] = useState<string>('');
  const [searchGenre, setSearchGenre] = useState<number | null>(null);
  const [searchSortBy, setSearchSortBy] = useState<string>('popularity.desc');
  const [searchPage, setSearchPage] = useState(1);
  const [hasMoreSearch, setHasMoreSearch] = useState(true);
  
  const { myList, toggleMyList } = useMyList();
  const { progress } = useWatchProgress();
  const { theme, toggleTheme } = useTheme();

  // Player state
  const [playerConfig, setPlayerConfig] = useState<{
    isOpen: boolean;
    mediaId: number | null;
    mediaType: 'movie' | 'tv' | null;
    startInInfo?: boolean;
    initialSeason?: number;
    initialEpisode?: number;
    playTrailer?: boolean;
  }>({ isOpen: false, mediaId: null, mediaType: null, startInInfo: false });

  const [initialLoadError, setInitialLoadError] = useState<boolean>(false);

  // Onboarding is per-ACCOUNT (keyed by uid), not per-device, so a newly
  // registered user always gets it even on a device someone else already
  // onboarded. Guests fall back to the shared device flag.
  const DEVICE_ONBOARD_KEY = 'sahrae.onboarded.v1';
  const onboardKey = () => { const u = user as any; return u ? `sahrae.onboarded.u.${u.uid || u.id || u.email || 'acct'}` : DEVICE_ONBOARD_KEY; };
  const [appOnboarded, setAppOnboarded] = useState<boolean>(true);
  const [tasteGenres, setTasteGenres] = useState<TasteGenre[]>(() => { try { return JSON.parse(localStorage.getItem('sahrae.taste.genres.v1') || '[]'); } catch { return []; } });
  const [forYou, setForYou] = useState<MediaItem[]>([]);
  const spotlightItem = useMemo(() => {
    const pool = [...awardDramas, ...sciFi, ...bingeShows, ...movies]
      .filter((m) => m && m.backdrop_path && m.id !== heroItem?.id);
    if (!pool.length) return null;
    // Stable for the day so the page does not reshuffle on every render.
    const dayKey = Math.floor(Date.now() / 86400000);
    return pool[dayKey % pool.length];
  }, [awardDramas, sciFi, bingeShows, movies, heroItem?.id]);
  useEffect(() => {
    if (authLoading) return; // wait until we know who (if anyone) is signed in
    try {
      const accountKey = onboardKey();
      if (localStorage.getItem(accountKey) === '1') { setAppOnboarded(true); return; }
      // Signing in must NOT replay onboarding. The key switches from the device
      // flag to a per-account one the moment `user` appears, so someone who
      // onboarded as a guest and then signed in used to land straight back in
      // the flow. If this device has already been through it, carry that onto
      // the account and move on. A genuinely new device still onboards once.
      if (localStorage.getItem(DEVICE_ONBOARD_KEY) === '1') {
        localStorage.setItem(accountKey, '1');
        setAppOnboarded(true);
        return;
      }
      setAppOnboarded(false);
    } catch { setAppOnboarded(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);
  const finishOnboarding = (genres: TasteGenre[]) => {
    // Always stamp the device flag too, so a later sign-in or sign-out never
    // resurfaces the flow on a device that has already completed it.
    try {
      localStorage.setItem(onboardKey(), '1');
      localStorage.setItem(DEVICE_ONBOARD_KEY, '1');
      localStorage.setItem('sahrae.taste.genres.v1', JSON.stringify(genres));
    } catch { /* ignore */ }
    setTasteGenres(genres); setAppOnboarded(true);
  };

  const handleClosePlayer = useCallback(() => {
    setPlayerConfig({ isOpen: false, mediaId: null, mediaType: null, startInInfo: false });
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setInitialLoadError(false);
    
    // Safety timeout - if TMDB is hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timed out')), 15000)
    );

    try {
      const results = await Promise.race([
        Promise.allSettled([
          fetchTrending('movie'),
          fetchTrending('tv'),
          fetchDiscover('movie', 1),
          fetchDiscover('tv', 1),
          fetchGenres('movie'),
          fetchGenres('tv'),
          fetchDiscover('movie', 1, 18, 'vote_average.desc'),
          fetchDiscover('movie', 1, 878, 'vote_average.desc'),
          fetchDiscover('tv', 1, undefined, 'vote_average.desc')
        ]),
        timeoutPromise
      ]) as PromiseSettledResult<any>[];
      
      const trendingData = results[0].status === 'fulfilled' ? results[0].value : [];
      const trendingSeriesData = results[1].status === 'fulfilled' ? results[1].value : [];
      const moviesData = results[2].status === 'fulfilled' ? results[2].value : [];
      const seriesData = results[3].status === 'fulfilled' ? results[3].value : [];
      const mGenres = results[4].status === 'fulfilled' ? results[4].value : [];
      const tGenres = results[5].status === 'fulfilled' ? results[5].value : [];
      const dramasData = results[6]?.status === 'fulfilled' ? results[6].value : [];
      const sciFiData = results[7]?.status === 'fulfilled' ? results[7].value : [];
      const bingeData = results[8]?.status === 'fulfilled' ? results[8].value : [];
      
      setTrending(trendingData);
      setTrendingSeries(trendingSeriesData);
      setMovies(moviesData);
      setSeries(seriesData);
      setMovieGenres(mGenres);
      setTvGenres(tGenres);
      setAwardDramas(dramasData);
      setSciFi(sciFiData);
      setBingeShows(bingeData);
      
      // If we literally got nothing back from the primary requests, treat as error
      if (trendingData.length === 0 && moviesData.length === 0) {
        setInitialLoadError(true);
      } else if (trendingData.length > 0) {
        setHeroItem(trendingData[Math.floor(Math.random() * Math.min(5, trendingData.length))]);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setInitialLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Personalised Home row from the onboarding taste (top picked genre).
  useEffect(() => {
    const g = tasteGenres[0]?.id;
    if (!g) { setForYou([]); return; }
    fetchDiscover('movie', 1, g, 'popularity.desc').then(setForYou).catch(() => {});
  }, [tasteGenres]);

  // Re-apply the saved equalizer to the native global audio effects on launch.
  useEffect(() => { applyEq(loadEq()); }, []);

  // ── Global tactile layer ──────────────────────────────────────────────
  // One delegated listener gives the WHOLE app a native "tap" on every
  // interactive press (buttons, links, focusables, tabs), not just music.
  // pointerdown = feedback fires the instant the finger lands. Throttled so a
  // tap never double-buzzes, and fully guarded so it no-ops off-device.
  useEffect(() => {
    let last = 0;
    const SEL = 'button, a, [role="button"], [role="tab"], [data-tv-focusable], input[type="range"], select, summary, label';
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !t.closest) return;
      const hit = t.closest(SEL);
      if (!hit) return;
      if ((hit as HTMLButtonElement).disabled) return;
      const now = Date.now();
      if (now - last < 60) return; // de-dupe rapid synthetic events
      last = now;
      haptics.tap();
    };
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });

    // (No scroll haptic — firing the vibration motor mid-scroll can micro-stutter
    //  scrolling on lower-end Android. Press haptics above stay.)
    return () => {
      window.removeEventListener('pointerdown', onDown, { capture: true } as EventListenerOptions);
    };
  }, []);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (progress.length > 0) {
        const lastWatched = progress[0];
        try {
          const recs = await fetchRecommendations(lastWatched.mediaId, lastWatched.mediaType);
          if (recs.length > 0) {
            setRecommendations({
              items: recs,
              basedOn: lastWatched.item?.title || lastWatched.item?.name || 'what you watched'
            });
          }
        } catch (error) {
          console.error("Failed to fetch recommendations:", error);
        }
      } else if (myList.length > 0) {
        const lastAdded = myList[0];
        try {
          const recs = await fetchRecommendations(lastAdded.id, lastAdded.media_type || 'movie');
          if (recs.length > 0) {
            setRecommendations({
              items: recs,
              basedOn: lastAdded.title || lastAdded.name || 'your list'
            });
          }
        } catch (error) {
          console.error("Failed to fetch recommendations:", error);
        }
      }
    };
    
    loadRecommendations();
  }, [progress.length > 0 ? progress[0].mediaId : null, myList.length > 0 ? myList[0].id : null]);

  const fetchSearchResults = async (query: string, type: 'all' | 'movie' | 'tv', genre: number | null, year: string, sortBy: string, page: number) => {
    if (!query && !genre && !year && sortBy === 'popularity.desc') {
      // Default initial discover
      const discoverType = type === 'all' ? 'movie' : type;
      const results = await fetchDiscover(discoverType, page, genre || undefined, sortBy, year || undefined);
      return { results, totalPages: 500 };
    }
    
    if (!query) {
      // Use discover API if no text query
      const discoverType = type === 'all' ? 'movie' : type; // Default to movie if all
      const results = await fetchDiscover(discoverType, page, genre || undefined, sortBy, year || undefined);
      return { results, totalPages: 500 }; // TMDB discover typically has 500 pages
    } else {
      // Use search API
      return await searchMedia(query, page);
    }
  };

  const handleSearch = async (query: string) => {
    let actualQuery = query;
    let actualGenre = searchGenre;
    let actualType = searchType;

    // Check if query matches a genre
    const lowerQuery = query.toLowerCase().trim();
    const matchedMovieGenre = movieGenres.find(g => g.name.toLowerCase() === lowerQuery);
    const matchedTvGenre = tvGenres.find(g => g.name.toLowerCase() === lowerQuery);
    
    if (matchedMovieGenre || matchedTvGenre) {
      actualQuery = '';
      actualGenre = matchedMovieGenre?.id || matchedTvGenre?.id || null;
      actualType = matchedMovieGenre ? 'movie' : 'tv';
      setSearchGenre(actualGenre);
      setSearchType(actualType);
    }

    setSearchQuery(actualQuery);
    setActiveTab('search');
    setSearchPage(1);
    setHasMoreSearch(true);
    setLoading(true);
    const timeoutId = setTimeout(() => setLoading(false), 10000);
    try {
      const { results, totalPages } = await fetchSearchResults(actualQuery, actualType, actualGenre, searchYear, searchSortBy, 1);
      setSearchResults(results);
      if (1 >= totalPages || results.length === 0) setHasMoreSearch(false);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  // Effect to refetch when filters change
  useEffect(() => {
    if (activeTab !== 'search') return;
    
    const fetchFiltered = async () => {
      setSearchPage(1);
      setHasMoreSearch(true);
      setLoading(true);
      try {
        const { results, totalPages } = await fetchSearchResults(searchQuery, searchType, searchGenre, searchYear, searchSortBy, 1);
        setSearchResults(results);
        if (1 >= totalPages || results.length === 0) setHasMoreSearch(false);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Only fetch if we have some criteria
    if (searchQuery || searchGenre || searchYear || searchSortBy !== 'popularity.desc' || searchType !== 'all') {
      fetchFiltered();
    }
  }, [searchType, searchGenre, searchYear, searchSortBy]);

  const loadMoreSearchResults = useCallback(async () => {
    if (!hasMoreSearch || loading) return;
    const nextPage = searchPage + 1;
    setSearchPage(nextPage);
    setLoading(true);
    try {
      const { results, totalPages } = await fetchSearchResults(searchQuery, searchType, searchGenre, searchYear, searchSortBy, nextPage);
      if (results.length === 0) {
        setHasMoreSearch(false);
      } else {
        setSearchResults(prev => {
          const newItems = results.filter(r => !prev.some(p => p.id === r.id));
          return [...prev, ...newItems];
        });
        if (nextPage >= totalPages) setHasMoreSearch(false);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  }, [searchPage, searchQuery, searchType, searchGenre, searchYear, searchSortBy, hasMoreSearch, loading]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreSearch) {
        loadMoreSearchResults();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMoreSearch, loadMoreSearchResults]);

  const filteredSearchResults = searchResults.filter(item => {
    // If we used discover API, it already filtered by type, genre, year.
    // If we used search API, we need to filter client-side.
    if (searchQuery) {
      if (searchType !== 'all' && item.media_type !== searchType) return false;
      
      if (searchYear) {
        const year = item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4);
        if (year !== searchYear) return false;
      }
      
      if (searchGenre && item.genre_ids && !item.genre_ids.includes(searchGenre)) {
        return false;
      }
    }
    
    return true;
  });

  const handlePlay = (id: number, type: 'movie' | 'tv', startInInfo: boolean = true, playTrailer: boolean = false, season?: number, episode?: number) => {
    haptics.press();
    setPlayerConfig({ isOpen: true, mediaId: id, mediaType: type, startInInfo, initialSeason: season, initialEpisode: episode, playTrailer });
  };

  const renderContent = () => {
    // `loading` tracks the TMDB catalog fetch. Destinations that don't read TMDB
    // must be listed here or they sit behind a skeleton waiting on data they
    // never use — 'music' was missing, so Sauti stalled on a cold start.
    const NEEDS_TMDB = !['home', 'radio', 'audio', 'music', 'podcasts', 'tv', 'sports', 'continue'].includes(activeTab);
    if (loading && NEEDS_TMDB) {
      // A skeleton in the shape of the destination, not a spinner over a blank
      // screen: the layout stays still, and the wait reads as "loading this"
      // rather than "loading something".
      if (activeTab === 'search') return <GridSkeleton />;
      if (activeTab === 'mylist' || activeTab === 'downloads') return <ListSkeleton />;
      return <BrowseSkeleton hero={false} rails={4} />;
    }

    switch (activeTab) {
      case 'home':
        if (initialLoadError) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Network Error</h2>
              <p className="text-zinc-400 max-w-sm mb-8">We had trouble connecting to the movie database. This can happen after waking up from sleep or due to an adblocker.</p>
              <button 
                onClick={loadInitialData}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-amber-950 font-bold rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Retrying...' : 'Retry Connection'}
              </button>
            </div>
          );
        }

        return (
          <>
            <Hero item={heroItem} onPlay={handlePlay} />
            <div className="-mt-16 relative z-10 pb-12">
              <div className="px-4 md:px-12"><Coachmark id="home" text="Press Play on any title to start, or tap a poster for details, trailers, and episodes." /></div>
              {/* Somewhere to return to, before anything to discover. */}
              <ContinueRow
                entries={progress.slice(0, 12).map((p) => ({
                  mediaId: p.mediaId, mediaType: p.mediaType, season: p.season, episode: p.episode, item: p.item,
                }))}
                onPlay={handlePlay}
              />
              <Top10Row items={trending} onPlay={handlePlay} />
              {forYou.length > 0 && <MediaRow title={`For You · ${tasteGenres[0]?.name}`} items={forYou} onPlay={handlePlay} defaultType="movie" isLoading={loading} />}
              <Top10Row items={trendingSeries} onPlay={handlePlay} title="Top 10 Series Today" />
              {recommendations && recommendations.items.length > 0 && (
                <MediaRow title={`Because you watched ${recommendations.basedOn}`} items={recommendations.items} onPlay={handlePlay} isLoading={loading} />
              )}
              {awardDramas.length > 0 && <MediaRow title="Award-Winning Dramas" items={awardDramas} onPlay={handlePlay} defaultType="movie" isLoading={loading} />}
              {/* A moment of scale partway down, so the page has a cadence
                  instead of nine identically-shaped rails in a row. */}
              {spotlightItem && <SpotlightBand item={spotlightItem} onPlay={handlePlay} />}
              <MediaRow title="Trending Now" items={trending} onPlay={handlePlay} isLoading={loading} />
              {sciFi.length > 0 && <MediaRow title="Sci-Fi Masterpieces" items={sciFi} onPlay={handlePlay} defaultType="movie" isLoading={loading} />}
              <MediaRow title="Popular Movies" items={movies} onPlay={handlePlay} defaultType="movie" isLoading={loading} />
              {bingeShows.length > 0 && <MediaRow title="Binge-Worthy Shows" items={bingeShows} onPlay={handlePlay} defaultType="tv" isLoading={loading} />}
              <MediaRow title="Popular Series" items={series} onPlay={handlePlay} defaultType="tv" isLoading={loading} />
            </div>
          </>
        );
      case 'movies':
        return <DiscoveryView type="movie" genres={movieGenres} onPlay={handlePlay} />;
      case 'series':
        return <DiscoveryView type="tv" genres={tvGenres} onPlay={handlePlay} />;
      case 'channels':
        return <FlowChannelsView onPlay={handlePlay} />;
      case 'mylist':
        return myList.length === 0 ? (
          <EmptyState icon={Heart} title="Your list is empty"
            message="Tap the ♥ on any movie or show to save it here and watch it later."
            actionLabel="Browse movies" onAction={() => navigate('movies')} />
        ) : (
          <MediaGrid title="My List" items={myList} onPlay={handlePlay} onRemove={toggleMyList} />
        );
      case 'continue':
        return <ContinueWatchingView onPlay={handlePlay} onBrowse={() => navigate('movies')} />;
      case 'search':
        return (
          <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto pb-12">
            {/* Category Toggle Tabs */}
            <div className="flex gap-6 border-b border-white/10 pb-4 mb-6">
              <button
                onClick={() => { haptics.tap(); setSearchCategory('media'); }}
                className={`text-lg md:text-xl font-display font-bold pb-1 transition-all relative outline-none cursor-pointer ${
                  searchCategory === 'media' ? 'text-amber-500' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Movies & Shows
                {searchCategory === 'media' && <div className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />}
              </button>
              <button
                onClick={() => { haptics.tap(); setSearchCategory('talent'); }}
                className={`text-lg md:text-xl font-display font-bold pb-1 transition-all relative outline-none cursor-pointer ${
                  searchCategory === 'talent' ? 'text-amber-500' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Directors & Actors
                {searchCategory === 'talent' && <div className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]" />}
              </button>
            </div>

            {searchCategory === 'talent' ? (
              <TalentExplorer onPlay={handlePlay} />
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                  <h2 className="text-2xl font-bold text-white">
                    {searchQuery ? `Search Results for "${searchQuery}"` : 'Discover'}
                  </h2>
                  
                  <div className="flex flex-wrap items-center gap-3 bg-zinc-900/80 p-2 rounded-xl border border-white/5">
                    <select 
                      value={searchType} 
                      onChange={(e) => setSearchType(e.target.value as any)}
                      className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="all">All Types</option>
                      <option value="movie">Movies</option>
                      <option value="tv">TV Series</option>
                    </select>

                    <select 
                      value={searchGenre || ''} 
                      onChange={(e) => setSearchGenre(e.target.value ? Number(e.target.value) : null)}
                      className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="">All Genres</option>
                      {movieGenres.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>

                    <select 
                      value={searchSortBy} 
                      onChange={(e) => setSearchSortBy(e.target.value)}
                      className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="popularity.desc">Most Popular</option>
                      <option value="vote_average.desc">Highest Rated</option>
                      <option value="primary_release_date.desc">Newest Releases</option>
                      <option value="revenue.desc">Highest Grossing</option>
                    </select>

                    <select 
                      value={searchYear} 
                      onChange={(e) => setSearchYear(e.target.value)}
                      className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="">Any Year</option>
                      {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <MediaGrid title="" items={filteredSearchResults} onPlay={handlePlay} />
                
                {searchResults.length > 0 && (
                  <div className="mt-12 flex justify-center">
                    {hasMoreSearch ? (
                      <button
                        onClick={loadMoreSearchResults}
                        disabled={loading}
                        className="bg-amber-500 hover:bg-amber-400 text-amber-950 px-8 py-3 rounded-full font-bold transition-all hover:scale-105 shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                      >
                        {loading ? (
                          <><div className="w-5 h-5 border-2 border-amber-950 border-t-transparent rounded-full animate-spin"></div> Loading…</>
                        ) : 'Load More'}
                      </button>
                    ) : (
                      <div className="text-zinc-500">No more results</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      case 'audio':
        return <AudioHubView onNav={navigate} />;
      case 'music':
        return <MusicView onNav={navigate} />;
      case 'podcasts':
        return <PodcastsView onNav={navigate} />;
      case 'downloads':
        return <DownloadsView onPlay={handlePlay} />;
      case 'tv':
        return <LiveTVView />;
      case 'sports':
        return <SportsView />;
      default:
        return null;
    }
  };

  // Shared navigation handler for the sidebar, bottom tabs, and top bar.
  const navigate = (tab: string) => {
    haptics.tap();
    setActiveTab(tab);
    if (tab !== 'search') setSearchQuery('');
  };

  // ── Voice assistant ──────────────────────────────────────────────────────
  // Names the parser matches spoken words against.
  const voiceCatalog = useMemo(() => ({
    stations: STATIONS.map((s) => s.name),
    channels: CHANNELS.map((c) => c.name),
  }), []);

  /** Execute a parsed voice command. Returns the line shown/spoken back. */
  const runVoiceCommand = useCallback(async (intent: VoiceIntent): Promise<string> => {
    switch (intent.kind) {
      case 'navigate':
        navigate(intent.tab);
        return intent.say;

      case 'search':
        await handleSearch(intent.query);
        return intent.say;

      case 'playTitle': {
        // Look the title up and open the best match straight into playback, so
        // "play Inception" actually plays rather than dumping you in a results
        // list. If nothing matches we fall back to showing the search.
        try {
          const { results } = await searchMedia(intent.query);
          const hit = results.find((r) => r.media_type === 'movie' || r.media_type === 'tv');
          if (hit) {
            handlePlay(hit.id, (hit.media_type as 'movie' | 'tv') || 'movie', false);
            return `Playing ${hit.title || hit.name}.`;
          }
        } catch { /* fall through to search */ }
        await handleSearch(intent.query);
        return `I couldn't find ${intent.query} to play — here's what I found.`;
      }

      case 'playRadio': {
        const station = STATIONS.find((s) => s.name === intent.station);
        if (!station) return `I couldn't find ${intent.station}.`;
        navigate('audio');
        radio.togglePlay(station.url, station.name);
        return `Playing ${station.name}.`;
      }

      case 'watchChannel': {
        const channel = CHANNELS.find((c) => c.name === intent.channel);
        if (!channel) return `I couldn't find ${intent.channel}.`;
        requestChannel(channel.name); // LiveTVView claims this on mount
        navigate('tv');
        return `Opening ${channel.name}.`;
      }

      case 'stop':
        radio.stop();
        handleClosePlayer();
        return 'Stopped.';

      case 'back':
        handleClosePlayer();
        navigate('home');
        return 'Back home.';

      case 'help':
      case 'unknown':
      default:
        return intent.say;
    }
  }, [radio]);

  const renderAppLayout = () => {
    if (authLoading) {
      // The very first thing anyone sees. A branded wordmark reads as "the app
      // is starting" where a bare spinner reads as "something is stuck".
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
          <h1 className="text-3xl font-display font-black tracking-tighter animate-in fade-in zoom-in-95 duration-500">
            <span className="text-gold">SAHRAE</span>
          </h1>
          <div className="w-40 h-0.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-amber-300 to-amber-600 animate-[sahrae-boot-sweep_1.3s_ease-in-out_infinite]" />
          </div>
        </div>
      );
    }

    if (user && !activeProfile) {
      return <ProfileSelection />;
    }

    return (
      <div className="aurora-bg isolate min-h-screen text-zinc-50 font-sans selection:bg-amber-500/30 transition-colors duration-300">
        <SplashIntro />
        {!appOnboarded && <Onboarding onDone={finishOnboarding} />}
        {/* Ambient cinematic glow field — viewport-fixed, above the base canvas
            but behind all content (root is `isolate` so -z stays contained). */}
        <div className="aurora-glow pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
        {/* ── Spotify-style shell: left sidebar (desktop) + bottom tabs (mobile) ── */}
        <Sidebar activeTab={activeTab} setActiveTab={navigate} collapsed={navCollapsed} onToggle={() => setNavCollapsed((v) => !v)} />
        <BottomTabBar activeTab={activeTab} setActiveTab={navigate} />

        {/* Main column shifts right of the sidebar on desktop; pads for the
            bottom tab bar + mini player on mobile. */}
        <div className="md:pl-16 lg:pl-64 tv-shell">
          <Navbar
            activeTab={activeTab}
            setActiveTab={navigate}
            onSearch={handleSearch}
            onPlay={handlePlay}
          />

          <main className="pb-28 md:pb-0">
            {/* Cinematic crossfade between sections. Opacity-only on purpose:
                a transform here would re-anchor fixed overlays (e.g. the Sports
                fullscreen player) to this wrapper instead of the viewport. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <PlayerModal 
          isOpen={playerConfig.isOpen}
          mediaId={playerConfig.mediaId}
          mediaType={playerConfig.mediaType}
          startInInfo={playerConfig.startInInfo}
          initialSeason={playerConfig.initialSeason}
          initialEpisode={playerConfig.initialEpisode}
          playTrailer={playerConfig.playTrailer}
          onClose={handleClosePlayer}
        />
        
        <GlobalAudioPlayer />
        <MusicPlayer />
        <PodcastProgressTracker />
        <AddToPlaylistSheet />
        <VoiceAssistant catalog={voiceCatalog} onCommand={runVoiceCommand} />
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
      </AnimatePresence>
      {renderAppLayout()}
    </>
  );
}
