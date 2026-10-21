import { genreById, topGenres, TASTE_KEY, type GenreTaste } from './musicCatalog';
import { COMPETITIONS } from './matchdayCore';
import { describe, followedCompetitions, screenTaste, type Profile, type Watched } from './tasteProfileCore';

export { describe, type Profile } from './tasteProfileCore';

/**
 * The viewer's taste across Sahrae, read from what is already kept on the
 * device: watch history, the onboarding picks, music listening (the same
 * taste the Daily Mixes use) and Matchday reminders. Nothing new is
 * collected and nothing leaves the device.
 */

const read = <T,>(key: string, fallback: T): T => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
};

export function buildProfile(watched: Watched[], picked: { id: number }[], now = Date.now()): Profile {
  const screen = screenTaste(watched, picked, now);
  const taste = read<GenreTaste>(TASTE_KEY, {});
  // No fallback here: an empty music history should say nothing, not the region's defaults.
  const music = topGenres(taste, 2, now, []).map((id) => ({ id, name: genreById(id)?.name || id }));
  const reminders = Object.keys(read<Record<string, unknown>>('sahrae.reminders.v1', {}));
  const sports = followedCompetitions(reminders).map((code) => ({ code, name: COMPETITIONS.find((c) => c.code === code)?.name || code }));
  return { screen, music, sports };
}

export const profileLine = describe;
