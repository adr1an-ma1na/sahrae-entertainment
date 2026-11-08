/**
 * Who is playing, as a picture. Listeners find their team by its badge; a pair
 * of initials says nothing, and "São Paulo Qualifying" does not tell anyone it
 * is Formula 1 (owner, 2026-11-08).
 *
 * Teams: one of the three listing sources has no crests at all, so a team
 * without one is looked up in ESPN's public team search (open to browsers, no
 * key). Measured on a day's real fixtures: 155 of 156 teams found. A name has
 * to genuinely match: a wrong badge is worse than none, so nothing is accepted
 * on the search's say-so alone. Answers are kept on the device.
 *
 * Competitions: the series a session belongs to, from the source's league
 * label or the title, with its logo.
 */

const fold = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── Competitions ─────────────────────────────────────────────────────────────
export interface Competition { name: string; logo?: string }
const R2 = 'https://r2.thesportsdb.com/images/media/league/badge';
const F1: Competition = { name: 'Formula 1', logo: `${R2}/g8cofl1513623681.png` };

const SERIES: { re: RegExp; comp: Competition }[] = [
  // The motorcycle and electric series first: they run "Grands Prix" too.
  { re: /\bmoto\s*gp\b|\bmoto[23]\b/i, comp: { name: 'MotoGP', logo: `${R2}/gg3c201768486075.png` } },
  { re: /\bformula\s*e\b/i, comp: { name: 'Formula E', logo: `${R2}/v91pho1674317051.png` } },
  { re: /\bformula\s*[23]\b|\bf[23]\b/i, comp: { name: 'Formula 2 and 3' } },
  { re: /\bindy\s*car\b/i, comp: { name: 'IndyCar', logo: `${R2}/m9xm9w1552216863.png` } },
  { re: /\bnascar\b/i, comp: { name: 'NASCAR', logo: `${R2}/spqryk1581101437.png` } },
  { re: /\bwec\b|world endurance|\ble mans\b/i, comp: { name: 'World Endurance', logo: `${R2}/2fjrko1705526433.png` } },
  { re: /\bformula\s*(1|one)\b|\bf1\b/i, comp: F1 },
  { re: /\bufc\b/i, comp: { name: 'UFC', logo: `${R2}/bewnz31717531281.png` } },
  { re: /\bwwe\b/i, comp: { name: 'WWE', logo: `${R2}/ywtxyv1453504109.png` } },
  { re: /\batp\b/i, comp: { name: 'ATP Tour', logo: `${R2}/q7aej51769857150.png` } },
  { re: /\bwta\b/i, comp: { name: 'WTA Tour', logo: `${R2}/bddhun1768230678.png` } },
  { re: /\bpga\b/i, comp: { name: 'PGA Tour', logo: `${R2}/quvqqr1423564787.png` } },
  { re: /\bpdc\b/i, comp: { name: 'PDC Darts', logo: `${R2}/isf07m1555602216.png` } },
  { re: /\bnfl\b|\bredzone\b/i, comp: { name: 'NFL', logo: `${R2}/0z0j131793688031.png` } },
  { re: /\bnba\b/i, comp: { name: 'NBA', logo: `${R2}/frdjqy1536585083.png` } },
  { re: /\bnhl\b/i, comp: { name: 'NHL', logo: `${R2}/4cem2k1619616539.png` } },
];

// Local racing on a motor-sports listing is not Formula 1, whatever the session is called.
const LOCAL_RACING = /speedway|raceway|nationals|dirt|enduro|\bama\b|usac|drag|rally/i;
const GP_SESSION = /grand prix|\bgp\b|qualifying|practice|sprint|\bfp[123]\b/i;

/** The series or tour an event belongs to, or null when nothing says. */
export function competitionOf(e: { category?: string; league?: string; title?: string }): Competition | null {
  const text = `${e.league || ''} ${e.title || ''}`;
  for (const { re, comp } of SERIES) if (re.test(text)) return comp;
  // "São Paulo Qualifying" with no league named: a Grand Prix weekend is F1's unless it says otherwise.
  if (e.category === 'motor-sports' && GP_SESSION.test(text) && !LOCAL_RACING.test(text)) return F1;
  return null;
}

// ── Teams ────────────────────────────────────────────────────────────────────
/** Our sport category → ESPN's. Only sports played by teams have badges to find. */
const ESPN_SPORT: Record<string, string> = {
  football: 'soccer', 'american-football': 'football', basketball: 'basketball',
  hockey: 'hockey', baseball: 'baseball', rugby: 'rugby', cricket: 'cricket',
};

export const isTeamSport = (category: string): boolean => category in ESPN_SPORT;

/** Common names the listings use that share no word with the club's own. */
const ALIASES: Record<string, string> = {
  'inter milan': 'internazionale', inter: 'internazionale', psg: 'paris saint germain',
  spurs: 'tottenham hotspur', wolves: 'wolverhampton wanderers', 'man utd': 'manchester united',
  'man united': 'manchester united', 'man city': 'manchester city',
};

const STOP = new Set(['fc', 'cf', 'ac', 'sc', 'afc', 'bk', 'fk', 'sk', 'if', 'cd', 'ud', 'ca', 'club', 'de', 'the']);
const words = (s: string) => fold(s).split(' ').filter((w) => w && !STOP.has(w));
const canon = (name: string) => ALIASES[fold(name)] || name;

/** 3 the same name, 2 one name is contained in the other ("Feyenoord Rotterdam" and "Feyenoord"), 0 no match. */
export function teamMatch(listed: string, found: string): number {
  const a = words(canon(listed)), b = words(found);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 3;
  const A = new Set(a), B = new Set(b);
  return a.every((w) => B.has(w)) || b.every((w) => A.has(w)) ? 2 : 0;
}

export interface EspnTeam { displayName?: string; subtitle?: string; sport?: string; image?: { default?: string } }
const WOMENS = /women|vrouwen|femen|femin|frauen|damen|\bw\b/i;

/** The badge for a listed team among search results, or null. The men's side unless the listing says women. */
export function pickBadge(listed: string, category: string, results: EspnTeam[]): string | null {
  const sport = ESPN_SPORT[category];
  if (!sport) return null;
  const wantWomen = WOMENS.test(listed);
  let best: { url: string; score: number } | null = null;
  for (const t of results) {
    if (t.sport !== sport || !t.image?.default || !t.displayName) continue;
    if (WOMENS.test(`${t.subtitle || ''} ${t.displayName}`) !== wantWomen) continue;
    const score = teamMatch(listed, t.displayName);
    if (score && (!best || score > best.score)) best = { url: t.image.default, score };
  }
  return best ? best.url : null;
}

// ── Looking a team up ────────────────────────────────────────────────────────
const STORE = 'sahrae.teamBadges.v1';
const FOUND_DAYS = 60, MISSED_DAYS = 3;
const DAY = 86_400_000;
type Saved = Record<string, { u: string; at: number }>;

let saved: Saved | null = null;
const load = (): Saved => {
  if (saved) return saved;
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') as Saved; } catch { saved = {}; }
  return saved!;
};
let writeTimer = 0;
const persist = () => {
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(load())); } catch { /* storage full: this session still has them */ } }, 800);
};

const keyOf = (name: string, category: string) => `${category}|${fold(name)}`;

/** A badge already known on this device: a URL, '' for "looked, none", undefined if never looked. */
export function knownBadge(name: string, category: string): string | undefined {
  const hit = load()[keyOf(name, category)];
  if (!hit) return undefined;
  if (Date.now() - hit.at > (hit.u ? FOUND_DAYS : MISSED_DAYS) * DAY) return undefined;
  return hit.u;
}

// A day's listing is a few hundred teams: a few at a time, each asked once.
const MAX_AT_ONCE = 4;
let running = 0;
const waiting: (() => void)[] = [];
const inFlight = new Map<string, Promise<string>>();
const turn = () => new Promise<void>((go) => { if (running < MAX_AT_ONCE) { running++; go(); } else waiting.push(go); });
const done = () => { const next = waiting.shift(); if (next) next(); else running--; };

/** The team's badge from ESPN, kept on the device; '' when there is none. */
export function findBadge(name: string, category: string): Promise<string> {
  const known = knownBadge(name, category);
  if (known !== undefined) return Promise.resolve(known);
  if (!isTeamSport(category)) return Promise.resolve('');
  const key = keyOf(name, category);
  const running_ = inFlight.get(key);
  if (running_) return running_;
  const job = (async () => {
    await turn();
    try {
      const url = `https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(canon(name))}&limit=8&type=team`;
      const res = await fetch(url);
      if (!res.ok) return ''; // Not an answer about this team: try again next time, unsaved.
      const j = await res.json() as { results?: { type?: string; contents?: EspnTeam[] }[] };
      const list = j.results?.find((r) => r.type === 'team')?.contents || [];
      const badge = pickBadge(name, category, list) || '';
      load()[key] = { u: badge, at: Date.now() };
      persist();
      return badge;
    } catch {
      return '';
    } finally {
      done();
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}
