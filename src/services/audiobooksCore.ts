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
  return title.replace(/\s*,?\s+by\s+[^,]+$/i, '').replace(/\s*\((version|dramatic reading)[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

/** Subjects that say what the book is, not where it lives. */
const NOISE = new Set(['librivox', 'audiobooks', 'audiobook', 'audio book', 'librivox audiobooks']);
export function bookFromDoc(d: Record<string, unknown>): Book | null {
  const id = first(d.identifier);
  if (!id) return null;
  return {
    id,
    title: cleanTitle(first(d.title)) || id,
    author: first(d.creator) || 'Unknown author',
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
      title: first(f.title).trim().replace(/^(chapter\s+)?0*\d{1,3}\s*[-–—.:)]\s+(?=\S)/i, '') || `Chapter ${index + 1}`,
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

export interface Shelf { id: string; title: string; query: string; sort: string }

/** The library's shelves: searches on the Archive, each in the chosen language. */
export const SHELVES: Shelf[] = [
  { id: 'popular', title: 'Most listened', query: '', sort: 'downloads desc' },
  { id: 'new', title: 'New this week', query: '', sort: 'publicdate desc' },
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
export function archiveQuery(opts: { shelf?: Shelf; search?: string; language?: string }): string {
  const parts = ['collection:librivoxaudio'];
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
const workKey = (b: Book) => `${b.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${b.author.toLowerCase().replace(/[^a-z]+/g, '')}`;

/** One card per book: LibriVox often has several recordings of one book; the first (most listened) stands for it. */
export function oneEach(books: Book[]): Book[] {
  const seen = new Set<string>();
  return books.filter((b) => { const k = workKey(b); if (seen.has(k)) return false; seen.add(k); return true; });
}
