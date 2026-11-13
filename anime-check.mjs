// node --experimental-strip-types anime-check.mjs
// Anime on official services: which titles count as anime, what is offered where, and that nothing else changes.
import { isAnime, officialFor, viewerCountry, loadOfficial, termsLabel, OFFICIAL_PROVIDERS, OFFICIAL_HOSTS } from './src/services/animeProviders.ts';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nwhat counts as anime (TMDB metadata as read on 2026-11-13)');
const kw = (on) => ({ results: on ? [{ id: 210024, name: 'anime' }] : [{ id: 1, name: 'x' }] });
const titles = {
  'Jujutsu Kaisen': { genres: [{ id: 16 }, { id: 10765 }], original_language: 'ja', origin_country: ['JP'], keywords: kw(true) },
  'Spirited Away (film)': { genres: [{ id: 16 }, { id: 14 }], original_language: 'ja', origin_country: ['JP'], keywords: { keywords: [{ id: 210024 }] } },
  'Rent-a-Girlfriend': { genres: [{ id: 16 }, { id: 35 }], original_language: 'ja', origin_country: ['JP'], keywords: kw(true) },
  'Avatar: The Last Airbender': { genres: [{ id: 16 }, { id: 10759 }], original_language: 'en', origin_country: ['US'], keywords: kw(false) },
  'Arcane': { genres: [{ id: 16 }, { id: 10759 }], original_language: 'en', origin_country: ['US'], keywords: kw(false) },
  'Soul (film)': { genres: [{ id: 16 }, { id: 10751 }], original_language: 'en', origin_country: ['US'], keywords: { keywords: [] } },
  'Game of Thrones': { genres: [{ id: 10765 }, { id: 18 }], original_language: 'en', origin_country: ['US'], keywords: kw(false) },
  'a Japanese live-action drama': { genres: [{ id: 18 }], original_language: 'ja', origin_country: ['JP'], keywords: kw(false) },
};
eq('anime: JJK, Spirited Away, Rent-a-Girlfriend; not: Avatar, Arcane, Soul, GoT, live action',
  Object.entries(titles).filter(([, d]) => isAnime(d)).map(([n]) => n), ['Jujutsu Kaisen', 'Spirited Away (film)', 'Rent-a-Girlfriend']);
eq('a cached title without keywords: Japanese animation from Japan still counts', isAnime({ genres: [{ id: 16 }], original_language: 'ja', origin_country: ['JP'] }), true);
eq('nothing known: not anime', [isAnime(null), isAnime(undefined), isAnime({})], [false, false, false]);

console.log('\nwhat is offered (TMDB watch providers, as answered on 2026-11-13)');
// Jujutsu Kaisen, tv/95479, trimmed to the parts read.
const jjk = {
  KE: { link: 'https://www.themoviedb.org/tv/95479/watch?locale=KE', ads: [{ provider_id: 283 }], flatrate: [{ provider_id: 283 }] },
  US: { link: 'https://www.themoviedb.org/tv/95479/watch?locale=US', flatrate: [{ provider_id: 283 }, { provider_id: 1968 }] },
};
// Naruto, tv/46260.
const naruto = {
  US: { link: 'https://www.themoviedb.org/tv/46260/watch?locale=US', ads: [{ provider_id: 300 }, { provider_id: 73 }], flatrate: [{ provider_id: 283 }] },
};
// Frieren, tv/209867.
const frieren = { KE: { link: 'https://www.themoviedb.org/tv/209867/watch?locale=KE', flatrate: [{ provider_id: 8 }] } };

const ke = officialFor(jjk, 'KE', 'JUJUTSU KAISEN');
eq('Kenya, JJK: Crunchyroll free with ads, then Bilibili as a search', ke.map((o) => [o.name, termsLabel(o.terms)]), [['Crunchyroll', 'Free with ads'], ['Bilibili', 'Search, not confirmed']]);
eq('...Crunchyroll opens its own search for the title', ke[0].url, 'https://www.crunchyroll.com/search?q=JUJUTSU%20KAISEN');
eq('...Bilibili its search', ke[1].url, 'https://www.bilibili.tv/en/search-result?q=JUJUTSU%20KAISEN');
eq('Kenya: no Tubi, no Pluto TV (TMDB lists neither; both refuse Kenya)', ke.some((o) => o.key === 'tubi' || o.key === 'plutotv'), false);
const us = officialFor(naruto, 'US', 'Naruto');
eq('US, Naruto: the free services first (Tubi, Pluto TV), then Crunchyroll', us.filter((o) => o.terms !== 'search').map((o) => [o.name, o.terms]), [['Tubi', 'ads'], ['Pluto TV', 'ads'], ['Crunchyroll', 'flatrate']]);
eq('...a service with no checked address opens TMDB\'s watch page for the title', us[0].url, 'https://www.themoviedb.org/tv/46260/watch?locale=US');
eq('Kenya, Frieren: Netflix', officialFor(frieren, 'KE', 'Frieren').filter((o) => o.terms !== 'search').map((o) => o.name), ['Netflix']);
eq('a country TMDB has nothing for: only the labelled search', officialFor(jjk, 'ZZ', 'X').map((o) => o.terms), ['search']);
eq('TMDB unreachable: only the labelled search', officialFor(null, 'KE', 'X').map((o) => o.key), ['bilibili']);
eq('a provider listed only to buy is not offered', officialFor({ KE: { link: 'https://www.themoviedb.org/x', buy: [{ provider_id: 283 }] } }, 'KE', 'X').map((o) => o.key), ['bilibili']);
eq('a non-https link is never opened', officialFor({ KE: { link: 'javascript:alert(1)', ads: [{ provider_id: 73 }] } }, 'KE', 'X').map((o) => o.key), ['bilibili']);

console.log('\nonly for anime');
{
  let asked = 0;
  const fetchProviders = async () => { asked++; return jjk; };
  eq('a film that is not anime: nothing, and TMDB is not asked', [await loadOfficial({ id: 1, title: 'Soul', ...titles['Soul (film)'] }, 'movie', fetchProviders, 'KE'), asked], [[], 0]);
  eq('a series that is not anime: nothing', (await loadOfficial({ id: 2, name: 'Arcane', ...titles.Arcane }, 'tv', fetchProviders, 'KE')).length, 0);
  const got = await loadOfficial({ id: 95479, name: 'JUJUTSU KAISEN', ...titles['Jujutsu Kaisen'] }, 'tv', fetchProviders, 'KE');
  eq('anime: offered, TMDB asked once', [got.map((o) => o.key), asked], [['crunchyroll', 'bilibili'], 1]);
  await loadOfficial({ id: 95479, name: 'JUJUTSU KAISEN', ...titles['Jujutsu Kaisen'] }, 'tv', fetchProviders, 'KE');
  eq('...and not again for the same title', asked, 1);
  const broken = async () => { throw new Error('offline'); };
  eq('TMDB down: the search only, nothing breaks', (await loadOfficial({ id: 7, name: 'X', ...titles['Jujutsu Kaisen'] }, 'tv', broken, 'KE')).map((o) => o.key), ['bilibili']);
}

console.log('\nwhere the viewer is');
eq('Nairobi time with an en-US phone: Kenya', viewerCountry('Africa/Nairobi', ['en-US']), 'KE');
eq('New York: US', viewerCountry('America/New_York', ['en']), 'US');
eq('an unlisted zone: the language region', viewerCountry('Europe/Paris', ['fr-FR']), 'FR');
eq('nothing to go on: Kenya', viewerCountry('', ['en']), 'KE');

console.log('\nthe Android app may open them');
const java = readFileSync('android-overlay/app/src/main/java/com/sahrae/entertainment/MainActivity.java', 'utf8');
const allowed = (h) => [...java.matchAll(/"([a-z0-9.-]+\.[a-z]{2,})"/g)].map((m) => m[1]).some((d) => h === d || h.endsWith('.' + d));
eq('every host the buttons open is on the app\'s allow-list', OFFICIAL_HOSTS.every(allowed), true);
const searchHosts = OFFICIAL_PROVIDERS.filter((p) => p.search).map((p) => new URL(p.search('x')).hostname);
eq('...including every search page', searchHosts.every((h) => OFFICIAL_HOSTS.includes(h)), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
