/**
 * Several live-sports schedules as one: the same match from every source that
 * carries it, with all their feeds under it.
 *
 * Streamed closed on 2026-10-26 and pointed to its successors; the app then
 * read only ppv.st, so every match had one feed, and when that one would not
 * play there was nothing to switch to (owner, 2026-11-01). Now ppv.st,
 * StreamFree and Tim Streams are read together (sportsFeed.ts): a match that
 * two or three of them carry gets each one's feeds, best first, and the
 * player falls through them on its own.
 *
 * The sources spell teams their own way ("Lazio vs. Cagliari", "Cagliari vs
 * Lazio", "Cagliari @ Lazio"; "Man City", "Manchester City"), so a match is
 * the same match when both teams agree, in either order, and the kick-offs are
 * within two hours. Pure, so it is testable alone (sportsfeed-check.mjs).
 */
import type { FeedEvent } from './sportsFeed';

export interface FeedLink { url: string; label: string; hd?: boolean; /** Lower plays first. */ rank: number }

/** Words that say nothing about which club it is. */
const NOISE = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ss', 'ssc', 'sv', 'fk', 'sk', 'cd', 'ud', 'rc', 'club', 'de', 'the', 'and', 'of', 'calcio', 'bk', 'if', 'sd', 'cp', 'tsg', 'vfb', 'vfl', 'fsv', 'rb', 'bc']);

const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function teamTokens(name: string): string[] {
  return fold(name).split(' ').filter((w) => w && !NOISE.has(w) && !/^\d+$/.test(w));
}

/** Two spellings of one team: every word of the shorter is a word (or the start of one, "man" for "manchester") of the longer. */
export function sameTeam(a: string, b: string): boolean {
  const x = teamTokens(a), y = teamTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.some((v) => v === w || (w.length >= 3 && v.startsWith(w)) || (v.length >= 3 && w.startsWith(v))));
}

const TWO_HOURS = 2 * 3600_000;

/** The same match: both teams agree (either order) and, when both have a kick-off, within two hours of each other. */
export function sameMatch(a: FeedEvent, b: FeedEvent): boolean {
  if (a.date && b.date && Math.abs(a.date - b.date) > TWO_HOURS) return false;
  // Never across sports: the Jets of New York are not the Jets of Winnipeg.
  if (a.category && b.category && a.category !== 'other' && b.category !== 'other' && a.category !== b.category) return false;
  const ah = a.teams?.home?.name, aa = a.teams?.away?.name, bh = b.teams?.home?.name, ba = b.teams?.away?.name;
  if (ah && aa && bh && ba) return (sameTeam(ah, bh) && sameTeam(aa, ba)) || (sameTeam(ah, ba) && sameTeam(aa, bh));
  // No teams (a race, a channel): the same title on the same day.
  return !!a.date && !!b.date && fold(a.title) === fold(b.title);
}

/**
 * Lay `extra` into `base`: a match already there gains the new feeds (and any
 * badge or league it lacked); a match not there is added. Feeds end up best
 * first by rank, with no address twice.
 */
export function mergeEvents(base: FeedEvent[], extra: FeedEvent[]): FeedEvent[] {
  const out = base.map((e) => ({ ...e, feeds: [...(e.feeds || [])] }));
  for (const e of extra) {
    const hit = out.find((o) => sameMatch(o, e));
    if (!hit) { out.push({ ...e, feeds: [...(e.feeds || [])] }); continue; }
    for (const f of e.feeds || []) if (!hit.feeds!.some((g) => g.url === f.url)) hit.feeds!.push(f);
    hit.live = hit.live || e.live;
    hit.league = hit.league || e.league;
    hit.poster = hit.poster || e.poster;
    if (hit.teams && e.teams) {
      // Badges from whichever source has them, matched to the right side.
      const flip = !!(hit.teams.home?.name && e.teams.away?.name && sameTeam(hit.teams.home.name, e.teams.away.name));
      const [eh, ea] = flip ? [e.teams.away, e.teams.home] : [e.teams.home, e.teams.away];
      hit.teams = {
        home: { ...hit.teams.home, badge: hit.teams.home?.badge || eh?.badge },
        away: { ...hit.teams.away, badge: hit.teams.away?.badge || ea?.badge },
      };
    }
  }
  for (const e of out) {
    e.feeds!.sort((a, b) => a.rank - b.rank);
    e.embeds = e.feeds!.map((f) => f.url);
  }
  return out;
}

/**
 * A wall-clock time in New York ("2026-11-01T09:00", as Tim Streams gives it)
 * as epoch ms. The offset is read for that date, so EST and EDT are both right.
 */
export function newYorkTime(local: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
  if (!m) return 0;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asNy = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return guess + (guess - asNy);
  } catch {
    return guess + 5 * 3600_000; // EST, if the device has no time-zone data
  }
}
