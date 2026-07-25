const API_KEY = 'f1a823e739bfce21511a8e2f8e42befc';
const BASE_URL = 'https://api.themoviedb.org/3';

export interface Genre {
  id: number;
  name: string;
}

export interface Cast {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface Crew {
  id: number;
  name: string;
  job: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  iso_639_1?: string;
}

export interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type?: 'movie' | 'tv';
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

export interface Season {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  air_date: string;
  episode_number: number;
  season_number: number;
  still_path?: string | null;
  runtime?: number;
}

export interface SeasonDetails {
  _id: string;
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episodes: Episode[];
}

export interface MediaDetails extends MediaItem {
  credits?: {
    cast: Cast[];
    crew: Crew[];
  };
  videos?: {
    results: Video[];
  };
  genres?: Genre[];
  runtime?: number;
  episode_run_time?: number[];
  seasons?: Season[];
  streams?: { name: string; url: string; type: 'iframe' | 'm3u8' }[];
  next_episode_to_air?: Episode | null;
  last_episode_to_air?: Episode | null;
  status?: string;
}

export const fetchTrending = async (type: 'movie' | 'tv' = 'movie'): Promise<MediaItem[]> => {
  const res = await fetch(`${BASE_URL}/trending/${type}/week?api_key=${API_KEY}&language=en-US`);
  const data = await res.json();
  return data.results.map((item: any) => ({ ...item, media_type: type }));
};

export const fetchSeasonDetails = async (tvId: number, seasonNumber: number): Promise<SeasonDetails> => {
  const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}&language=en-US`);
  return await res.json();
};

export const searchMedia = async (query: string, page: number = 1): Promise<{results: MediaItem[], totalPages: number}> => {
  const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=${page}`);
  const data = await res.json();
  return {
    results: data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv'),
    totalPages: data.total_pages
  };
};

export const fetchGenres = async (type: 'movie' | 'tv' = 'movie'): Promise<Genre[]> => {
  const cacheKey = `sahrae_tmdb_genres_${type}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Valid for 7 days
      if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return parsed.data;
      }
    }
  } catch (e) {
    console.error('Error reading genres cache', e);
  }

  const res = await fetch(`${BASE_URL}/genre/${type}/list?api_key=${API_KEY}&language=en-US`);
  const data = await res.json();
  const result = data.genres;

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: result }));
  } catch (e) {
    console.error('Error saving genres cache', e);
  }

  return result;
};

/**
 * Minimum votes required before a title may appear in a rating-sorted shelf.
 *
 * Sorting by `vote_average.desc` with no floor returns films with a single
 * 10/10 vote, which is why the "Award-Winning Dramas" rail was 20 titles nobody
 * has heard of, every one of them showing a perfect score. TMDB's own "top
 * rated" lists apply a vote floor for exactly this reason.
 */
const MIN_VOTES_FOR_RATING_SORT = 300;

export const fetchDiscover = async (type: 'movie' | 'tv' = 'movie', page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: string): Promise<MediaItem[]> => {
  const genreParam = genreId ? `&with_genres=${genreId}` : '';
  const sortParam = `&sort_by=${sortBy}`;
  const yearParam = year ? (type === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`) : '';
  // Only rating sorts need the floor; popularity/date sorts are already sane and
  // a floor there would needlessly hide new releases.
  const voteFloorParam = sortBy.startsWith('vote_average')
    ? `&vote_count.gte=${MIN_VOTES_FOR_RATING_SORT}`
    : '';
  const res = await fetch(`${BASE_URL}/discover/${type}?api_key=${API_KEY}&language=en-US&include_adult=false&page=${page}${genreParam}${sortParam}${yearParam}${voteFloorParam}`);
  if (!res.ok) throw new Error(`TMDB discover failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.results)
    ? data.results.map((item: any) => ({ ...item, media_type: type }))
    : [];
};

const DETAILS_KEY_PREFIX = 'sahrae_tmdb_details_';
/** Hard cap on cached title blobs. Each is ~10-40 KB with credits and videos. */
const MAX_CACHED_DETAILS = 250;

/**
 * Write a title blob to the details cache, evicting the oldest entries when the
 * cap or the storage quota is reached.
 *
 * Why this is not just a try/catch: localStorage is a single ~5 MB bucket shared
 * by EVERYTHING this app persists. Caching one blob per title viewed, with no
 * eviction, meant a browsing session eventually filled it — and once full, every
 * other `setItem` in the app starts throwing too. Watch progress, My List and
 * the auth session would silently stop saving, with the only remedy a "clear
 * cache" button in Settings that a user has no reason to look for. Bounding the
 * cache keeps the failure contained to what is genuinely disposable.
 */
function writeDetailsCache(key: string, payload: { timestamp: number; data: unknown }): void {
  const serialized = JSON.stringify(payload);
  try {
    evictOldestDetails(MAX_CACHED_DETAILS - 1);
    localStorage.setItem(key, serialized);
  } catch {
    // Quota hit even after trimming (other data may dominate). Drop to a small
    // working set and try once more; if it still fails the cache is simply
    // skipped — the value is a cache, never the source of truth.
    try {
      evictOldestDetails(40);
      localStorage.setItem(key, serialized);
    } catch {
      /* cache unavailable — fetches still work, just uncached */
    }
  }
}

/** Trim the details cache down to at most `keep` entries, oldest evicted first. */
function evictOldestDetails(keep: number): void {
  const entries: { key: string; timestamp: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(DETAILS_KEY_PREFIX)) continue;
    let timestamp = 0;
    try {
      timestamp = JSON.parse(localStorage.getItem(k) || '{}').timestamp || 0;
    } catch {
      /* unparseable entry — timestamp 0 sends it to the front of the queue */
    }
    entries.push({ key: k, timestamp });
  }
  if (entries.length <= keep) return;
  entries.sort((a, b) => a.timestamp - b.timestamp);
  for (const e of entries.slice(0, entries.length - keep)) {
    try {
      localStorage.removeItem(e.key);
    } catch {
      /* ignore */
    }
  }
}

export const fetchMediaDetails = async (id: number, type: 'movie' | 'tv' = 'movie'): Promise<MediaDetails> => {
  const cacheKey = `sahrae_tmdb_details_${type}_${id}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Valid for 3 days
      if (Date.now() - parsed.timestamp < 3 * 24 * 60 * 60 * 1000) {
        return parsed.data;
      }
    }
  } catch (e) {
    console.error('Error reading media details cache', e);
  }

  const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&append_to_response=credits,videos&language=en-US&include_video_language=en,null`);
  const data = await res.json();
  const result = { ...data, media_type: type };

  writeDetailsCache(cacheKey, { timestamp: Date.now(), data: result });

  return result;
};

export const fetchRecommendations = async (id: number, type: 'movie' | 'tv' = 'movie'): Promise<MediaItem[]> => {
  const res = await fetch(`${BASE_URL}/${type}/${id}/recommendations?api_key=${API_KEY}&language=en-US&page=1`);
  const data = await res.json();
  return data.results.map((item: any) => ({ ...item, media_type: type }));
};

export const fetchSimilar = async (id: number, type: 'movie' | 'tv' = 'movie'): Promise<MediaItem[]> => {
  const res = await fetch(`${BASE_URL}/${type}/${id}/similar?api_key=${API_KEY}&language=en-US&page=1`);
  const data = await res.json();
  return data.results.map((item: any) => ({ ...item, media_type: type }));
};

/**
 * Inline 2:3 poster placeholder.
 *
 * This used to point at via.placeholder.com, which no longer serves images — so
 * every title with a missing poster produced a broken image plus a hanging
 * request to a third party that also learned how often our users hit gaps. A
 * data URI renders instantly, offline, and tells nobody anything.
 */
const POSTER_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
      <rect width="500" height="750" fill="#18181b"/>
      <path d="M250 330a34 34 0 1 0 0-68 34 34 0 0 0 0 68Zm-95 130 62-78 44 52 34-38 50 64Z" fill="#3f3f46"/>
      <text x="250" y="560" fill="#52525b" font-family="system-ui,sans-serif" font-size="28" text-anchor="middle">No artwork</text>
    </svg>`,
  );

export const getImageUrl = (path: string | null, size: 'w500' | 'original' | 'w780' | 'w185' | 'w300' = 'w500') => {
  if (!path) return POSTER_PLACEHOLDER;
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const searchPeople = async (query: string, page: number = 1): Promise<{results: any[], totalPages: number}> => {
  const res = await fetch(`${BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=${page}`);
  const data = await res.json();
  return {
    results: data.results || [],
    totalPages: data.total_pages || 1
  };
};

export const fetchPopularPeople = async (page: number = 1): Promise<{results: any[], totalPages: number}> => {
  const res = await fetch(`${BASE_URL}/person/popular?api_key=${API_KEY}&language=en-US&page=${page}`);
  const data = await res.json();
  return {
    results: data.results || [],
    totalPages: data.total_pages || 1
  };
};

export const fetchPersonDetails = async (id: number): Promise<any> => {
  const res = await fetch(`${BASE_URL}/person/${id}?api_key=${API_KEY}&language=en-US&append_to_response=combined_credits`);
  return await res.json();
};

