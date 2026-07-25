import { clearHdArtworkCache } from './albumArt';
import { clearWorkingInstance } from './ytmusic';

export interface CacheStats {
  tmdbCount: number;
  tmdbSizeKb: number;
  sportsFeedCached: boolean;
  sportsFeedSizeKb: number;
  totalSizeKb: number;
}

/**
 * Calculates estimate size of a string in KiB.
 */
function getByteSize(str: string): number {
  return new Blob([str]).size / 1024;
}

/**
 * Scans localStorage and returns details about items that can be cleared.
 */
export function getCacheStats(): CacheStats {
  let tmdbCount = 0;
  let tmdbSizeKb = 0;
  let sportsFeedCached = false;
  let sportsFeedSizeKb = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const val = localStorage.getItem(key) || '';
      if (key.startsWith('sahrae_tmdb_details_') || key.startsWith('sahrae_tmdb_genres_')) {
        tmdbCount++;
        tmdbSizeKb += getByteSize(val);
      } else if (key === 'sahrae.sportsFeed.v1') {
        sportsFeedCached = true;
        sportsFeedSizeKb += getByteSize(val);
      }
    }
  } catch (e) {
    console.error('Error calculating cache stats:', e);
  }

  return {
    tmdbCount,
    tmdbSizeKb: Math.round(tmdbSizeKb * 100) / 100,
    sportsFeedCached,
    sportsFeedSizeKb: Math.round(sportsFeedSizeKb * 100) / 100,
    totalSizeKb: Math.round((tmdbSizeKb + sportsFeedSizeKb) * 100) / 100,
  };
}

/**
 * Selectively clears stale media metadata (TMDB caches, sports feed, etc)
 * while preserving important user data like watch progress, playlists, lists, followed podcasts.
 */
export function clearMediaCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Only remove TMDB and Sports feed metadata caches
      if (
        key.startsWith('sahrae_tmdb_details_') || 
        key.startsWith('sahrae_tmdb_genres_') || 
        key === 'sahrae.sportsFeed.v1'
      ) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear memory-level caches
    clearHdArtworkCache();
    clearWorkingInstance();

    console.log(`Successfully cleared ${keysToRemove.length} cached media metadata keys.`);
  } catch (e) {
    console.error('Error clearing media cache:', e);
  }
}
