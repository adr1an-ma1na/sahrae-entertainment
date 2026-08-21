/**
 * Turns a spoken phrase into an action the app can execute.
 *
 * Deliberately a rule-based parser, not an LLM call: it runs offline, answers in
 * microseconds, costs nothing per command, and — most importantly — is
 * predictable. "Play Dune" must open Dune every single time, and a model that
 * occasionally paraphrases the title is worse than useless for a remote control.
 *
 * Kept as a PURE function of (text, catalog) so it can be exercised without a
 * microphone; see the parser self-test in voiceIntents.test.ts.
 */

export type VoiceIntent =
  | { kind: 'navigate'; tab: string; say: string }
  | { kind: 'search'; query: string; say: string }
  | { kind: 'playTitle'; query: string; say: string }
  | { kind: 'playRadio'; station: string; say: string }
  | { kind: 'watchChannel'; channel: string; say: string }
  | { kind: 'stop'; say: string }
  | { kind: 'back'; say: string }
  | { kind: 'help'; say: string }
  | { kind: 'unknown'; say: string };

/** Names the parser can match against, supplied by the app at call time. */
export interface VoiceCatalog {
  stations: string[];
  channels: string[];
}

/** Spoken section names → the app's internal tab ids. */
const SECTIONS: { tab: string; words: string[] }[] = [
  { tab: 'home', words: ['home', 'home page', 'home screen', 'start'] },
  { tab: 'movies', words: ['movies', 'movie', 'films', 'film'] },
  { tab: 'series', words: ['series', 'tv shows', 'shows', 'tv series'] },
  { tab: 'tv', words: ['live tv', 'tv channels', 'television', 'channels', 'live television'] },
  { tab: 'sports', words: ['sports', 'live sports', 'sport', 'football', 'matches'] },
  { tab: 'audio', words: ['radio', 'listen', 'stations', 'radio stations'] },
  { tab: 'channels', words: ['flow channels', 'flow'] },
  { tab: 'mylist', words: ['my list', 'watchlist', 'my watchlist', 'favourites', 'favorites'] },
  { tab: 'continue', words: ['continue watching', 'continue'] },
  { tab: 'downloads', words: ['downloads', 'my downloads', 'offline'] },
  { tab: 'search', words: ['search'] },
];

const clean = (s: string) =>
  s.toLowerCase().trim().replace(/[.,!?؛;]+$/g, '').replace(/\s+/g, ' ');

/** Strip filler so "hey sahrae, could you please play dune" still parses. */
function stripPreamble(s: string): string {
  return s
    .replace(/^(hey|hi|hello|ok|okay)\s+(sahrae|sarai|sahra|sara)\b[,\s]*/i, '')
    .replace(/^(sahrae|sarai|sahra)\b[,\s]*/i, '')
    .replace(/^(please|can you|could you|would you|i want to|i'd like to|let's)\s+/i, '')
    .trim();
}

/** Loose match: exact, then substring either way, then token overlap. */
function bestMatch(query: string, names: string[]): string | null {
  const q = clean(query);
  if (!q) return null;

  const exact = names.find((n) => clean(n) === q);
  if (exact) return exact;

  const contains = names.find((n) => clean(n).includes(q) || q.includes(clean(n)));
  if (contains) return contains;

  // Token overlap, so "capital" finds "Capital FM" and "bbc" finds "BBC World
  // Service". Requires the query to be at least 3 chars to avoid silly hits.
  if (q.length < 3) return null;
  const qTokens = q.split(' ').filter((t) => t.length >= 3);
  let best: { name: string; score: number } | null = null;
  for (const n of names) {
    const nTokens = clean(n).split(' ');
    const score = qTokens.filter((t) => nTokens.some((nt) => nt.startsWith(t) || t.startsWith(nt))).length;
    if (score > 0 && (!best || score > best.score)) best = { name: n, score };
  }
  return best ? best.name : null;
}

function matchSection(s: string): string | null {
  const q = clean(s);
  for (const sec of SECTIONS) {
    if (sec.words.some((w) => q === w)) return sec.tab;
  }
  for (const sec of SECTIONS) {
    if (sec.words.some((w) => q.includes(w))) return sec.tab;
  }
  return null;
}

export function parseVoiceCommand(raw: string, catalog: VoiceCatalog): VoiceIntent {
  const text = stripPreamble(clean(raw));
  if (!text) return { kind: 'unknown', say: "I didn't catch that." };

  // ── Stop / back ──
  if (/^(stop|pause|be quiet|silence|shut up|stop playing|stop it|turn (it )?off)$/.test(text)) {
    return { kind: 'stop', say: 'Stopped.' };
  }
  if (/^(go back|back|close|dismiss|exit|cancel)$/.test(text)) {
    return { kind: 'back', say: 'Going back.' };
  }
  if (/^(help|what can you do|commands|what can i say)$/.test(text)) {
    return {
      kind: 'help',
      say: 'Try: play a movie by name, open live TV, play Capital FM, search for comedies, or stop.',
    };
  }

  // ── Radio: "play radio X", "play X on radio", "tune to X" ──
  const radio =
    text.match(/^(?:play|listen to|tune (?:in )?to|put on)\s+(?:the\s+)?radio\s+(?:station\s+)?(.+)$/) ||
    text.match(/^(?:play|listen to|tune (?:in )?to|put on)\s+(.+?)\s+(?:on\s+)?(?:the\s+)?radio$/) ||
    text.match(/^(?:play|listen to|tune (?:in )?to|put on)\s+(?:the\s+)?(?:radio\s+)?station\s+(.+)$/);
  if (radio) {
    const hit = bestMatch(radio[1], catalog.stations);
    return hit
      ? { kind: 'playRadio', station: hit, say: `Playing ${hit}.` }
      : { kind: 'unknown', say: `I couldn't find a station called ${radio[1]}.` };
  }

  // ── Live TV: "watch X on live tv", "put on X channel" ──
  const chan =
    text.match(/^(?:watch|put on|switch to|tune (?:in )?to)\s+(.+?)\s+(?:on\s+)?(?:live\s+)?(?:tv|television|channel)$/) ||
    text.match(/^(?:watch|put on|switch to)\s+(?:the\s+)?channel\s+(.+)$/);
  if (chan) {
    const hit = bestMatch(chan[1], catalog.channels);
    return hit
      ? { kind: 'watchChannel', channel: hit, say: `Opening ${hit}.` }
      : { kind: 'unknown', say: `I couldn't find a channel called ${chan[1]}.` };
  }

  // ── Explicit search ──
  // NOTE the ordering/optional groups here: JS alternation is leftmost-first, so
  // `(?:search|search for)` would match "search" and leave "for comedies" as the
  // query. Longer forms come first, or are folded into optional groups.
  const search = text.match(/^(?:show me results for|search(?:\s+for)?|find|look for)\s+(.+)$/);
  if (search) {
    return { kind: 'search', query: search[1], say: `Searching for ${search[1]}.` };
  }

  // ── Navigate: "open X", "go to X", "show me X" ──
  // "show me" must precede "show" for the same reason. "my" is NOT stripped —
  // section names like "my list" depend on it.
  const nav = text.match(/^(?:open|go to|show me|show|take me to|navigate to)\s+(?:the\s+)?(.+)$/);
  if (nav) {
    const tab = matchSection(nav[1]);
    if (tab) return { kind: 'navigate', tab, say: `Opening ${nav[1]}.` };
    // "show me comedies" is a search, not a section.
    return { kind: 'search', query: nav[1], say: `Searching for ${nav[1]}.` };
  }

  // A bare section name works too: "live sports".
  const bareSection = matchSection(text);
  if (bareSection && text.split(' ').length <= 3) {
    return { kind: 'navigate', tab: bareSection, say: `Opening ${text}.` };
  }

  // ── Play / watch a title ──
  const play = text.match(/^(?:play|watch|start|put on|resume)\s+(?:the\s+)?(?:movie\s+|film\s+|series\s+|show\s+)?(.+)$/);
  if (play) {
    const title = play[1];
    // A station or channel name said plainly still does the obvious thing.
    const station = bestMatch(title, catalog.stations);
    if (station && clean(station) === clean(title)) {
      return { kind: 'playRadio', station, say: `Playing ${station}.` };
    }
    const channel = bestMatch(title, catalog.channels);
    if (channel && clean(channel) === clean(title)) {
      return { kind: 'watchChannel', channel, say: `Opening ${channel}.` };
    }
    return { kind: 'playTitle', query: title, say: `Looking for ${title}.` };
  }

  // Anything else: treat as a search rather than refusing outright.
  return { kind: 'search', query: text, say: `Searching for ${text}.` };
}
