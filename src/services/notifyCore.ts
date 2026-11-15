/**
 * What Sahrae tells a viewer about, worked out from what they watch (owner,
 * 2026-11-15: the bell only ever held a welcome card).
 *
 * Pure logic, no storage and no network, so it is tested as it stands
 * (notify-check.mjs). services/notify.ts feeds it and delivers what it returns.
 *
 *   SPORT   Opening a match is the signal. A team opened twice is a team the
 *           viewer follows; a series without teams (Formula 1, WWE, UFC) is
 *           followed from the first time, since nobody opens a Grand Prix by
 *           accident. Each fades with a 60 day half-life, so a club watched
 *           once at a friend's stops being announced.
 *   SERIES  A series being watched or on My List: the next episode, the day
 *           after it airs (servers carry it by then), and one that came out
 *           since the last one watched.
 *   FILMS   A film on My List reaching release, and now and then one new film
 *           in the genre watched most.
 */
import { sameTeam } from './sportsMerge.ts';

export type NoteKind = 'sport' | 'episode' | 'film' | 'pick';

export interface Note {
  /** Stable: the same match or episode never makes a second note. */
  id: string;
  kind: NoteKind;
  title: string;
  message: string;
  /** When the device should show it. In the past or absent: at once. */
  at?: number;
  /** When it joins the bell's list, if earlier than `at` (a match is listed from the morning, announced before kick-off). */
  listAt?: number;
  mediaId?: number;
  mediaType?: 'movie' | 'tv';
  posterPath?: string | null;
  /** Sport: the feed event to open, and the picture beside it. */
  eventId?: string;
  image?: string;
}

// ── Sport ───────────────────────────────────────────────────────────────────

export interface SportsWatch { ts: number; category: string; league?: string; title: string; teams: string[] }
export interface Follow { kind: 'team' | 'series'; key: string; name: string; category: string; weight: number }
export interface EventLike {
  id: string; title: string; category: string; date: number; league?: string; live?: boolean; poster?: string;
  teams?: { home?: { name?: string; badge?: string }; away?: { name?: string; badge?: string } } | null;
}

export const SPORT_HALF_LIFE_MS = 60 * 86_400_000;
export const TEAM_FOLLOW_AT = 1.6;   // Two recent matches.
export const SERIES_FOLLOW_AT = 0.7; // One recent event.
export const MAX_HISTORY = 120;

/** Competitions with no home and away side, by the words their events carry. */
const SERIES: [RegExp, string][] = [
  [/\b(formula\s*1|formula one|f1)\b/i, 'Formula 1'],
  [/\b(formula\s*2|f2)\b/i, 'Formula 2'],
  [/\bformula\s*e\b/i, 'Formula E'],
  [/\bmoto\s*gp\b/i, 'MotoGP'],
  [/\bnascar\b/i, 'NASCAR'],
  [/\bindy\s*car\b/i, 'IndyCar'],
  [/\b(wrc|world rally)\b/i, 'World Rally'],
  [/\b(wec|le mans)\b/i, 'Endurance racing'],
  [/\bwwe\b/i, 'WWE'],
  [/\baew\b/i, 'AEW'],
  [/\bufc\b/i, 'UFC'],
  [/\b(pfl|bellator)\b/i, 'MMA'],
  [/\bboxing\b/i, 'Boxing'],
  [/\b(pga|liv golf|ryder cup|masters)\b/i, 'Golf'],
  [/\b(atp|wta|wimbledon|roland garros|us open|australian open)\b/i, 'Tennis'],
  [/\bdarts\b/i, 'Darts'],
];
const CATEGORY_NAME: Record<string, string> = {
  'motor-sports': 'Motorsport', fight: 'Fight sports', golf: 'Golf', tennis: 'Tennis', darts: 'Darts',
  football: 'Football', basketball: 'Basketball', 'american-football': 'American football', baseball: 'Baseball',
  hockey: 'Hockey', cricket: 'Cricket', rugby: 'Rugby',
};
/** Sports whose events are a field, not two sides: the sport itself can be followed. */
const FIELD_SPORTS = new Set(['motor-sports', 'fight', 'golf', 'tennis', 'darts']);

/** The series an event belongs to ("Formula 1"), or the sport for a field sport, or null. */
export function seriesOf(e: { title: string; league?: string; category: string }): string | null {
  const text = `${e.league || ''} ${e.title || ''}`;
  for (const [re, name] of SERIES) if (re.test(text)) return name;
  return FIELD_SPORTS.has(e.category) ? CATEGORY_NAME[e.category] || null : null;
}

const teamsOf = (e: EventLike): string[] => [e.teams?.home?.name, e.teams?.away?.name].filter((n): n is string => !!n && n.trim().length > 1);

/** What opening this event says about the viewer. */
export function watchOf(e: EventLike, now: number): SportsWatch {
  return { ts: now, category: e.category, league: e.league, title: e.title, teams: teamsOf(e) };
}

const decay = (ts: number, now: number) => Math.pow(0.5, Math.max(0, now - ts) / SPORT_HALF_LIFE_MS);

/** The teams and series this viewer follows, strongest first. `muted` holds keys they switched off. */
export function followsFrom(history: SportsWatch[], now: number, muted: string[] = []): Follow[] {
  const teams: Follow[] = [];
  const series = new Map<string, Follow>();
  for (const w of history) {
    const d = decay(w.ts, now);
    if (w.teams.length === 2) {
      for (const name of w.teams) {
        const hit = teams.find((t) => t.category === w.category && sameTeam(t.name, name));
        if (hit) { hit.weight += d; if (name.length > hit.name.length) hit.name = name; }
        else teams.push({ kind: 'team', key: `team:${w.category}:${name.toLowerCase()}`, name, category: w.category, weight: d });
      }
    } else {
      const s = seriesOf(w);
      if (!s) continue;
      const key = `series:${s.toLowerCase()}`;
      const hit = series.get(key);
      if (hit) hit.weight += d; else series.set(key, { kind: 'series', key, name: s, category: w.category, weight: d });
    }
  }
  return [
    ...teams.filter((t) => t.weight >= TEAM_FOLLOW_AT),
    ...[...series.values()].filter((s) => s.weight >= SERIES_FOLLOW_AT),
  ].filter((f) => !muted.includes(f.key)).sort((a, b) => b.weight - a.weight);
}

/** The follow an event belongs to, if any. */
export function followFor(e: EventLike, follows: Follow[]): Follow | null {
  const names = teamsOf(e);
  if (names.length === 2) {
    return follows.find((f) => f.kind === 'team' && f.category === e.category && names.some((n) => sameTeam(f.name, n))) || null;
  }
  const s = seriesOf(e);
  return (s && follows.find((f) => f.kind === 'series' && f.name === s)) || null;
}

const DAY = 86_400_000;
export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const dayName = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'long' });
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const eventName = (e: EventLike) => { const n = teamsOf(e); return n.length === 2 ? `${n[0]} v ${n[1]}` : e.title; };

/** How long before the start the device speaks up. */
export const LEAD_MS = 15 * 60_000;
/** How long before the start a match is listed in the bell. */
export const LIST_AHEAD_MS = 12 * 3_600_000;
/** A match that started this long ago is still worth a "live now". */
const LIVE_GRACE_MS = 100 * 60_000;
export const MAX_SPORT_NOTES = 6;

/**
 * Notes for the followed matches of the next two days. One per match: timed
 * for a quarter of an hour before the start, or at once when it is already on.
 */
export function sportNotes(events: EventLike[], follows: Follow[], now: number): Note[] {
  const out: Note[] = [];
  const seen = new Set<string>();
  const soon = events
    .filter((e) => e.date > 0 && e.date < now + 2 * DAY && (e.date > now - LIVE_GRACE_MS || e.live === true))
    .sort((a, b) => a.date - b.date);
  for (const e of soon) {
    const f = followFor(e, follows);
    if (!f) continue;
    const id = `sport_${slug(eventName(e))}_${dayKey(e.date)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const started = e.date <= now;
    // The day by name: a note read tomorrow must not still say "tomorrow".
    const when = started ? 'Live now' : `${dayName(e.date)} at ${clock(e.date)}`;
    const why = `Because you watch ${f.name}.`;
    out.push({
      id, kind: 'sport', eventId: e.id,
      title: started ? `${eventName(e)} is live` : eventName(e),
      message: `${when}${e.league ? ` · ${e.league}` : ''}. ${why}`,
      at: started ? undefined : Math.max(now, e.date - LEAD_MS),
      listAt: started ? undefined : Math.max(now, e.date - LIST_AHEAD_MS),
      image: e.poster || e.teams?.home?.badge || e.teams?.away?.badge,
    });
    if (out.length >= MAX_SPORT_NOTES) break;
  }
  return out;
}

// ── Series and films ────────────────────────────────────────────────────────

export interface EpisodeRef { season_number: number; episode_number: number; air_date?: string | null }
export interface ShowFacts {
  id: number; name: string; posterPath?: string | null;
  last?: EpisodeRef | null; next?: EpisodeRef | null;
  /** The furthest episode this viewer reached, when they have started it. */
  watched?: { season: number; episode: number } | null;
}

/** A date from the catalogue ("2026-11-20") as local midnight; NaN when it is not one. */
export function localDay(date?: string | null): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN;
}

const after = (a: EpisodeRef, w: { season: number; episode: number }) =>
  a.season_number > w.season || (a.season_number === w.season && a.episode_number > w.episode);
const ep = (e: EpisodeRef) => `S${e.season_number} E${e.episode_number}`;
/** The morning after it airs: by then the servers have it. */
const OUT_AT_MS = DAY + 9 * 3_600_000;

export function episodeNotes(shows: ShowFacts[], now: number): Note[] {
  const out: Note[] = [];
  for (const s of shows) {
    const base = { kind: 'episode' as const, mediaId: s.id, mediaType: 'tv' as const, posterPath: s.posterPath ?? null };
    // Out already, within the last ten days, and further than the viewer has got.
    if (s.last) {
      const aired = localDay(s.last.air_date);
      if (aired <= now && now - aired <= 10 * DAY && (!s.watched || after(s.last, s.watched))) {
        out.push({ ...base, id: `ep_${s.id}_${s.last.season_number}_${s.last.episode_number}`, title: `New episode: ${s.name}`, message: `${ep(s.last)} is out. Pick up where you left off.` });
      }
    }
    // Coming within a week: said once it can be watched.
    if (s.next) {
      const airs = localDay(s.next.air_date);
      if (airs > now - DAY && airs - now <= 7 * DAY) {
        const at = airs + OUT_AT_MS;
        if (at > now) out.push({ ...base, id: `ep_${s.id}_${s.next.season_number}_${s.next.episode_number}`, title: `New episode: ${s.name}`, message: `${ep(s.next)} is out.`, at });
      }
    }
  }
  return out;
}

export interface FilmFacts { id: number; title: string; posterPath?: string | null; releaseDate?: string | null }

/** A film saved to My List reaching its release, within the last two weeks or the next one. */
export function filmNotes(films: FilmFacts[], now: number): Note[] {
  const out: Note[] = [];
  for (const f of films) {
    const day = localDay(f.releaseDate);
    if (Number.isNaN(day)) continue;
    const base = { id: `film_${f.id}`, kind: 'film' as const, mediaId: f.id, mediaType: 'movie' as const, posterPath: f.posterPath ?? null };
    if (day <= now && now - day <= 14 * DAY) out.push({ ...base, title: `Out now: ${f.title}`, message: 'A film on your list has been released.' });
    else if (day > now && day - now <= 7 * DAY) out.push({ ...base, title: `Out now: ${f.title}`, message: 'A film on your list has been released.', at: day + 9 * 3_600_000 });
  }
  return out;
}

export interface Candidate { id: number; title: string; posterPath?: string | null; genreIds: number[]; mediaType: 'movie' | 'tv' }
export const PICK_EVERY_MS = 3 * DAY;

/**
 * One new title in the genre watched most, no more than every three days, and
 * never one already watched, saved or announced.
 */
export function pickNote(candidates: Candidate[], topGenres: { id: number; name: string }[], known: Set<string>, lastPickAt: number, now: number): Note | null {
  if (!topGenres.length || now - lastPickAt < PICK_EVERY_MS) return null;
  for (const g of topGenres) {
    const c = candidates.find((x) => x.genreIds.includes(g.id) && !known.has(`${x.mediaType}-${x.id}`));
    if (c) {
      return {
        id: `pick_${c.mediaType}_${c.id}`, kind: 'pick', mediaId: c.id, mediaType: c.mediaType, posterPath: c.posterPath ?? null,
        title: `New for you: ${c.title}`, message: `Trending this week. Because you watch ${g.name.toLowerCase()}.`,
      };
    }
  }
  return null;
}

// ── The list the bell shows ─────────────────────────────────────────────────

export interface StoredNote extends Note { timestamp: number; read: boolean }
export const MAX_STORED = 50;

/**
 * Add what is new and due. A note timed for later joins the list when its
 * time comes (a match, twelve hours before it starts; an episode, once it is out).
 * `seen` holds every id ever shown: a cleared note does not come back.
 */
export function mergeNotes(stored: StoredNote[], fresh: Note[], seen: string[], now: number): { list: StoredNote[]; seen: string[]; added: StoredNote[] } {
  const have = new Set([...stored.map((n) => n.id), ...seen]);
  const added: StoredNote[] = [];
  for (const n of fresh) {
    const joins = n.listAt ?? n.at;
    if (have.has(n.id) || (joins && joins > now)) continue;
    have.add(n.id);
    added.push({ ...n, timestamp: now, read: false });
  }
  return {
    list: [...added, ...stored].slice(0, MAX_STORED),
    seen: [...seen, ...added.map((n) => n.id)].slice(-400),
    added,
  };
}

/** A number the phone's notification system can hold, from a note's id. */
export function deviceId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000 + 1;
}
