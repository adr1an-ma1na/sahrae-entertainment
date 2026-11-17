/**
 * Audiobooks, fetched and remembered. What the books are and how a place in
 * one is kept is in audiobooksCore.ts; this is the network and the storage.
 *
 * Internet Archive (LibriVox collection): advancedsearch for shelves and
 * search, metadata/<id> for a book's chapters. Both answer any website.
 * Results are kept for a while (shelves 6 hours, books a week) so browsing
 * costs little data the second time.
 */
import { httpFetch } from './http';
import {
  bigCoverFrom, bookFromDoc, chaptersFrom, inProgress, placeFrom, readersFrom, archiveQuery, oneEach, sameWork,
  type Book, type BookDetail, type BookPlace, type Shelf,
} from './audiobooksCore';
import type { Track } from './ytmusic';

const PLACES_KEY = 'sahrae.audiobooks.places.v1';
const SAVED_KEY = 'sahrae.audiobooks.saved.v1';
const LANG_KEY = 'sahrae.audiobooks.lang.v1';
export const BOOKS_CHANGED = 'sahrae:audiobooks';

const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full */ } window.dispatchEvent(new Event(BOOKS_CHANGED)); };

// ── Small cache, in memory and in session storage ──
const mem = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  try {
    const s = JSON.parse(sessionStorage.getItem('ab:' + key) || 'null');
    if (s && Date.now() - s.at < ttl) { mem.set(key, s); return s.v as T; }
  } catch { /* none */ }
  const v = await load();
  const entry = { at: Date.now(), v };
  mem.set(key, entry);
  try { sessionStorage.setItem('ab:' + key, JSON.stringify(entry)); } catch { /* full */ }
  return v;
}

const FIELDS = ['identifier', 'title', 'creator', 'runtime', 'language', 'subject', 'publicdate', 'downloads'];

/** A page of books: a shelf, a search, or both, in a language. */
export async function findBooks(opts: { shelf?: Shelf; search?: string; language?: string; rows?: number; page?: number }): Promise<{ books: Book[]; total: number }> {
  const q = archiveQuery(opts);
  const sort = opts.search ? 'downloads desc' : opts.shelf?.sort || 'downloads desc';
  const rows = opts.rows ?? 24, page = opts.page ?? 1;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&${FIELDS.map((f) => `fl[]=${f}`).join('&')}&sort[]=${encodeURIComponent(sort)}&rows=${rows}&page=${page}&output=json`;
  return cached(`find:${url}`, 6 * 3_600_000, async () => {
    const res = await httpFetch(url);
    if (!res.ok) throw new Error(`Archive search ${res.status}`);
    const j = await res.json();
    const docs: Record<string, unknown>[] = j?.response?.docs || [];
    return { books: oneEach(docs.map(bookFromDoc).filter((b): b is Book => !!b)), total: Number(j?.response?.numFound) || 0 };
  });
}

/** Other recordings of the same book (other readers), most listened first. */
export async function otherRecordings(book: Book): Promise<Book[]> {
  const q = archiveQuery({ search: book.title }) + ` AND creator:(${book.author.replace(/[()":\\]/g, ' ')})`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&${FIELDS.map((f) => `fl[]=${f}`).join('&')}&sort[]=downloads+desc&rows=12&output=json`;
  return cached(`others:${book.id}`, 7 * 86_400_000, async () => {
    const res = await httpFetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.response?.docs || []).map(bookFromDoc).filter((b: Book | null): b is Book => !!b && b.id !== book.id && sameWork(b, book));
  });
}

/** A book's chapters, readers, description and cover. */
export async function getBook(book: Book): Promise<BookDetail> {
  return cached(`book:${book.id}`, 7 * 86_400_000, async () => {
    const res = await httpFetch(`https://archive.org/metadata/${encodeURIComponent(book.id)}`);
    if (!res.ok) throw new Error(`Archive item ${res.status}`);
    const j = await res.json();
    const files: Record<string, unknown>[] = Array.isArray(j?.files) ? j.files : [];
    const md = j?.metadata || {};
    const description = String(Array.isArray(md.description) ? md.description.join('\n') : md.description || '');
    const merged = bookFromDoc({ ...md, identifier: book.id, downloads: book.downloads }) || book;
    return {
      ...book, ...merged,
      runtime: merged.runtime || book.runtime,
      description,
      chapters: chaptersFrom(book.id, files),
      readers: readersFrom(description),
      cover: bigCoverFrom(book.id, files),
    };
  });
}

/** The chapters as the player's queue: each a direct audio file, with podcast transport (skip back and ahead). */
export function chapterTracks(d: BookDetail, artwork: string): Track[] {
  return d.chapters.map((c) => ({
    id: `ab:${d.id}:${c.index}`,
    title: c.title,
    artist: `${d.title} · ${d.author}`,
    artwork,
    artworkLarge: artwork,
    duration: c.duration,
    audioUrl: c.url,
    isPodcast: true,
  }));
}

/** The queue source naming a book, so the tracker knows whose place to keep. */
export const sourceFor = (id: string) => `Audiobook:${id}`;
export const bookIdFromSource = (src: string | null | undefined) => (src && src.startsWith('Audiobook:') ? src.slice(10) : null);

// ── Places and the library ──
export const places = (): Record<string, BookPlace> => read<Record<string, BookPlace>>(PLACES_KEY, {});
export const placeOf = (id: string): BookPlace | undefined => places()[id];
export const listening = (): BookPlace[] => inProgress(places(), Date.now());

/** Keep where the listener is in a book. */
export function keepPlace(book: Book, chapterCount: number, chapter: number, position: number, duration: number): void {
  const all = places();
  all[book.id] = placeFrom(book, chapterCount, chapter, position, duration, Date.now());
  // At most 200 books remembered, the most recent.
  const keep = Object.values(all).sort((a, b) => b.updated - a.updated).slice(0, 200);
  write(PLACES_KEY, Object.fromEntries(keep.map((p) => [p.id, p])));
}
export function markFinished(book: Book, finished: boolean): void {
  const all = places();
  const p = all[book.id] || placeFrom(book, 1, 0, 0, 0, Date.now());
  all[book.id] = { ...p, finished, chapter: finished ? p.chapter : 0, position: finished ? p.position : 0, updated: Date.now() };
  write(PLACES_KEY, all);
}

export const saved = (): Book[] => read<Book[]>(SAVED_KEY, []);
export const isSaved = (id: string) => saved().some((b) => b.id === id);
export function toggleSaved(book: Book): void {
  const list = saved();
  write(SAVED_KEY, list.some((b) => b.id === book.id) ? list.filter((b) => b.id !== book.id) : [book, ...list].slice(0, 300));
}

/** The book now in the player, so the tracker can keep its place. */
let active: { book: Book; chapters: number } | null = null;
export function setActiveBook(d: BookDetail): void { active = { book: { id: d.id, title: d.title, author: d.author, runtime: d.runtime, language: d.language, subjects: d.subjects.slice(0, 6), added: d.added, downloads: d.downloads }, chapters: d.chapters.length }; }
export const activeBook = () => active;

const RATE_KEY = 'sahrae.audiobooks.rate.v1';
export const bookRate = (): number => read<number>(RATE_KEY, 1);
export const keepBookRate = (r: number) => write(RATE_KEY, r);

export const chosenLanguage = (): string => read<string>(LANG_KEY, 'eng');
export const chooseLanguage = (code: string) => write(LANG_KEY, code);
