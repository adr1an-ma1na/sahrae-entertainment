// node --experimental-strip-types anime-check.mjs
// Which titles count as anime (for Skip Intro's AniSkip lookup).
import { isAnime } from './src/services/animeProviders.ts';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
