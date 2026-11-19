// node --experimental-strip-types audiobooks-check.mjs
// The audiobook library (src/services/audiobooksCore.ts): what the Internet
// Archive sends for LibriVox books, and a listener's place in a book.
import {
  toSeconds, cleanTitle, bookFromDoc, chaptersFrom, readersFrom, lengthText, listened, progressOf, resumePoint,
  placeFrom, inProgress, archiveQuery, SHELVES, oneEach, authorName, LIBRARIES, libraryOf,
  bookFromPick, bookFromOpenLibrary, shopLinks, isInterview, alikeShelf,
  recordingsOf, sameLanguage, bookFromWork, openLibraryQuery, fewEach, MISLABELLED,
} from './src/services/audiobooksCore.ts';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nreading what the Archive sends');
eq('hh:mm:ss', toSeconds('06:46:10'), 24370);
eq('mm:ss', toSeconds('08:26'), 506);
eq('seconds as text', toSeconds('1234.6'), 1235);
eq('nothing', toSeconds(undefined), 0);
eq('not a time', toSeconds('soon'), 0);
eq('the author left off the title', cleanTitle("Alice's Adventures in Wonderland, by Lewis Carroll"), "Alice's Adventures in Wonderland");
eq('a radio set named as its show', cleanTitle('Gunsmoke - Single Episodes'), 'Gunsmoke');
eq('a version note left off', [cleanTitle('Pride and Prejudice (version 3)'), cleanTitle('Pride and Prejudice (version 6 dramatic reading)')], ['Pride and Prejudice', 'Pride and Prejudice']);
const doc = { identifier: 'art_of_war_librivox', title: 'The Art of War', creator: 'Sun Tzu', runtime: '01:07:33', language: 'eng', subject: ['librivox', 'audiobooks', 'war', 'strategy'], publicdate: '2006-03-01T00:00:00Z', downloads: 24472929 };
const book = bookFromDoc(doc);
eq('a book from a search result', [book.id, book.title, book.author, book.runtime, book.language], ['art_of_war_librivox', 'The Art of War', 'Sun Tzu', 4053, 'eng']);
eq('subjects without the library\'s own tags', book.subjects, ['war', 'strategy']);
eq('no identifier, no book', bookFromDoc({ title: 'x' }), null);
eq('a missing author is said', bookFromDoc({ identifier: 'a' }).author, 'Unknown author');

console.log('\nchapters');
const files = [
  { name: 'art_of_war_03-04_sun_tzu_64kb.mp3', title: '3 Attack By Stratagem - 4 Tactical Dispositions', length: '07:45', track: '2' },
  { name: 'art_of_war_01-02_sun_tzu_64kb.mp3', title: '1 Laying Plans - 2 Waging War', length: '08:26', track: '1' },
  { name: 'art_of_war_01-02_sun_tzu.mp3', title: '1 Laying Plans - 2 Waging War', length: '08:26', track: '1' },
  { name: 'art_of_war.jpg' },
];
const ch = chaptersFrom('art_of_war_librivox', files);
eq('the light copies, in order', ch.map((c) => c.title), ['1 Laying Plans - 2 Waging War', '3 Attack By Stratagem - 4 Tactical Dispositions']);
eq('each with its length', ch.map((c) => c.duration), [506, 465]);
eq('and a direct address', ch[0].url, 'https://archive.org/download/art_of_war_librivox/art_of_war_01-02_sun_tzu_64kb.mp3');
eq('no light copies: the full ones', chaptersFrom('x', [{ name: 'b_02.mp3', length: '1:00' }, { name: 'a_01.mp3', length: '2:00' }]).map((c) => c.duration), [120, 60]);
eq('a leading number is left to the list', chaptersFrom('x', [{ name: 'x_01_64kb.mp3', title: '01 - A Scandal in Bohemia' }, { name: 'x_02_64kb.mp3', title: 'Chapter 2: The Storm' }, { name: 'x_03_64kb.mp3', title: '1984 Revisited' }]).map((c) => c.title), ['A Scandal in Bohemia', 'The Storm', '1984 Revisited']);
eq('an untitled chapter is numbered', chaptersFrom('x', [{ name: 'x_01_64kb.mp3' }, { name: 'x_02_64kb.mp3' }])[1].title, 'Chapter 2');
eq('readers from the description', readersFrom('<p>LibriVox recording. Read by Kara Shallenberg and Mark Nelson.</p>'), ['Kara Shallenberg', 'Mark Nelson']);
eq('no readers named: none', readersFrom('A dramatic reading.'), []);
eq('lengths in words', [lengthText(24370), lengthText(1434), lengthText(3600), lengthText(0)], ['6 h 46 min', '24 min', '1 h', '']);

console.log('\nyour place in a book');
const NOW = 1_800_000_000_000;
const p1 = placeFrom(book, 2, 1, 200, 465, NOW);
eq('heard: the chapters before, and this far into this one', listened(ch, p1), 706);
eq('share of the book', +progressOf(p1, ch).toFixed(2), 0.73);
eq('resume a few seconds back', resumePoint(p1, ch), { chapter: 1, position: 195 });
eq('nothing heard: the start', resumePoint(undefined, ch), { chapter: 0, position: 0 });
const done = placeFrom(book, 2, 1, 460, 465, NOW);
eq('the end of the last chapter finishes the book', done.finished, true);
eq('a finished book starts again from the top', resumePoint(done, ch), { chapter: 0, position: 0 });
eq('the end of a middle chapter does not', placeFrom(book, 3, 1, 460, 465, NOW).finished, false);
const places = {
  a: { ...placeFrom(book, 2, 0, 300, 506, NOW - 1000), id: 'a' },
  b: { ...placeFrom(book, 2, 1, 50, 465, NOW), id: 'b' },
  c: { ...done, id: 'c' },
  d: { ...placeFrom(book, 2, 0, 10, 506, NOW), id: 'd' },
  e: { ...placeFrom(book, 2, 1, 50, 465, NOW - 400 * 86_400_000), id: 'e' },
};
eq('continue listening: most recent first, not finished, not barely started, not a year old', inProgress(places, NOW).map((p) => p.id), ['b', 'a']);

console.log('\nthe shelves');
eq('a shelf in a language', archiveQuery({ shelf: SHELVES.find((s) => s.id === 'mystery'), language: 'eng' }), 'collection:librivoxaudio AND format:(MP3) AND language:eng AND subject:(mystery OR detective)');
eq('a search, by title or author, without query syntax', archiveQuery({ search: 'sherlock "holmes":' }), 'collection:librivoxaudio AND format:(MP3) AND (title:(sherlock holmes) OR creator:(sherlock holmes))');
eq('every shelf has a sort', SHELVES.every((s) => /^(downloads|publicdate) desc$/.test(s.sort)), true);

console.log('\nthe libraries');
eq('six libraries: LibriVox, Open Library, the bestsellers, the Internet Archive, Gutenberg, radio', LIBRARIES.map((l) => l.id), ['librivox', 'openlibrary', 'shop', 'archive', 'gutenberg', 'radio']);
eq('each with shelves, a voice and a credit', LIBRARIES.every((l) => l.shelves.length >= 6 && l.voice && l.credit), true);
eq('shelf ids are unique across libraries', new Set(LIBRARIES.flatMap((l) => l.shelves.map((s) => s.id))).size, LIBRARIES.reduce((n, l) => n + l.shelves.length, 0));
eq('a query in the Gutenberg library', archiveQuery({ library: 'gutenberg', search: 'emma' }), 'collection:gutenberg-audiobooks AND format:(MP3) AND (title:(emma) OR creator:(emma))');
eq('radio: only restored sets with files a player can stream (a ZIP will not play)', archiveQuery({ library: 'radio' }).startsWith('collection:oldtimeradio AND mediatype:audio AND format:(MP3) AND creator:("Old Time Radio Researchers"'), true);
eq('every Archive library asks for MP3 files', LIBRARIES.filter((l) => l.scope).every((l) => l.scope.includes('format:(MP3)')), true);
eq('no library named: LibriVox', libraryOf(undefined).id, 'librivox');
eq('a catalogue author, surname first with dates', authorName('Collins, Wilkie, 1824-1889'), 'Wilkie Collins');
eq('an author already in order', authorName('Sir Arthur Conan Doyle'), 'Sir Arthur Conan Doyle');
eq('a translator or a title after the comma is not a first name', [authorName('Epictetus, tr. Elizabeth Carter'), authorName('Philip Stanhope, 4th Earl of Chesterfield'), authorName('Nicolo Machiavelli; translated by W. K. Marriott')], ['Epictetus', 'Philip Stanhope', 'Nicolo Machiavelli']);
eq('one card for a book whatever the first name is spelt', oneEach([{ ...book, id: 'p1', title: 'The Prince', author: 'Nicolo Machiavelli' }, { ...book, id: 'p2', title: 'The Prince', author: 'Niccolò Machiavelli' }]).length, 1);
eq('a group name stays',authorName('Old Time Radio Researchers Group'), 'Old Time Radio Researchers Group');
eq('a book knows its library', bookFromDoc({ identifier: 'x', title: 'X' }, 'gutenberg').library, 'gutenberg');
eq('one untitled file is the whole book', chaptersFrom('g', [{ name: 'my_lady.mp3', length: '18809.95' }]).map((c) => [c.title, c.duration]), [['The whole book', 18810]]);

console.log('\nthe bestsellers');
const shop = libraryOf('shop');
eq('hand-picked shelves, eight books each', shop.shelves.map((s) => s.picks.length), [8, 8, 8, 8, 8, 8, 8]);
const laws = bookFromPick(shop.shelves[0].picks[0]);
eq('The 48 Laws of Power, with its cover', [laws.id, laws.title, laws.author, laws.library, laws.cover], ['ol:OL1968368W', 'The 48 Laws of Power', 'Robert Greene', 'shop', 'https://covers.openlibrary.org/b/id/6424160-M.jpg']);
eq('every pick a real work and cover', shop.shelves.every((s) => s.picks.every((p) => /^OL\d+W$/.test(p[2]) && p[3] > 0)), true);
eq('an Open Library result becomes a book', bookFromOpenLibrary({ key: '/works/OL5749847W', title: 'Outliers', author_name: ['Malcolm Gladwell'], cover_i: 10021591, edition_count: 40 }).id, 'ol:OL5749847W');
eq('no cover or few editions: not offered', [bookFromOpenLibrary({ key: '/works/OL1W', title: 'X', author_name: ['A'], edition_count: 9 }), bookFromOpenLibrary({ key: '/works/OL2W', title: 'Y', author_name: ['B'], cover_i: 5, edition_count: 1 })], [null, null]);
const links = shopLinks(laws);
eq('a book old enough to be free is not a bestseller', bookFromOpenLibrary({ key: '/works/OL3W', title: "Dell'Arte della Guerra", author_name: ['Niccolò Machiavelli'], cover_i: 7, edition_count: 30, first_publish_year: 1521 }), null);
eq('the library first, then the stores', links.map((l) => l.id), ['libby', 'audible', 'play', 'spotify']);
eq('each a search for the book', links.every((l) => l.url.startsWith('https://') && l.url.includes('48%20Laws%20of%20Power%20Robert%20Greene')), true);
eq('only hosts the phone app lets open', links.map((l) => new URL(l.url).hostname), ['www.overdrive.com', 'www.audible.com', 'play.google.com', 'open.spotify.com']);
eq('an interview with the author', isInterview({ title: 'Robert Greene: How to use the 48 Laws of Power', artist: 'My First Million', duration: 5040 }, laws), true);
eq('not a summary, not a short clip, not a show named for the book', [
  isInterview({ title: 'The 48 Laws of Power by Robert Greene - Summary', artist: 'Book Bites', duration: 3000 }, laws),
  isInterview({ title: 'Robert Greene on power', artist: 'Clips', duration: 300 }, laws),
  isInterview({ title: 'Law 3, Robert Greene', artist: 'The 48 Laws of Power', duration: 1800 }, laws),
  isInterview({ title: 'Chris Voss on negotiating', artist: 'Some Show', duration: 3000 }, laws),
], [false, false, false, false]);
eq('free classics on the same idea', [alikeShelf(laws), alikeShelf(bookFromPick(shop.shelves[5].picks[0]))], ['power', undefined]);
eq('the classic shelves are LibriVox shelves', ['power', 'success', 'modern'].every((id) => SHELVES.some((s) => s.id === id)), true);
eq('a bestseller search has no Archive query', archiveQuery({ library: 'shop', search: 'outliers' }), '(title:(outliers) OR creator:(outliers))');

console.log('\nOpen Library');
const olDoc = { key: '/works/OL1W', title: 'Преступление и наказание', author_name: ['Fyodor Dostoevsky'], cover_i: 123, ia: ['crimeandpunishment00dost', 'crime_etrange_2206_librivox', 'crime_and_punishment_0902_librivox', 'crime_v2_librivox'] };
eq('a work links to its LibriVox recordings, not its scans', recordingsOf(olDoc), ['crime_etrange_2206_librivox', 'crime_and_punishment_0902_librivox', 'crime_v2_librivox']);
eq('languages match however the Archive spells them', [sameLanguage('eng', 'English'), sameLanguage('fre', 'french'), sameLanguage('eng', 'fre')], [true, true, false]);
const recs = new Map([
  ['crime_etrange_2206_librivox', { ...book, id: 'crime_etrange_2206_librivox', title: 'Crime étrange', language: 'fre', downloads: 9000 }],
  ['crime_and_punishment_0902_librivox', { ...book, id: 'crime_and_punishment_0902_librivox', title: 'Crime and Punishment', language: 'eng', downloads: 5000 }],
  ['crime_v2_librivox', { ...book, id: 'crime_v2_librivox', title: 'Crime and Punishment', language: 'English', downloads: 7000 }],
]);
const w = bookFromWork(olDoc, recs, 'eng');
eq('a work plays its most-listened recording in the language', w.id, 'crime_v2_librivox');
eq('with the recording\'s title, Open Library\'s author and cover', [w.title, w.author, w.cover, w.library], ['Crime and Punishment', 'Fyodor Dostoevsky', 'https://covers.openlibrary.org/b/id/123-M.jpg', 'openlibrary']);
eq('in French, the French recording', bookFromWork(olDoc, recs, 'fre').id, 'crime_etrange_2206_librivox');
eq('no recording in the language: no card', bookFromWork(olDoc, recs, 'ger'), null);
eq('no playable recording found: no card', bookFromWork(olDoc, new Map(), 'eng'), null);
const olLib = libraryOf('openlibrary');
eq('Open Library\'s shelves are its own catalogue searches', olLib.openLibrary && olLib.shelves.every((s) => typeof s.ol === 'string' && ['trending', 'readinglog', 'rating', 'editions'].includes(s.sort)), true);
eq('a shelf asks only for works with a recording', openLibraryQuery({ shelf: olLib.shelves.find((s) => s.id === 'o-mystery') }), 'subject:mystery ia:*_librivox');
eq('a search is cleaned of query syntax', openLibraryQuery({ search: 'sherlock (holmes)*' }), 'sherlock holmes ia:*_librivox');
eq('recording notes leave the title', [cleanTitle('Wuthering Heights (Solo Version)'), cleanTitle('Emma (version 3)'), cleanTitle('Hamlet (Dramatic Reading)')], ['Wuthering Heights', 'Emma', 'Hamlet']);

console.log('\nthe Internet Archive');
const ia = libraryOf('archive');
eq('only what its makers shared freely, from the spoken-word collections', ['licenseurl:*creativecommons*', 'collection:(audio_bookspoetry OR naropa)', 'format:(MP3)'].every((x) => ia.scope.includes(x)), true);
eq('not the libraries Sahrae has already, music or adult readings', ['NOT collection:(librivoxaudio OR gutenberg-audiobooks OR oldtimeradio)', 'music', 'erotica', 'porno'].every((x) => ia.scope.includes(x)), true);
eq('books wrongly marked public domain are left out', MISLABELLED.every((n) => ia.scope.includes(n)), true);
eq('two cards per author at most, in order', fewEach(['A', 'A', 'B', 'A', 'C', 'b'].map((a, i) => ({ ...book, id: String(i), author: a }))).map((b) => b.id), ['0', '1', '2', '4', '5']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
