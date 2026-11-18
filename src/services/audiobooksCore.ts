/**
 * Audiobooks (owner, 2026-11-17: "add audiobooks, the best library").
 *
 * The catalogue is LibriVox: about 22,000 public-domain books read by
 * volunteers, free and legal to stream anywhere, hosted by the Internet
 * Archive, whose search and file APIs answer any website (CORS open). Spotify's
 * bestsellers are licensed titles; Sahrae has no licence for them, so the
 * library is the classics and older works, in many languages.
 *
 * Pure: parsing what the Archive sends and keeping a listener's place in a
 * book. Tested in audiobooks-check.mjs; services/audiobooks.ts does the fetching.
 */

export interface Book {
  id: string;
  title: string;
  author: string;
  /** Seconds, when the Archive knows it. */
  runtime: number;
  language: string;
  subjects: string[];
  /** When it was added to the library (ms). */
  added: number;
  downloads: number;
  description?: string;
  /** Which library it comes from (LIBRARIES); LibriVox when absent (books saved before there were others). */
  library?: LibraryId;
  /** Cover art, for books not on the Archive (the bestsellers). */
  cover?: string;
}

export interface Chapter { index: number; title: string; url: string; duration: number }

export interface BookDetail extends Book { chapters: Chapter[]; readers: string[]; cover?: string }

/** "06:46:10", "08:26", "1234.5" or a number → seconds. */
export function toSeconds(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

/** The Archive's titles often repeat the author ("Alice in Wonderland, by Lewis Carroll"). */
export function cleanTitle(title: string): string {
  return title.replace(/\s*-\s*(single episodes|singles|otrr[^-]*)\s*$/i, '').replace(/\s*,?\s+by\s+[^,]+$/i, '').replace(/\s*\((version|dramatic reading)[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

/** Subjects that say what the book is, not where it lives. */
const NOISE = new Set(['librivox', 'audiobooks', 'audiobook', 'audio book', 'librivox audiobooks']);
/** "Collins, Wilkie, 1824-1889" → "Wilkie Collins": library catalogues write authors surname first, with dates. */
export function authorName(raw: string): string {
  const s = raw.replace(/;.*$/, '').replace(/,?\s*\(?\d{3,4}\??\s*-\s*\d{0,4}\??\)?\s*$/, '').replace(/,?\s*(b\.|d\.|fl\.)\s*\d{3,4}.*$/i, '').trim();
  const m = /^([^,]+),\s*([^,]+)$/.exec(s);
  // "Epictetus, tr. Elizabeth Carter", "Philip Stanhope, 4th Earl of Chesterfield": the part after the comma is not a first name.
  if (m && (/^(tr\.|trans|ed\.|edited|translated)/i.test(m[2]) || /\d/.test(m[2]) || /\b(earl|lord|duke|baron|count|of)\b/i.test(m[2]))) return m[1].replace(/\s+/g, ' ').trim();
  return (m ? `${m[2]} ${m[1]}` : s).replace(/\s+/g, ' ').trim();
}

export function bookFromDoc(d: Record<string, unknown>, library?: LibraryId): Book | null {
  const id = first(d.identifier);
  if (!id) return null;
  return {
    id,
    library,
    title: cleanTitle(first(d.title)) || id,
    author: authorName(first(d.creator)) || 'Unknown author',
    runtime: toSeconds(d.runtime),
    language: first(d.language) || 'eng',
    subjects: list(d.subject).filter((s) => !NOISE.has(s.toLowerCase().trim())),
    added: Date.parse(first(d.publicdate)) || 0,
    downloads: Number(d.downloads) || 0,
  };
}

/**
 * The chapters of a book from the Archive's file list: its MP3 files (the
 * 64 kb/s copies, light on data, or failing those any MP3), in order.
 */
export function chaptersFrom(id: string, files: Array<Record<string, unknown>>): Chapter[] {
  const mp3 = files.filter((f) => /\.mp3$/i.test(first(f.name)));
  const light = mp3.filter((f) => /_64kb\.mp3$/i.test(first(f.name)));
  const chosen = light.length ? light : mp3.filter((f) => !/_(32|16)kb\.mp3$/i.test(first(f.name)));
  const num = (f: Record<string, unknown>) => {
    const t = parseInt(first(f.track), 10);
    if (Number.isFinite(t)) return t;
    const m = /_(\d{1,3})[_-]/.exec(first(f.name));
    return m ? parseInt(m[1], 10) : 0;
  };
  return chosen
    .slice()
    .sort((a, b) => num(a) - num(b) || first(a.name).localeCompare(first(b.name), undefined, { numeric: true }))
    .map((f, index) => ({
      index,
      // "01 - A Scandal in Bohemia" → "A Scandal in Bohemia": the list numbers its rows already.
      title: first(f.title).trim().replace(/^(chapter\s+)?0*\d{1,3}\s*[-–—.:)]\s+(?=\S)/i, '') || (chosen.length === 1 ? 'The whole book' : `Chapter ${index + 1}`),
      url: `https://archive.org/download/${encodeURIComponent(id)}/${first(f.name).split('/').map(encodeURIComponent).join('/')}`,
      duration: toSeconds(f.length),
    }));
}

/** The readers named in a LibriVox description ("Read by Kara Shallenberg"), when they are. */
export function readersFrom(description: string): string[] {
  const text = description.replace(/<[^>]+>/g, ' ');
  const m = /read by\s+([^.\n<]{2,80})/i.exec(text);
  if (!m) return [];
  return m[1].split(/,|\band\b/).map((s) => s.trim()).filter((s) => s && s.length < 40).slice(0, 4);
}

/** A cover the Archive draws for every item; larger art from the file list when there is some. */
export const coverOf = (id: string) => `https://archive.org/services/img/${encodeURIComponent(id)}`;
export function bigCoverFrom(id: string, files: Array<Record<string, unknown>>): string | undefined {
  const jpg = files.find((f) => /\.(jpe?g|png)$/i.test(first(f.name)) && !/thumb|__ia_thumb|_spectrogram/i.test(first(f.name)));
  return jpg ? `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(first(jpg.name))}` : undefined;
}

/** "6 h 46 min", "23 min". */
export function lengthText(sec: number): string {
  if (!(sec > 0)) return '';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${Math.max(1, m)} min`;
}

// ── A listener's place in a book ──────────────────────────────────────────

export interface BookPlace { id: string; chapter: number; position: number; updated: number; finished?: boolean; book: Book }

/** Seconds listened, counting whole chapters before this one. */
export function listened(chapters: Chapter[], place: Pick<BookPlace, 'chapter' | 'position'>): number {
  let s = 0;
  for (let i = 0; i < place.chapter && i < chapters.length; i++) s += chapters[i].duration;
  return s + Math.max(0, place.position);
}

/** Share of the book heard, 0 to 1, from the place and the book's length. */
export function progressOf(place: BookPlace, chapters?: Chapter[]): number {
  if (place.finished) return 1;
  const total = chapters?.length ? chapters.reduce((a, c) => a + c.duration, 0) : place.book.runtime;
  if (!(total > 0)) return 0;
  const done = chapters?.length ? listened(chapters, place) : place.position;
  return Math.max(0, Math.min(1, done / total));
}

/**
 * Where to start: the chapter and second the listener left, a little before
 * it (a few seconds of what they last heard), or the beginning.
 */
export function resumePoint(place: BookPlace | undefined, chapters: Chapter[]): { chapter: number; position: number } {
  if (!place || place.finished || !chapters.length) return { chapter: 0, position: 0 };
  const chapter = Math.min(Math.max(0, place.chapter), chapters.length - 1);
  return { chapter, position: Math.max(0, place.position - 5) };
}

/** A new place, from the chapter now playing and its clock. The last seconds of the last chapter finish the book. */
export function placeFrom(book: Book, chapterCount: number, chapter: number, position: number, duration: number, now: number): BookPlace {
  const finished = chapter >= chapterCount - 1 && duration > 0 && position >= duration - 15;
  return { id: book.id, chapter, position: Math.round(position), updated: now, finished, book };
}

/** Books being listened to, most recent first; finished ones and old abandoned ones (a year) left out. */
export function inProgress(places: Record<string, BookPlace>, now: number): BookPlace[] {
  return Object.values(places)
    .filter((p) => p && !p.finished && now - p.updated < 365 * 86_400_000 && (p.chapter > 0 || p.position > 20))
    .sort((a, b) => b.updated - a.updated);
}

// ── Shelves ───────────────────────────────────────────────────────────────

export interface Shelf { id: string; title: string; query: string; sort: string; /** A hand-picked shelf: these books, no search. */ picks?: BookPick[] }

/** The library's shelves: searches on the Archive, each in the chosen language. */
export const SHELVES: Shelf[] = [
  { id: 'popular', title: 'Most listened', query: '', sort: 'downloads desc' },
  { id: 'new', title: 'New this week', query: '', sort: 'publicdate desc' },
  // The old books today's bestsellers are built on (The 48 Laws of Power draws on these).
  { id: 'power', title: 'Power & strategy classics', query: '((title:"Prince" AND creator:Machiavelli) OR (title:"Art of War" AND creator:Tzu) OR (title:"On War" AND creator:Clausewitz) OR (title:"Worldly Wisdom" AND creator:Gracian) OR (creator:Aurelius AND title:Meditations) OR (creator:Seneca AND title:Letters) OR (creator:Plutarch* AND title:Lives) OR creator:Epictetus OR (creator:Chesterfield AND title:Letters))', sort: 'downloads desc' },
  { id: 'success', title: 'Success & self-help classics', query: 'title:("As a Man Thinketh" OR "Science of Getting Rich" OR "Acres of Diamonds" OR "Richest Man in Babylon" OR "Art of Money Getting" OR "Power of Concentration" OR "Twenty-Four Hours a Day" OR "Self Help" OR "Autobiography of Benjamin Franklin" OR "Science of Being Great" OR "Pushing to the Front")', sort: 'downloads desc' },
  // Books from the 1920s, free since their copyright ran out (US: 95 years).
  { id: 'modern', title: 'Modern classics, newly free', query: 'NOT creator:Various AND (title:("Great Gatsby" OR "Sun Also Rises" OR "Farewell to Arms" OR "Mrs. Dalloway" OR "To the Lighthouse" OR "Winnie-the-Pooh" OR "Winnie the Pooh" OR "Maltese Falcon" OR "Passage to India" OR Steppenwolf OR Siddhartha) OR (creator:Kafka AND title:(Trial OR Metamorphosis)) OR (creator:Joyce AND title:Ulysses))', sort: 'downloads desc' },
  { id: 'mystery', title: 'Mystery & detective', query: 'subject:(mystery OR detective)', sort: 'downloads desc' },
  { id: 'adventure', title: 'Adventure', query: 'subject:adventure', sort: 'downloads desc' },
  { id: 'scifi', title: 'Science fiction & fantasy', query: 'subject:("science fiction" OR fantasy)', sort: 'downloads desc' },
  { id: 'romance', title: 'Romance', query: 'subject:romance', sort: 'downloads desc' },
  { id: 'horror', title: 'Ghost & horror stories', query: 'subject:(horror OR ghost OR gothic)', sort: 'downloads desc' },
  { id: 'children', title: 'For children', query: 'subject:(children OR "fairy tales")', sort: 'downloads desc' },
  { id: 'philosophy', title: 'Philosophy & ideas', query: 'subject:philosophy', sort: 'downloads desc' },
  { id: 'history', title: 'History & lives', query: 'subject:(history OR biography)', sort: 'downloads desc' },
  { id: 'poetry', title: 'Poetry', query: 'subject:poetry', sort: 'downloads desc' },
  { id: 'faith', title: 'Faith & scripture', query: 'subject:(religion OR bible OR spirituality)', sort: 'downloads desc' },
];

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'eng', name: 'English' }, { code: 'fre', name: 'Français' }, { code: 'spa', name: 'Español' },
  { code: 'ger', name: 'Deutsch' }, { code: 'ita', name: 'Italiano' }, { code: 'por', name: 'Português' },
  { code: 'dut', name: 'Nederlands' }, { code: 'rus', name: 'Русский' }, { code: 'chi', name: '中文' },
];

/** The Archive query for a shelf in a language, or for a search. */
export function archiveQuery(opts: { shelf?: Shelf; search?: string; language?: string; library?: LibraryId }): string {
  const parts = [libraryOf(opts.library).scope].filter(Boolean);
  if (opts.language) parts.push(`language:${opts.language}`);
  if (opts.shelf?.query) parts.push(opts.shelf.query);
  if (opts.search?.trim()) {
    const q = opts.search.trim().replace(/[()":\\]/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(`(title:(${q}) OR creator:(${q}))`);
  }
  return parts.join(' AND ');
}

/** The same book by the same author, whichever recording ("Pride and Prejudice (version 3)"). */
export const sameWork = (a: Book, b: Book) => workKey(a) === workKey(b);
// Title and surname: catalogues spell first names differently ("Nicolo" / "Niccolò Machiavelli").
const workKey = (b: Book) => `${b.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${(b.author.normalize('NFD').toLowerCase().replace(/[^a-z\s]+/g, '').trim().split(/\s+/).pop() || '')}`;

/** One card per book: LibriVox often has several recordings of one book; the first (most listened) stands for it. */
export function oneEach(books: Book[]): Book[] {
  const seen = new Set<string>();
  return books.filter((b) => { const k = workKey(b); if (seen.has(k)) return false; seen.add(k); return true; });
}


// ── The bestsellers (owner, 2026-11-17: "books like The 48 Laws of Power, Malcolm Gladwell") ─────
// Under copyright, so no free library may stream them. Sahrae shows them and
// opens the legal ways to listen: borrowing free with a library card (Libby),
// or a store. Each pick: title, author, Open Library work, Open Library cover
// (matched on Open Library, 2026-11-17).

export type BookPick = [title: string, author: string, work: string, cover: number];

const PICKS: Record<string, BookPick[]> = {
  power: [
    ["The 48 Laws of Power", "Robert Greene", "OL1968368W", 6424160],
    ["The 33 Strategies of War", "Robert Greene", "OL9290241W", 1119676],
    ["The Art of Seduction", "Robert Greene", "OL1968364W", 917840],
    ["Mastery", "Robert Greene", "OL17429337W", 7561012],
    ["The Laws of Human Nature", "Robert Greene", "OL19761410W", 10170095],
    ["Influence", "Robert B. Cialdini", "OL3902892W", 431011],
    ["Never Split the Difference", "Chris Voss", "OL18819818W", 8365942],
    ["How to Win Friends and Influence People", "Dale Carnegie", "OL1063267W", 13314878],
  ],
  gladwell: [
    ["The Tipping Point", "Malcolm Gladwell", "OL5749848W", 10873292],
    ["Blink", "Malcolm Gladwell", "OL5749849W", 14421850],
    ["Outliers", "Malcolm Gladwell", "OL5749847W", 10021591],
    ["What the Dog Saw", "Malcolm Gladwell", "OL5749846W", 8260666],
    ["David and Goliath", "Malcolm Gladwell", "OL16809805W", 7276285],
    ["Talking to Strangers", "Malcolm Gladwell", "OL20126964W", 8779682],
    ["The Bomber Mafia", "Malcolm Gladwell", "OL24235902W", 10716338],
    ["Revenge of the Tipping Point", "Malcolm Gladwell", "OL38126030W", 14829976],
  ],
  ideas: [
    ["Sapiens", "Yuval Noah Harari", "OL17075811W", 8634250],
    ["Thinking, Fast and Slow", "Daniel Kahneman", "OL15992072W", 13290711],
    ["Freakonomics", "Steven D. Levitt", "OL278022W", 11172914],
    ["Guns, Germs, and Steel", "Jared Diamond", "OL276558W", 7884018],
    ["The Black Swan", "Nassim Nicholas Taleb", "OL3295030W", 5721840],
    ["Range", "David Epstein", "OL20131297W", 8782615],
    ["Quiet", "Susan Cain", "OL16484595W", 7079753],
    ["The Power of Habit", "Charles Duhigg", "OL16015154W", 9078085],
  ],
  money: [
    ["Rich Dad Poor Dad", "Robert T. Kiyosaki", "OL2010879W", 8315603],
    ["The Psychology of Money", "Morgan Housel", "OL21640039W", 10389354],
    ["Atomic Habits", "James Clear", "OL17930368W", 12539702],
    ["The 7 Habits of Highly Effective People", "Stephen R. Covey", "OL2629977W", 10079937],
    ["Deep Work", "Cal Newport", "OL17713267W", 7988607],
    ["Zero to One", "Peter Thiel", "OL17078706W", 9002334],
    ["The Lean Startup", "Eric Ries", "OL16086010W", 7104760],
    ["Can't Hurt Me", "David Goggins", "OL18108064W", 8305903],
  ],
  lives: [
    ["Long Walk to Freedom", "Nelson Mandela", "OL1783377W", 12702407],
    ["Becoming", "Michelle Obama", "OL17930367W", 8824664],
    ["Born a Crime", "Trevor Noah", "OL17824318W", 8294078],
    ["Shoe Dog", "Phil Knight", "OL17825802W", 8858487],
    ["Educated", "Tara Westover", "OL18139176W", 8314077],
    ["Unbowed", "Wangari Maathai", "OL4436882W", 167337],
    ["The Autobiography of Malcolm X", "Malcolm X", "OL36522668W", 14875135],
    ["Steve Jobs", "Walter Isaacson", "OL16085155W", 12374726],
  ],
  africa: [
    ["Things Fall Apart", "Chinua Achebe", "OL891786W", 12816943],
    ["Weep Not, Child", "Ngũgĩ wa Thiong'o", "OL10245W", 14341942],
    ["Petals of Blood", "Ngũgĩ wa Thiong'o", "OL10243W", 8260603],
    ["Half of a Yellow Sun", "Chimamanda Ngozi Adichie", "OL5731542W", 8472660],
    ["Americanah", "Chimamanda Ngozi Adichie", "OL16805415W", 8474037],
    ["Purple Hibiscus", "Chimamanda Ngozi Adichie", "OL5731538W", 12063933],
    ["Homegoing", "Yaa Gyasi", "OL17795349W", 8081171],
    ["So Long a Letter", "Mariama Bâ", "OL4672081W", 14338907],
  ],
  modern: [
    ["Nineteen Eighty-Four", "George Orwell", "OL1168083W", 9267242],
    ["Animal Farm", "George Orwell", "OL1168007W", 11261770],
    ["To Kill a Mockingbird", "Harper Lee", "OL3140822W", 14351077],
    ["The Alchemist", "Paulo Coelho", "OL796465W", 7414780],
    ["Of Mice and Men", "John Steinbeck", "OL23204W", 14319003],
    ["Lord of the Flies", "William Golding", "OL455327W", 8684447],
    ["Brave New World", "Aldous Huxley", "OL64365W", 8231823],
    ["The Old Man and the Sea", "Ernest Hemingway", "OL63073W", 463307],
  ],
};

export const olCover = (id: number, size: 'M' | 'L' = 'M') => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;

/** A hand-picked bestseller as a book. */
export function bookFromPick([title, author, work, cover]: BookPick): Book {
  return { id: `ol:${work}`, library: 'shop', title, author, runtime: 0, language: 'eng', subjects: [], added: 0, downloads: 0, cover: olCover(cover) };
}

/** An Open Library search result as a bestseller: only real books (a cover, an author, several editions), still in copyright. */
export function bookFromOpenLibrary(d: Record<string, unknown>): Book | null {
  const key = String(d.key || '').replace('/works/', '');
  const cover = Number(d.cover_i);
  const author = first(d.author_name);
  if (!/^OL\d+W$/.test(key) || !cover || !author || Number(d.edition_count || 0) < 3) return null;
  // Old enough to be free (US: published before 1931): the free libraries' book, not a bestseller.
  const year = Number(d.first_publish_year) || 0;
  if (year && year < 1931) return null;
  return bookFromPick([String(d.title || ''), author, key, cover]);
}

export interface ShopLink { id: string; label: string; note: string; url: string }
/** The legal places to listen to a bestseller, each a search for it there. */
export function shopLinks(book: Book): ShopLink[] {
  const e = encodeURIComponent(`${book.title} ${book.author}`);
  return [
    { id: 'libby', label: 'Borrow free with a library card', note: 'Libby, from OverDrive: your public library\'s audiobooks', url: `https://www.overdrive.com/search?q=${e}&f-formatClassification=Audiobook` },
    { id: 'audible', label: 'Audible', note: 'Buy it, or listen with a membership', url: `https://www.audible.com/search?keywords=${e}` },
    { id: 'play', label: 'Google Play Books', note: 'Buy it once, no membership', url: `https://play.google.com/store/search?q=${e}&c=audiobooks` },
    { id: 'spotify', label: 'Spotify', note: 'Hours included with Premium, where Spotify offers audiobooks', url: `https://open.spotify.com/search/${e}/audiobooks` },
  ];
}

/** Authors with a free show of their own (Apple Podcasts ids, checked 2026-11-17). */
export const OWN_SHOWS: Record<string, { id: string; name: string }> = {
  'Malcolm Gladwell': { id: '1119389968', name: 'Revisionist History' },
  'Steven D. Levitt': { id: '354668519', name: 'Freakonomics Radio' },
  'Trevor Noah': { id: '1710609544', name: 'What Now? with Trevor Noah' },
  'Morgan Housel': { id: '1675310669', name: 'The Psychology of Money with Morgan Housel' },
};

/** Free classics on the same idea, for a bestseller on a hand-picked shelf (a LibriVox shelf id). */
const ALIKE: Record<string, string> = { power: 'power', gladwell: 'power', money: 'success', modern: 'modern', ideas: 'philosophy', lives: 'history' };
export function alikeShelf(book: Book): string | undefined {
  const work = book.id.replace(/^ol:/, '');
  const group = Object.entries(PICKS).find(([, l]) => l.some((p) => p[2] === work))?.[0];
  return group ? ALIKE[group] : undefined;
}

/** Interviews with an author, from podcast search: the author named, long enough to be a real talk, and not a summary of the book. */
export function isInterview(ep: { title: string; artist: string; duration: number; description?: string }, book: Book): boolean {
  const surname = (book.author.split(/\s+/).pop() || '').toLowerCase();
  if (!surname) return false;
  const named = ep.title.toLowerCase().includes(surname) || (ep.description || '').toLowerCase().includes(book.author.toLowerCase());
  if (!named) return false;
  if (ep.duration && ep.duration < 15 * 60) return false;
  if (/summar|book review|book club|chapter \d|audiobook|explained|in \d+ minutes/i.test(`${ep.title} ${ep.artist}`)) return false;
  if (ep.artist.toLowerCase().includes(book.title.toLowerCase())) return false;
  return true;
}

// ── The libraries (owner, 2026-11-17: "more libraries, not just one") ─────
// Each is a free, legal collection on the Internet Archive. Others there were
// left out on purpose: open upload collections whose rights are unclear.

export type LibraryId = 'librivox' | 'shop' | 'gutenberg' | 'radio';
export interface Library {
  id: LibraryId;
  name: string;
  /** What it is, in a line. */
  note: string;
  /** Who reads, shown on every book. */
  voice: string;
  /** The credit its licence asks for. */
  credit: string;
  scope: string;
  shelves: Shelf[];
  languages: boolean;
  /** Not free to stream: borrowed with a library card, or bought (the bestsellers). */
  shop?: boolean;
}

const by = (names: string[]) => `creator:(${names.map((n) => `"${n}"`).join(' OR ')})`;

export const LIBRARIES: Library[] = [
  {
    id: 'librivox', name: 'LibriVox', note: '22,000 books read by volunteers, in many languages', voice: 'Read by volunteers',
    credit: 'A LibriVox recording, in the public domain, hosted by the Internet Archive.',
    scope: 'collection:librivoxaudio', shelves: SHELVES, languages: true,
  },
  {
    id: 'shop', name: 'Bestsellers', note: 'Today\'s bestsellers: borrow them free with a library card, or buy them', voice: 'A licensed audiobook',
    credit: 'Book details and covers from Open Library. Sahrae does not sell or stream these books: the buttons open your library or a store.',
    scope: '', languages: false, shop: true,
    shelves: [
      { id: 's-power', title: 'Power & persuasion', query: '', sort: '', picks: PICKS.power },
      { id: 's-gladwell', title: 'Malcolm Gladwell', query: '', sort: '', picks: PICKS.gladwell },
      { id: 's-ideas', title: 'Big ideas', query: '', sort: '', picks: PICKS.ideas },
      { id: 's-money', title: 'Money, habits & work', query: '', sort: '', picks: PICKS.money },
      { id: 's-lives', title: 'Lives & memoirs', query: '', sort: '', picks: PICKS.lives },
      { id: 's-africa', title: 'African writers', query: '', sort: '', picks: PICKS.africa },
      { id: 's-modern', title: 'Modern classics', query: '', sort: '', picks: PICKS.modern },
    ],
  },
  {
    id: 'gutenberg', name: 'Project Gutenberg', note: '4,800 classics read by a natural computer voice', voice: 'Read by a computer voice',
    credit: 'From the Project Gutenberg Audiobook Collection (public-domain books, computer narration), hosted by the Internet Archive.',
    scope: 'collection:gutenberg-audiobooks', languages: false,
    shelves: [
      { id: 'g-popular', title: 'Most listened', query: '', sort: 'downloads desc' },
      { id: 'g-new', title: 'Recently added', query: '', sort: 'publicdate desc' },
      { id: 'g-mystery', title: 'Mystery & detective', query: by(['Christie, Agatha', 'Doyle, Arthur Conan', 'Collins, Wilkie', 'Chesterton, G. K. (Gilbert Keith)', 'Leblanc, Maurice', 'Green, Anna Katharine']), sort: 'downloads desc' },
      { id: 'g-adventure', title: 'Adventure', query: by(['Verne, Jules', 'Stevenson, Robert Louis', 'Dumas, Alexandre', 'Haggard, H. Rider (Henry Rider)', 'London, Jack', 'Burroughs, Edgar Rice']), sort: 'downloads desc' },
      { id: 'g-dickens', title: 'Charles Dickens', query: 'creator:(Dickens)', sort: 'downloads desc' },
      { id: 'g-austen', title: 'Austen, the Brontës and Eliot', query: 'creator:(Austen OR Brontë OR Bronte OR "Eliot, George")', sort: 'downloads desc' },
      { id: 'g-twain', title: 'Mark Twain', query: 'creator:(Twain)', sort: 'downloads desc' },
      { id: 'g-scifi', title: 'Early science fiction', query: 'creator:(Wells OR Verne OR Shelley OR Doyle) AND title:(time OR world OR moon OR machine OR war OR island OR lost)', sort: 'downloads desc' },
    ],
  },
  {
    id: 'radio', name: 'Radio drama', note: 'Classic radio plays and series, restored', voice: 'Full-cast radio drama',
    credit: 'Restored by the Old Time Radio Researchers (CC BY-NC-ND 2.5), hosted by the Internet Archive.',
    scope: 'collection:oldtimeradio AND mediatype:audio AND creator:("Old Time Radio Researchers" OR "Old Time Radio Researchers Group")', languages: false,
    shelves: [
      { id: 'r-popular', title: 'Most listened', query: '', sort: 'downloads desc' },
      { id: 'r-detective', title: 'Detectives & crime', query: 'subject:(detective OR mystery OR crime)', sort: 'downloads desc' },
      { id: 'r-western', title: 'Westerns', query: 'subject:western', sort: 'downloads desc' },
      { id: 'r-scifi', title: 'Science fiction', query: 'subject:("science fiction" OR "sci-fi" OR scifi)', sort: 'downloads desc' },
      { id: 'r-suspense', title: 'Suspense & horror', query: 'subject:(suspense OR horror OR thriller)', sort: 'downloads desc' },
      { id: 'r-comedy', title: 'Comedy', query: 'subject:(comedy OR sitcom)', sort: 'downloads desc' },
      { id: 'r-new', title: 'Recently restored', query: '', sort: 'publicdate desc' },
    ],
  },
];

export const libraryOf = (id?: LibraryId | string | null): Library => LIBRARIES.find((l) => l.id === id) || LIBRARIES[0];
