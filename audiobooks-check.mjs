// node --experimental-strip-types audiobooks-check.mjs
// The audiobook library (src/services/audiobooksCore.ts): what the Internet
// Archive sends for LibriVox books, and a listener's place in a book.
import {
  toSeconds, cleanTitle, bookFromDoc, chaptersFrom, readersFrom, lengthText, listened, progressOf, resumePoint,
  placeFrom, inProgress, archiveQuery, SHELVES, oneEach,
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
eq('an untitled chapter is numbered', chaptersFrom('x', [{ name: 'x_01_64kb.mp3' }])[0].title, 'Chapter 1');
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
eq('a shelf in a language', archiveQuery({ shelf: SHELVES.find((s) => s.id === 'mystery'), language: 'eng' }), 'collection:librivoxaudio AND language:eng AND subject:(mystery OR detective)');
eq('a search, by title or author, without query syntax', archiveQuery({ search: 'sherlock "holmes":' }), 'collection:librivoxaudio AND (title:(sherlock holmes) OR creator:(sherlock holmes))');
eq('every shelf has a sort', SHELVES.every((s) => /^(downloads|publicdate) desc$/.test(s.sort)), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
