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
  const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}`);
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

export const fetchDiscover = async (type: 'movie' | 'tv' = 'movie', page: number = 1, genreId?: number, sortBy: string = 'popularity.desc', year?: string): Promise<MediaItem[]> => {
  const genreParam = genreId ? `&with_genres=${genreId}` : '';
  const sortParam = `&sort_by=${sortBy}`;
  const yearParam = year ? (type === 'movie' ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`) : '';
  const res = await fetch(`${BASE_URL}/discover/${type}?api_key=${API_KEY}&language=en-US&page=${page}${genreParam}${sortParam}${yearParam}`);
  const data = await res.json();
  return data.results.map((item: any) => ({ ...item, media_type: type }));
};

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

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: result }));
  } catch (e) {
    console.error('Error saving media details cache', e);
  }

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

export const getImageUrl = (path: string | null, size: 'w500' | 'original' | 'w780' | 'w185' | 'w300' = 'w500') => {
  if (!path) return 'https://via.placeholder.com/500x750?text=No+Image';
  if (path.startsWith('http')) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
};

export const searchPeople = async (query: string, page: number = 1): Promise<{results: any[], totalPages: number}> => {
  const res = await fetch(`${BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=${page}`);
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

