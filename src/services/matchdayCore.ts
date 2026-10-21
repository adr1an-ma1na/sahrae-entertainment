/**
 * Matchday, the pure half: turning ESPN's scoreboard into fixtures, bookmaker
 * odds into probabilities, and finding each fixture's live stream in the
 * sports feed. No network, no storage, so it is testable alone
 * (matchday-check.mjs).
 */

export type Competition = { code: string; name: string; short: string; sport: 'soccer' | 'racing' };

/** The competitions viewers asked for. MotoGP is not on ESPN; it comes from the sports feed instead. */
export const COMPETITIONS: Competition[] = [
  { code: 'eng.1', name: 'Premier League', short: 'EPL', sport: 'soccer' },
  { code: 'esp.1', name: 'La Liga', short: 'LaLiga', sport: 'soccer' },
  { code: 'ger.1', name: 'Bundesliga', short: 'BUN', sport: 'soccer' },
  { code: 'uefa.champions', name: 'Champions League', short: 'UCL', sport: 'soccer' },
  { code: 'eng.fa', name: 'FA Cup', short: 'FA Cup', sport: 'soccer' },
  { code: 'eng.league_cup', name: 'Carabao Cup', short: 'EFL Cup', sport: 'soccer' },
  { code: 'f1', name: 'Formula 1', short: 'F1', sport: 'racing' },
];

export type Side = { name: string; short: string; logo?: string; score?: string; form?: string };

export type Odds = {
  /** Decimal odds as offered. */
  home: number; draw: number; away: number;
  /** Probabilities with the bookmaker's margin removed; they sum to 1. */
  pHome: number; pDraw: number; pAway: number;
  /** The bookmaker's margin, e.g. 0.06 for 6%. */
  margin: number;
  provider: string;
};

export type Fixture = {
  id: string;
  competition: string;
  competitionName: string;
  sport: 'soccer' | 'racing';
  /** Kick-off, ms since epoch. */
  date: number;
  state: 'pre' | 'in' | 'post';
  /** "63'", "HT", "FT", or the scheduled-status text. */
  status: string;
  venue?: string;
  home?: Side;
  away?: Side;
  /** For a race weekend: the event's own name, e.g. "United States Grand Prix". */
  title: string;
  odds?: Odds;
};

/** American odds ("+340", "-140", "EVEN") as decimal odds, or null. */
export function americanToDecimal(a: unknown): number | null {
  if (a == null) return null;
  const s = String(a).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EV') return 2;
  const n = Number(s.replace(/^\+/, ''));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) < 100) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
}

/**
 * Probabilities from three decimal prices, the bookmaker's margin removed by
 * proportional normalisation: each 1/price, divided by their sum. Simple and
 * stated as what it is; it slightly flatters long shots compared with a
 * Shin correction, which matters little for a three-way football market.
 */
export function devig(home: number, draw: number, away: number): Pick<Odds, 'pHome' | 'pDraw' | 'pAway' | 'margin'> | null {
  if (![home, draw, away].every((d) => Number.isFinite(d) && d > 1)) return null;
  const ih = 1 / home, id = 1 / draw, ia = 1 / away;
  const sum = ih + id + ia;
  return { pHome: ih / sum, pDraw: id / sum, pAway: ia / sum, margin: sum - 1 };
}

/** Whole percentages that add up to exactly 100 (largest remainder). */
export function percentages(ps: number[]): number[] {
  const raw = ps.map((p) => p * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; floors[i]++; left--; }
  return floors;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function oddsFrom(comp: any): Odds | undefined {
  const o = comp?.odds?.[0];
  if (!o) return undefined;
  const ml = o.moneyline || {};
  const pick = (side: any) => americanToDecimal(side?.close?.odds ?? side?.open?.odds);
  const home = pick(ml.home) ?? americanToDecimal(o.homeTeamOdds?.moneyLine);
  const away = pick(ml.away) ?? americanToDecimal(o.awayTeamOdds?.moneyLine);
  const draw = pick(ml.draw) ?? americanToDecimal(o.drawOdds?.moneyLine);
  if (home == null || away == null || draw == null) return undefined;
  const p = devig(home, draw, away);
  if (!p) return undefined;
  return { home, draw, away, ...p, provider: String(o.provider?.name || 'Bookmaker') };
}

/** One ESPN scoreboard event as a Fixture, or null when it is not usable. */
export function parseEvent(ev: any, c: Competition): Fixture | null {
  if (!ev || typeof ev.id !== 'string' && typeof ev.id !== 'number') return null;
  const date = Date.parse(ev.date);
  if (!Number.isFinite(date)) return null;
  const comp = ev.competitions?.[0];
  const st = ev.status?.type || {};
  const state: Fixture['state'] = st.state === 'in' || st.state === 'post' ? st.state : 'pre';
  let status = String(st.shortDetail || st.description || '');
  if (state === 'in' && ev.status?.displayClock && !/half/i.test(status)) status = String(ev.status.displayClock);
  if (state === 'post') status = 'FT';
  const side = (ha: 'home' | 'away'): Side | undefined => {
    const t = comp?.competitors?.find((x: any) => x.homeAway === ha);
    if (!t?.team) return undefined;
    return { name: String(t.team.displayName || t.team.name || ''), short: String(t.team.shortDisplayName || t.team.displayName || ''), logo: t.team.logo || undefined, score: t.score != null ? String(t.score) : undefined, form: t.form || undefined };
  };
  return {
    id: `${c.code}:${ev.id}`,
    competition: c.code,
    competitionName: c.name,
    sport: c.sport,
    date,
    state,
    status,
    venue: comp?.venue?.fullName || undefined,
    home: c.sport === 'soccer' ? side('home') : undefined,
    away: c.sport === 'soccer' ? side('away') : undefined,
    title: String(ev.name || ''),
    odds: c.sport === 'soccer' ? oddsFrom(comp) : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ESPN day token (YYYYMMDD) for a date, in UTC as ESPN's scoreboard expects. */
export function dayToken(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ── Finding a fixture's stream in the sports feed ─────────────────────────────

const NOISE = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'ssc', 'club', 'de', 'the', 'and', 'vs', 'v', 'cd', 'ud', 'rc', 'sv', 'vfb', 'vfl', 'tsg', 'fsv', '1', 'bc', 'calcio', 'real', 'hotspur', 'albion', 'wanderers']);
const ALIASES: Record<string, string> = {
  utd: 'united', man: 'manchester', spurs: 'tottenham', wolves: 'wolverhampton', psg: 'paris', inter: 'internazionale',
  barca: 'barcelona', atleti: 'atletico', bayern: 'bayern', gladbach: 'monchengladbach', leverkusen: 'leverkusen',
  forest: 'nottingham', villa: 'aston', palace: 'crystal', brighton: 'brighton', newcastle: 'newcastle', saints: 'southampton',
};

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((t) => ALIASES[t] || t)
    .filter((t) => !NOISE.has(t));
}

/** How alike two team names are, 0 to 1: shared tokens over the shorter name, prefixes counting (Leverkusen / Bayer Leverkusen). */
export function teamSimilarity(a: string, b: string): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of short) if (long.some((u) => u === t || (t.length >= 4 && u.startsWith(t)) || (u.length >= 4 && t.startsWith(u)))) hit++;
  return hit / short.length;
}

export type FeedLike = { id: string; title: string; category: string; date: number; teams?: { home?: { name?: string }; away?: { name?: string } } | null };

/** How far a feed listing's start may sit from ESPN's kick-off and still be the same match. */
export const STREAM_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * The feed listing showing this fixture, or null. Both teams must match
 * (either way round, since listings sometimes swap home and away) and the
 * start time must be close, so a different meeting of the same clubs is
 * never picked.
 */
export function findStream<T extends FeedLike>(fx: Fixture, feed: T[]): T | null {
  if (fx.sport === 'racing') {
    const words = nameTokens(fx.title).filter((t) => !['grand', 'prix', 'msc', 'cruises', 'formula', 'gp'].includes(t));
    let best: T | null = null, bestScore = 0;
    for (const e of feed) {
      if (e.category !== 'motor-sports' || Math.abs(e.date - fx.date) > STREAM_WINDOW_MS) continue;
      const tt = nameTokens(e.title);
      const isF1 = /\bf1\b|formula/i.test(e.title);
      const shared = words.filter((w) => tt.includes(w)).length;
      const sc = (isF1 ? 1 : 0) + shared;
      if (isF1 && sc > bestScore) { best = e; bestScore = sc; }
    }
    return best;
  }
  if (!fx.home || !fx.away) return null;
  let best: T | null = null, bestScore = 0;
  for (const e of feed) {
    if (e.category !== 'football' || Math.abs(e.date - fx.date) > STREAM_WINDOW_MS) continue;
    const h = e.teams?.home?.name, a = e.teams?.away?.name;
    let sc = 0;
    if (h && a) {
      sc = Math.max(
        Math.min(teamSimilarity(fx.home.name, h), teamSimilarity(fx.away.name, a)),
        Math.min(teamSimilarity(fx.home.name, a), teamSimilarity(fx.away.name, h)),
      );
    } else {
      const parts = e.title.split(/\s+(?:vs?\.?|-|–|x|@)\s+/i);
      if (parts.length === 2) {
        sc = Math.max(
          Math.min(teamSimilarity(fx.home.name, parts[0]), teamSimilarity(fx.away.name, parts[1])),
          Math.min(teamSimilarity(fx.home.name, parts[1]), teamSimilarity(fx.away.name, parts[0])),
        );
      }
    }
    if (sc >= 0.5 && sc > bestScore) { best = e; bestScore = sc; }
  }
  return best;
}

/** Group label for a kick-off, in the viewer's own time zone: Today, Tomorrow, or the weekday and date. */
export function dayLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms), n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(n)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

// ── Predictions on the sports feed's football cards ───────────────────────────

/** Football competitions whose odds feed the predictions on Live Events cards. */
export const PREDICTION_COMPETITIONS: Competition[] = [
  ...COMPETITIONS.filter((c) => c.sport === 'soccer'),
  { code: 'ita.1', name: 'Serie A', short: 'SA', sport: 'soccer' },
  { code: 'fra.1', name: 'Ligue 1', short: 'L1', sport: 'soccer' },
  { code: 'uefa.europa', name: 'Europa League', short: 'UEL', sport: 'soccer' },
];

export type CardPrediction = { pHome: number; pDraw: number; pAway: number; provider: string; competition: string };

/**
 * The fixture's probabilities for a feed card, the right way round: the feed
 * sometimes lists the away side first, so home and away are swapped when its
 * "home" team is the fixture's away team.
 */
export function predictionFor(fx: Fixture, e: FeedLike): CardPrediction | null {
  if (!fx.odds || !fx.home || !fx.away) return null;
  const feedHome = e.teams?.home?.name || e.title.split(/\s+(?:vs?\.?|-|–|x|@)\s+/i)[0] || '';
  const same = teamSimilarity(fx.home.name, feedHome);
  const swapped = teamSimilarity(fx.away.name, feedHome);
  const flip = swapped > same;
  const { pHome, pDraw, pAway, provider } = fx.odds;
  return { pHome: flip ? pAway : pHome, pDraw, pAway: flip ? pHome : pAway, provider, competition: fx.competitionName };
}

/** For each feed card, the prediction of the fixture it shows (by card id). */
export function predictionsByEvent<T extends FeedLike>(fixtures: Fixture[], feed: T[]): Map<string, CardPrediction> {
  const out = new Map<string, CardPrediction>();
  for (const fx of fixtures) {
    if (fx.sport !== 'soccer' || !fx.odds || fx.state === 'post') continue;
    const e = findStream(fx, feed);
    if (!e || out.has(e.id)) continue;
    const p = predictionFor(fx, e);
    if (p) out.set(e.id, p);
  }
  return out;
}
