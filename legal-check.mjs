/**
 * Sahrae's legal pages and the promises they make (src/legal/legalText.ts):
 * the privacy choice defaults to "no", removed titles stay removed, and the
 * pages name only things the app really has.
 *
 * Run: node --experimental-strip-types legal-check.mjs
 */
import fs from 'node:fs';

// A small localStorage for consent.ts.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { dispatchEvent: () => true };

const { loadConsent, saveConsent, consentDecided, mayShareReports } = await import('./src/services/consent.ts');
const { mergeRemoved, isRemoved } = await import('./src/services/removedCore.ts');
const { LEGAL_DOCS, LEGAL_EMAIL, LEGAL_VERSION } = await import('./src/legal/legalText.ts');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log(`  FAIL ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
};

console.log('\nthe privacy choice');
eq('nothing chosen yet: the banner asks', consentDecided(), false);
eq('nothing chosen yet: no server reports are shared', mayShareReports(), false);
saveConsent(false);
eq('"Essential only": answered, and nothing shared', [consentDecided(), mayShareReports()], [true, false]);
saveConsent(true);
eq('"Allow server reports": shared', mayShareReports(), true);
store.set('sahrae.consent.v1', JSON.stringify({ version: LEGAL_VERSION - 1, at: 1, serverReports: true }));
eq('an answer to older legal pages: asked again', consentDecided(), false);
store.set('sahrae.consent.v1', '{not json');
eq('a damaged record is no answer, and no yes', [loadConsent(), mayShareReports()], [null, false]);

console.log('\nremoved titles');
const shipped = { movie: [1], tv: [] };
const published = { movie: [2], tv: [5] };
const both = mergeRemoved(shipped, published);
eq('a removal in either copy counts', [isRemoved(both, 'movie', 1), isRemoved(both, 'movie', 2), isRemoved(both, 'tv', 5)], [true, true, true]);
eq('a film id is not a series id', isRemoved(both, 'tv', 1), false);
eq('no published copy: the shipped list stands', mergeRemoved(shipped, null), shipped);
const file = JSON.parse(fs.readFileSync('src/data/removed.json', 'utf8'));
eq('the removed list is well formed', [Array.isArray(file.movie), Array.isArray(file.tv), file.movie.every(Number.isInteger), file.tv.every(Number.isInteger)], [true, true, true, true]);
eq('it is published beside the website', fs.readFileSync('vite.config.ts', 'utf8').includes("fileName: 'removed.json'"), true);

console.log('\nthe pages');
const text = LEGAL_DOCS.map((d) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.h, ...s.p])].join('\n')).join('\n');
eq('four pages: Terms, Privacy, Cookies, Copyright', LEGAL_DOCS.map((d) => d.id), ['terms', 'privacy', 'cookies', 'copyright']);
eq('every page has sections', LEGAL_DOCS.every((d) => d.sections.length > 0), true);
eq('the contact is the published address', LEGAL_EMAIL, 'sahrae@gmail.com');
eq('no placeholders left (TBD, XX, [insert])', /\bTBD\b|\bXX\b|\[insert|lorem/i.test(text), false);
eq('no em dashes', /—/.test(text), false);
const src = (p) => fs.readFileSync(p, 'utf8');
eq('"Privacy & data" in Profile exists, as the pages say', src('src/components/ProfileModal.tsx').includes('Privacy &amp; data'), true);
eq('"Download my data" exists', src('src/components/ProfileModal.tsx').includes('Download my data'), true);
eq('"Delete my account" exists', src('src/components/ProfileModal.tsx').includes('Delete my account'), true);
eq('server reports are only sent with a yes', /mayShareReports\(\)/.test(src('src/services/playProof.ts')), true);
eq('trailers really use YouTube\'s privacy-enhanced mode', src('src/components/PlayerModal.tsx').includes('youtube-nocookie.com/embed'), true);
eq('the account deletion function is in the repo', fs.existsSync('supabase/delete_my_account.sql'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
