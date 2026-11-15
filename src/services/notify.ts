/**
 * The notifications, run: reads what the viewer watches, asks the sports feed
 * and the catalogue what is coming, and puts the result in the bell and on the
 * device. The decisions are in notifyCore.ts; this file is storage and network.
 */
import { loadSportsFeed, type FeedEvent } from './sportsFeed';
import { fetchAiring, fetchMediaDetails, fetchTrending } from './tmdb';
import { deliverToDevice } from './deviceNotify';
import {
  episodeNotes, filmNotes, followsFrom, mergeNotes, pickNote, sportNotes, watchOf, MAX_HISTORY,
  type Follow, type Note, type ShowFacts, type SportsWatch, type StoredNote,
} from './notifyCore';
import { screenTaste, type Watched } from './tasteProfileCore';

export const LIST_KEY = 'sahrae_notifications';
export const CHANGED = 'sahrae:notifications';
const SEEN_KEY = 'sahrae.notif.seen.v1';
export const WATCHED_KEY = 'sahrae.sports.watched.v1';
const MUTED_KEY = 'sahrae.sports.muted.v1';
const PICK_KEY = 'sahrae.notif.lastPick.v1';
export const FOLLOWS_CHANGED = 'sahrae:follows';

const read = <T,>(key: string, fallback: T): T => {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
};
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full: this run still worked */ } };

// ── What the viewer follows ─────────────────────────────────────────────────

/** A match was opened: that is how Sahrae learns the teams and sports. */
export function noteSportsWatch(e: FeedEvent): void {
  const now = Date.now();
  const list = read<SportsWatch[]>(WATCHED_KEY, []);
  const w = watchOf(e, now);
  // Opening the same match again within the day is one watch, not two.
  if (list.some((x) => x.title === w.title && now - x.ts < 20 * 3_600_000)) return;
  write(WATCHED_KEY, [...list, w].slice(-MAX_HISTORY));
  window.dispatchEvent(new Event(FOLLOWS_CHANGED));
}

export function follows(now = Date.now()): Follow[] {
  return followsFrom(read<SportsWatch[]>(WATCHED_KEY, []), now, read<string[]>(MUTED_KEY, []));
}

/** Stop hearing about a team or a series. */
export function muteFollow(key: string): void {
  write(MUTED_KEY, [...new Set([...read<string[]>(MUTED_KEY, []), key])]);
  window.dispatchEvent(new Event(FOLLOWS_CHANGED));
}

// ── The run ─────────────────────────────────────────────────────────────────

export interface ListItem { id: number; media_type?: 'movie' | 'tv'; title?: string; name?: string; poster_path?: string | null; release_date?: string }
export interface Progress extends Watched { mediaId: number; season?: number; episode?: number; removed?: unknown; item: Watched['item'] & { name?: string; title?: string; poster_path?: string | null } }
export interface RunInput { myList: ListItem[]; progress: Progress[] }

const TITLES_EVERY_MS = 3 * 3_600_000;
let running = false;
let cachedTitleNotes: Note[] = [];
let titlesAt = 0;

async function titleNotes(input: RunInput, now: number): Promise<Note[]> {
  // Series: the ones being watched, then the ones saved. Twelve at most, one light request each.
  const watching = input.progress.filter((p) => p.mediaType === 'tv' && !p.removed);
  const ids = [...new Set([...watching.map((p) => p.mediaId), ...input.myList.filter((i) => i.media_type === 'tv').map((i) => i.id)])].slice(0, 12);
  const shows: ShowFacts[] = [];
  for (const id of ids) {
    const a = await fetchAiring(id);
    if (!a) continue;
    const w = watching.find((p) => p.mediaId === id);
    shows.push({ id, name: a.name, posterPath: a.poster_path, last: a.last, next: a.next, watched: w?.season && w?.episode ? { season: w.season, episode: w.episode } : null });
  }
  const notes: Note[] = episodeNotes(shows, now);

  // Films on My List: the release date saved with them, or looked up for the few without one.
  const films = input.myList.filter((i) => i.media_type === 'movie').slice(0, 15);
  const facts = [];
  for (const f of films) {
    let date = f.release_date;
    if (!date) { try { date = (await fetchMediaDetails(f.id, 'movie')).release_date; } catch { date = undefined; } }
    facts.push({ id: f.id, title: f.title || f.name || 'A film', posterPath: f.poster_path, releaseDate: date });
  }
  notes.push(...filmNotes(facts, now));

  // One new title in the genre watched most.
  const top = screenTaste(input.progress, read<{ id: number }[]>('sahrae.taste.genres.v1', []), now, 2);
  if (top.length) {
    try {
      const type = top[0].type === 'tv' ? 'tv' : 'movie';
      const trending = await fetchTrending(type);
      const known = new Set<string>([
        ...input.progress.map((p) => `${p.mediaType}-${p.mediaId}`),
        ...input.myList.map((i) => `${i.media_type}-${i.id}`),
        ...read<string[]>(SEEN_KEY, []).filter((s) => s.startsWith('pick_')).map((s) => s.replace('pick_', '').replace('_', '-')),
      ]);
      const pick = pickNote(
        trending.map((t) => ({ id: t.id, title: t.title || t.name || '', posterPath: t.poster_path, genreIds: t.genre_ids || [], mediaType: type as 'movie' | 'tv' })),
        top, known, read<number>(PICK_KEY, 0), now,
      );
      if (pick) { notes.push(pick); write(PICK_KEY, now); }
    } catch { /* no pick this time */ }
  }
  return notes;
}

/**
 * One check. Sport every time (the feed is cached for minutes); the catalogue
 * every three hours. Safe to call often: it does nothing while one is running.
 */
export async function runNotifications(input: RunInput): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const fresh: Note[] = [];

    const f = follows(now);
    if (f.length) {
      try { fresh.push(...sportNotes((await loadSportsFeed()).events, f, now)); } catch { /* the feed did not answer */ }
    }

    if (now - titlesAt > TITLES_EVERY_MS) {
      try { cachedTitleNotes = await titleNotes(input, now); titlesAt = now; } catch { /* next time */ }
    }
    fresh.push(...cachedTitleNotes);

    const stored = read<StoredNote[]>(LIST_KEY, []).filter((n) => n && n.id !== 'welcome_notif');
    const merged = mergeNotes(stored, fresh, read<string[]>(SEEN_KEY, []), Date.now());
    if (merged.added.length || stored.length !== read<StoredNote[]>(LIST_KEY, []).length) {
      write(LIST_KEY, merged.list);
      write(SEEN_KEY, merged.seen);
      window.dispatchEvent(new Event(CHANGED));
    }
    // On the device: at once only what is due at once; a listed match waits for its quarter of an hour.
    await deliverToDevice(merged.added.filter((n) => !n.at || n.at <= now), fresh.filter((n) => n.at && n.at > now), now);
  } finally {
    running = false;
  }
}

// ── Opening what a notification was about ───────────────────────────────────

let pendingMatch: { eventId?: string; title: string } | null = null;
export const MATCH_PENDING = 'sahrae:match-pending';
/** Ask the Sports page to open this match once it has its schedule. */
export function askForMatch(eventId: string | undefined, title: string): void {
  pendingMatch = { eventId, title: title.replace(/ is live$/, '') };
  window.dispatchEvent(new Event(MATCH_PENDING));
}
/** The match a notification asked for, taken once. */
export function takePendingMatch(events: FeedEvent[]): FeedEvent | null {
  const p = pendingMatch;
  if (!p || !events.length) return null;
  pendingMatch = null;
  const name = (e: FeedEvent) => (e.teams?.home?.name && e.teams?.away?.name ? `${e.teams.home.name} v ${e.teams.away.name}` : e.title);
  return events.find((e) => e.id === p.eventId) || events.find((e) => name(e) === p.title) || null;
}
