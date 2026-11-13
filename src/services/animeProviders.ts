/**
 * Anime on official services (owner, 2026-11-13: "anime servers at the top,
 * only for anime; Bilibili, Tubi, Pluto TV; English dub, Japanese audio,
 * subtitles").
 *
 * None of these services offers a player another site may embed, nor an API
 * for third parties to play their titles, so they cannot be servers inside
 * Sahrae's player. What is authorised is sending the viewer to the service:
 * TMDB's watch-provider data (JustWatch's, through TMDB's API) says, per
 * country, which service carries a title and on what terms, and the button
 * opens that service. Nothing here is guessed: a service is offered only when
 * TMDB lists the title for the viewer's country, except Bilibili, which TMDB
 * does not cover and is offered only as a labelled search.
 *
 * Checked from Kenya on 2026-11-13: Tubi ("not currently available in your
 * area") and Pluto TV ("not available in your location") refuse Kenya, and
 * TMDB lists neither there; Crunchyroll and Netflix carry many anime in Kenya
 * (Crunchyroll's own search marks Sub | Dub per title); bilibili.tv opens, its
 * free licensed shelf being mostly Chinese animation.
 */

/** TMDB's "anime" keyword (search/keyword?query=anime, 2026-11-13). */
export const ANIME_KEYWORD = 210024;
const ANIMATION = 16;

export interface AnimeMeta {
  genres?: { id: number }[];
  original_language?: string;
  origin_country?: string[];
  keywords?: { results?: { id: number }[]; keywords?: { id: number }[] };
}

/**
 * Anime, by TMDB's own classification: Animation, and either TMDB's "anime"
 * keyword or a Japanese production in Japanese. Not every animated film
 * (Soul, Arcane, Avatar: The Last Airbender are not), not every Japanese
 * production (live action has no Animation genre).
 */
export function isAnime(d: AnimeMeta | null | undefined): boolean {
  if (!d || !d.genres?.some((g) => g.id === ANIMATION)) return false;
  const kw = d.keywords?.results || d.keywords?.keywords || [];
  if (kw.some((k) => k.id === ANIME_KEYWORD)) return true;
  return d.original_language === 'ja' && !!d.origin_country?.includes('JP');
}

export type Terms = 'free' | 'ads' | 'flatrate';
export interface OfficialProvider {
  key: string;
  name: string;
  /** TMDB provider ids (the service and its channel listings). */
  tmdb: number[];
  /** A search page on the service, where its address for that is known and checked; else TMDB's watch page is used. */
  search?: (title: string) => string;
  /** Not in TMDB's data: offered as a search, never as "has this title". */
  searchOnly?: boolean;
}

/**
 * The registry, in preference order: free first. Add a service here (with
 * its TMDB provider id) and it is offered wherever TMDB lists it.
 */
export const OFFICIAL_PROVIDERS: OfficialProvider[] = [
  { key: 'tubi', name: 'Tubi', tmdb: [73] },
  { key: 'plutotv', name: 'Pluto TV', tmdb: [300] },
  // Search address checked 2026-11-13 (it lists the title with "Sub | Dub").
  { key: 'crunchyroll', name: 'Crunchyroll', tmdb: [283, 1968], search: (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}` },
  { key: 'hidive', name: 'HIDIVE', tmdb: [430, 2390] },
  { key: 'retrocrush', name: 'RetroCrush', tmdb: [446, 295] },
  { key: 'netflix', name: 'Netflix', tmdb: [8, 1796] },
  // Search address checked 2026-11-13.
  { key: 'bilibili', name: 'Bilibili', tmdb: [], searchOnly: true, search: (t) => `https://www.bilibili.tv/en/search-result?q=${encodeURIComponent(t)}` },
];

/** Hosts the Android app may open for these (MainActivity's allow-list must match). */
export const OFFICIAL_HOSTS = ['www.crunchyroll.com', 'www.bilibili.tv', 'www.themoviedb.org'];

export interface OfficialOption {
  key: string;
  name: string;
  terms: Terms | 'search';
  url: string;
}

type RegionListing = { link?: string; free?: { provider_id: number }[]; ads?: { provider_id: number }[]; flatrate?: { provider_id: number }[] };

const TERMS_ORDER: Terms[] = ['free', 'ads', 'flatrate'];

/**
 * What to offer for one title in one country, from TMDB's
 * /{type}/{id}/watch/providers answer. Free and free-with-adverts before
 * subscriptions; within each, the registry's order. Buying and renting are
 * left out.
 */
export function officialFor(results: Record<string, RegionListing> | null | undefined, region: string, title: string): OfficialOption[] {
  const here = results?.[region];
  const out: OfficialOption[] = [];
  if (here) {
    const termsOf = (p: OfficialProvider): Terms | null => {
      for (const t of TERMS_ORDER) if ((here[t] || []).some((x) => p.tmdb.includes(x.provider_id))) return t;
      return null;
    };
    const found = OFFICIAL_PROVIDERS
      .filter((p) => !p.searchOnly)
      .map((p, i) => ({ p, i, t: termsOf(p) }))
      .filter((x): x is { p: OfficialProvider; i: number; t: Terms } => x.t !== null)
      .sort((a, b) => TERMS_ORDER.indexOf(a.t) - TERMS_ORDER.indexOf(b.t) || a.i - b.i);
    for (const { p, t } of found) {
      const url = p.search ? p.search(title) : here.link;
      if (url && /^https:\/\//.test(url)) out.push({ key: p.key, name: p.name, terms: t, url });
    }
  }
  for (const p of OFFICIAL_PROVIDERS) {
    if (p.searchOnly && p.search && title.trim()) out.push({ key: p.key, name: p.name, terms: 'search', url: p.search(title) });
  }
  return out;
}

export function termsLabel(t: OfficialOption['terms']): string {
  return t === 'free' ? 'Free' : t === 'ads' ? 'Free with ads' : t === 'flatrate' ? 'Subscription' : 'Search, not confirmed';
}

/**
 * Where the viewer is, for which country's catalogue applies. The device's
 * time zone first: a phone in Nairobi often reports "en-US" as its language,
 * which would offer Tubi, which refuses Kenya. Then the language's region.
 * Then Kenya, the app's home.
 */
const ZONES: Record<string, string> = {
  'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW',
  'Africa/Addis_Ababa': 'ET', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU',
  'Asia/Kolkata': 'IN', 'Asia/Dubai': 'AE', 'Asia/Tokyo': 'JP', 'Asia/Manila': 'PH', 'Asia/Singapore': 'SG',
};
export function viewerCountry(zone?: string, langs?: readonly string[]): string {
  let tz = zone;
  if (tz === undefined) { try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = ''; } }
  if (tz && ZONES[tz]) return ZONES[tz];
  const list = langs ?? (typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const l of list) {
    const r = String(l || '').split(/[-_]/)[1];
    if (r && /^[A-Za-z]{2}$/.test(r)) return r.toUpperCase();
  }
  return 'KE';
}

const cache = new Map<string, OfficialOption[]>();
/** The official options for an anime title here; [] for anything else, or when TMDB cannot be reached. */
export async function loadOfficial(
  d: AnimeMeta & { id: number; title?: string; name?: string },
  type: 'movie' | 'tv',
  fetchProviders: (type: 'movie' | 'tv', id: number) => Promise<Record<string, RegionListing> | null>,
  region = viewerCountry(),
): Promise<OfficialOption[]> {
  if (!isAnime(d)) return [];
  const key = `${type}:${d.id}:${region}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let results: Record<string, RegionListing> | null = null;
  try { results = await fetchProviders(type, d.id); } catch { results = null; }
  const list = officialFor(results, region, d.name || d.title || '');
  if (results) cache.set(key, list);
  return list;
}

/** Open the service: a new tab on the web, the phone's browser or the service's app in the Android apps. */
export function openOfficial(url: string, native: boolean): void {
  if (native) {
    try { fetch(`https://localhost/__openext?url=${encodeURIComponent(url)}`, { cache: 'no-store' }).catch(() => {}); } catch { /* ignore */ }
  } else {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
  }
}
