import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronLeft, Clock, ExternalLink, Gauge, Heart, Library, Loader2, Mic, Moon, Pause, Play, Search, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { isTelevision } from '../tv/spatialNavigation';
import type { Track } from '../services/ytmusic';
import { LuxGlow, LuxHeader } from './ui/Lux';
import { useMusic } from '../hooks/useMusic';
import { haptics } from '../services/haptics';
import {
  BOOKS_CHANGED, chapterTracks, chooseLanguage, chosenLanguage, findBooks, findEverywhere, getBook, isSaved, listening, markFinished, otherRecordings, chooseLibrary, chosenLibrary,
  placeOf, saved, setActiveBook, sourceFor, toggleSaved, bookIdFromSource, bookRate, keepBookRate, aboutBestseller, authorAudio, openOutside,
} from '../services/audiobooks';
import { LANGUAGES, LIBRARIES, SHELVES, alikeShelf, coverOf, lengthText, libraryOf, progressOf, resumePoint, shopLinks, type Book, type BookDetail, type LibraryId, type Shelf, type ShopLink } from '../services/audiobooksCore';
import { LuxSeg } from './ui/Lux';

/**
 * Audiobooks (owner, 2026-11-17: "add audiobooks, the best library").
 *
 * LibriVox's 22,000 public-domain books, through the Internet Archive: free,
 * legal, in many languages. Shelves by kind of book, search by title or
 * author, a page for every book with its chapters, and your place kept to the
 * second (on this device, and on your others when signed in). Played through
 * Sahrae's audio player: it keeps going with the screen off, with speed,
 * sleep timer and skip back and ahead.
 */

const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

function useBooksVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(BOOKS_CHANGED, on);
    return () => window.removeEventListener(BOOKS_CHANGED, on);
  }, []);
  return v;
}

function Cover({ book, className = '' }: { book: Book; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-zinc-800 ${className}`}>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] font-semibold text-zinc-500 leading-tight">{book.title}</span>
      {book.cover ? (
        <>
          <img src={book.cover} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-60" />
          <img src={book.cover} alt="" loading="lazy" decoding="async" className="relative h-full mx-auto object-contain py-2 drop-shadow-[0_8px_16px_rgba(0,0,0,.55)]"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </>
      ) : (
        <img src={coverOf(book.id)} alt="" loading="lazy" decoding="async" className="relative w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      )}
    </div>
  );
}

function BookCard({ book, onOpen, progress }: { book: Book; onOpen: (b: Book) => void; progress?: number }) {
  return (
    <div role="button" tabIndex={0} data-tv-focusable onClick={() => onOpen(book)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(book); }}
      aria-label={`${book.title} by ${book.author}`} className="ab-card group flex-none w-[132px] md:w-[150px] snap-start cursor-pointer focus:outline-none">
      <div className="relative">
        <Cover book={book} className="aspect-square w-full transition-transform duration-300 group-hover:-translate-y-1 shadow-lg" />
        {book.library && BADGE[book.library] && (
          <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-black/70 text-white">{BADGE[book.library]}</span>
        )}
      </div>
      {progress !== undefined && (
        <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-2"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      )}
      <p className="mt-2 text-[13px] font-semibold text-white leading-snug line-clamp-2">{book.title}</p>
      <p className="text-[11px] text-zinc-400 truncate">{book.author}</p>
      {book.runtime > 0 && <p className="text-[11px] text-zinc-500">{lengthText(book.runtime)}</p>}
    </div>
  );
}

function Row({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      {kicker && <p className="lux-kicker mb-1">{kicker}</p>}
      <h2 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight mb-4">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-hide snap-x">{children}</div>
    </section>
  );
}

/** A shelf that fetches its books once it is about to be seen. */
/** What a card says about where a book is from (LibriVox and Open Library's recordings need no word: read by volunteers). */
const BADGE: Partial<Record<LibraryId, string>> = { radio: 'Radio drama', shop: 'Bestseller', gutenberg: 'Computer voice', archive: 'Internet Archive' };

function ShelfRow({ shelf, library, language, onOpen, eager = false }: { shelf: Shelf; library: LibraryId; language?: string; onOpen: (b: Book) => void; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setBooks(null); setFailed(false);
    const el = ref.current;
    if (!el) return;
    let live = true;
    const load = () => findBooks({ shelf, library, language, rows: 18 }).then((r) => { if (live) setBooks(r.books); }).catch(() => { if (live) setFailed(true); });
    // The first shelves are on screen from the start: fetched at once.
    if (eager) { void load(); return () => { live = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); void load(); } }, { rootMargin: '1600px 0px' });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [shelf, library, language, eager]);
  if (books && !books.length) return null;
  return (
    <div ref={ref}>
      <Row title={shelf.title}>
        {books ? books.map((b) => <BookCard key={b.id} book={b} onOpen={onOpen} />)
          : failed ? <p className="text-sm text-zinc-500 py-6">This shelf did not load. Check your connection.</p>
          : Array.from({ length: 7 }, (_, i) => <div key={i} className="flex-none w-[132px] md:w-[150px]"><div className="aspect-square rounded-xl bg-zinc-800/70 animate-pulse" /><div className="h-3 mt-2 w-3/4 rounded bg-zinc-800/70" /></div>)}
      </Row>
    </div>
  );
}

const SPEEDS = [0.8, 1, 1.25, 1.5, 1.75, 2];
const SLEEPS: [string, number][] = [['15 min', 900], ['30 min', 1800], ['45 min', 2700], ['1 hour', 3600]];

function BookPage({ book, onClose, onOpen }: { book: Book; onClose: () => void; onOpen: (b: Book) => void }) {
  const { playQueue, seek, setRate, sleepTimer, setSleepTimer, current, queueSource, isPlaying, toggle } = useMusic();
  const [rate, setRateState] = useState(bookRate);
  const pickRate = (r: number) => { setRateState(r); keepBookRate(r); setRate(r); };
  const [d, setD] = useState<BookDetail | null>(null);
  const [error, setError] = useState(false);
  const [more, setMore] = useState(false);
  const [others, setOthers] = useState<Book[]>([]);
  useBooksVersion();
  useEffect(() => { let live = true; setOthers([]); otherRecordings(book).then((o) => { if (live) setOthers(o); }).catch(() => {}); return () => { live = false; }; }, [book]);
  useEffect(() => {
    let live = true;
    setD(null); setError(false);
    getBook(book).then((x) => { if (live) setD(x); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [book]);

  const place = placeOf(book.id);
  const here = bookIdFromSource(queueSource) === book.id;
  const nowChapter = here && current?.id?.startsWith(`ab:${book.id}:`) ? Number(current.id.split(':').pop()) : -1;
  const art = d?.cover || coverOf(book.id);

  const start = (chapter?: number) => {
    if (!d || !d.chapters.length) return;
    haptics.press();
    const at = chapter === undefined ? resumePoint(place, d.chapters) : { chapter, position: 0 };
    setActiveBook(d);
    playQueue(chapterTracks(d, art), at.chapter, sourceFor(d.id));
    window.setTimeout(() => { try { if (at.position > 3) seek(at.position); setRate(rate); } catch { /* not yet */ } }, 1200);
  };

  const pct = d ? Math.round(progressOf(place || { id: book.id, chapter: 0, position: 0, updated: 0, book }, d.chapters) * 100) : 0;
  const resumable = !!place && !place.finished && (place.chapter > 0 || place.position > 20);
  const text = d?.description ? stripHtml(d.description) : '';

  return (
    <div role="dialog" aria-label={book.title} data-tv-layer className="fixed inset-0 z-[90] overflow-y-auto bg-zinc-950">
      <div aria-hidden="true" className="ab-backdrop" style={{ backgroundImage: `url("${art}")` }} />
      <div className="relative max-w-5xl mx-auto px-4 md:px-10 pt-[calc(env(safe-area-inset-top)+1rem)] pb-32">
        <button onClick={onClose} data-tv-close data-tv-focusable aria-label="Back to audiobooks" className="mb-6 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold">
          <ChevronLeft className="w-4 h-4" /> Audiobooks
        </button>
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="w-52 md:w-72 shrink-0 mx-auto md:mx-0">
            <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-zinc-800">
              <img src={art} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = coverOf(book.id); }} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="lux-kicker mb-2"><BookOpen className="w-3.5 h-3.5" /> Audiobook</p>
            <h1 className="text-3xl md:text-5xl font-display font-extrabold text-white tracking-tight leading-[1.05]">{book.title}</h1>
            <p className="mt-2 text-lg text-zinc-200">{book.author}</p>
            <p className="mt-2 text-sm text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
              {(d?.runtime || book.runtime) > 0 && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {lengthText(d?.runtime || book.runtime)}</span>}
              {d && <span>{d.chapters.length} {d.chapters.length === 1 ? 'part' : 'parts'}</span>}
              {LANGUAGES.find((l) => l.code === book.language) && <span>{LANGUAGES.find((l) => l.code === book.language)!.name}</span>}
              {d?.readers.length ? <span>Read by {d.readers.join(', ')}</span> : <span>{libraryOf(book.library).voice}</span>}
            </p>
            {pct > 0 && pct < 100 && (
              <div className="mt-4 max-w-sm">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-zinc-400 mt-1.5">{pct}% listened</p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {here && isPlaying ? (
                <button onClick={toggle} data-tv-focusable data-tv-autofocus className="lux-btn px-7 py-3 text-base">Pause</button>
              ) : (
                <button onClick={() => start()} disabled={!d || !d.chapters.length} data-tv-focusable data-tv-autofocus className="lux-btn px-7 py-3 text-base">
                  {!d && !error ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                  {resumable ? 'Resume' : place?.finished ? 'Listen again' : 'Listen'}
                </button>
              )}
              <button onClick={() => toggleSaved(book)} data-tv-focusable aria-pressed={isSaved(book.id)} className="lux-chip h-12 px-5 text-sm">
                <Heart className={`w-4 h-4 ${isSaved(book.id) ? 'fill-current' : ''}`} /> {isSaved(book.id) ? 'In your library' : 'Add to library'}
              </button>
              {(resumable || place?.finished) && (
                <button onClick={() => markFinished(book, !place?.finished)} data-tv-focusable className="lux-chip h-12 px-5 text-sm">
                  <Check className="w-4 h-4" /> {place?.finished ? 'Mark unfinished' : 'Mark finished'}
                </button>
              )}
            </div>
            {here && (
              <div className="mt-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-zinc-500 w-16 inline-flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Speed</span>
                  {SPEEDS.map((s) => <button key={s} onClick={() => pickRate(s)} aria-pressed={rate === s} data-tv-focusable className="lux-chip">{s}×</button>)}
                </div>
                <div className="flex items-center gap-2 flex-wrap"><span className="text-xs text-zinc-500 w-16 inline-flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Sleep</span>
                  {SLEEPS.map(([label, sec]) => <button key={sec} onClick={() => setSleepTimer(sec)} aria-pressed={sleepTimer > 0 && Math.abs(sleepTimer - sec) < 60} data-tv-focusable className="lux-chip">{label}</button>)}
                  {sleepTimer > 0 && <button onClick={() => setSleepTimer(0)} data-tv-focusable className="lux-chip">Off ({Math.ceil(sleepTimer / 60)} min left)</button>}
                </div>
              </div>
            )}
            {text && (
              <div className="mt-6 max-w-2xl">
                <p className={`text-[15px] leading-relaxed text-zinc-300 whitespace-pre-line ${more ? '' : 'line-clamp-5'}`}>{text}</p>
                {text.length > 320 && <button onClick={() => setMore((m) => !m)} data-tv-focusable className="mt-1 text-sm font-semibold text-amber-300">{more ? 'Less' : 'More'}</button>}
              </div>
            )}
          </div>
        </div>

        <h2 className="mt-12 mb-3 text-xl font-display font-bold text-white">Chapters</h2>
        {error && <p className="text-sm text-zinc-400">This book's chapters did not load. Check your connection and open it again.</p>}
        {!d && !error && <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading chapters…</div>}
        {d && !d.chapters.length && <p className="text-sm text-zinc-400">This recording has no playable files.</p>}
        {d && d.chapters.length > 0 && (
          <ol className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] ring-1 ring-white/5 overflow-hidden">
            {d.chapters.map((c) => {
              const playing = c.index === nowChapter;
              const heard = place && !place.finished && c.index < place.chapter;
              const atPlace = place && !place.finished && c.index === place.chapter && place.position > 20;
              return (
                <li key={c.index}>
                  <button onClick={() => (playing ? toggle() : start(c.index))} data-tv-focusable className={`w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[0.05] ${playing ? 'bg-amber-500/10' : ''}`}>
                    <span className={`w-8 text-right tabular-nums text-sm ${playing ? 'text-amber-300 font-bold' : 'text-zinc-500'}`}>{c.index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-semibold ${heard ? 'text-zinc-400' : 'text-white'}`}>{c.title}</span>
                      {atPlace && <span className="block text-xs text-amber-300">You stopped here, {lengthText(place!.position)} in</span>}
                    </span>
                    {heard && <Check className="w-4 h-4 text-zinc-500 shrink-0" />}
                    <span className="text-xs text-zinc-500 tabular-nums shrink-0">{lengthText(c.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {others.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-xl font-display font-bold text-white">Other recordings</h2>
            <p className="mb-4 text-sm text-zinc-400">The same book, read by someone else or by a computer voice.</p>
            <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide snap-x">{others.map((o) => <BookCard key={o.id} book={o} onOpen={onOpen} />)}</div>
          </section>
        )}
        <p className="mt-6 text-xs text-zinc-500">{libraryOf(book.library).credit}</p>
      </div>
    </div>
  );
}

function Qr({ text }: { text: string }) {
  const cells = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`} className="w-56 h-56 rounded-xl bg-white" role="img" aria-label="QR code: scan with your phone">
      <path d={cells.d} fill="#000" />
    </svg>
  );
}

/** A list of free episodes (the author's show, interviews), played in Sahrae's player. */
function EpisodeList({ tracks }: { tracks: Track[] }) {
  const { playQueue, current, isPlaying, toggle } = useMusic();
  return (
    <ol className="divide-y divide-white/5 rounded-2xl bg-white/[0.03] ring-1 ring-white/5 overflow-hidden">
      {tracks.map((t, i) => {
        const on = current?.id === t.id;
        return (
          <li key={t.id}>
            <button onClick={() => { haptics.press(); if (on) toggle(); else playQueue(tracks, i, 'Podcasts'); }} data-tv-focusable
              className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.05] ${on ? 'bg-amber-500/10' : ''}`}>
              <span className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                {t.artwork && <img src={t.artwork} alt="" loading="lazy" className="w-full h-full object-cover" />}
                <span className="absolute inset-0 grid place-items-center bg-black/35">{on && isPlaying ? <Pause className="w-4 h-4 text-white fill-current" /> : <Play className="w-4 h-4 text-white fill-current" />}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold line-clamp-2 ${on ? 'text-amber-200' : 'text-white'}`}>{t.title}</span>
                <span className="block text-xs text-zinc-400 truncate">{t.artist}{t.date ? ` · ${t.date}` : ''}</span>
              </span>
              {(t.duration || 0) > 0 && <span className="text-xs text-zinc-500 tabular-nums shrink-0">{lengthText(t.duration || 0)}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A bestseller (owner, 2026-11-17: "books like The 48 Laws of Power, Malcolm
 * Gladwell"). In copyright, so Sahrae cannot stream it: the page opens the
 * legal ways to listen (borrowing free with a library card, or a store), and
 * plays what is free: the author's own show, interviews with them, and the
 * public-domain classics on the same idea. On a TV, which has no browser, a
 * link is a QR code for the phone.
 */
function ShopPage({ book, onClose, onOpen }: { book: Book; onClose: () => void; onOpen: (b: Book) => void }) {
  useBooksVersion();
  const tv = isTelevision();
  const [about, setAbout] = useState('');
  const [more, setMore] = useState(false);
  const [audio, setAudio] = useState<{ show?: { name: string; episodes: Track[] }; talks: Track[] } | null>(null);
  const [qr, setQr] = useState<ShopLink | null>(null);
  useEffect(() => {
    let live = true;
    aboutBestseller(book).then((t) => { if (live) setAbout(t); }).catch(() => {});
    authorAudio(book).then((a) => { if (live) setAudio(a); }).catch(() => { if (live) setAudio({ talks: [] }); });
    return () => { live = false; };
  }, [book]);
  const big = book.cover?.replace(/-M\.jpg$/, '-L.jpg') || coverOf(book.id);
  const links = shopLinks(book);
  const alike = alikeShelf(book);
  const alikeShelfDef = alike ? SHELVES.find((s) => s.id === alike) : undefined;
  const go = (l: ShopLink) => { haptics.press(); if (tv) setQr(l); else openOutside(l.url); };

  return (
    <div role="dialog" aria-label={book.title} data-tv-layer className="fixed inset-0 z-[90] overflow-y-auto bg-zinc-950">
      <div aria-hidden="true" className="ab-backdrop" style={{ backgroundImage: `url("${big}")` }} />
      <div className="relative max-w-5xl mx-auto px-4 md:px-10 pt-[calc(env(safe-area-inset-top)+1rem)] pb-32">
        <button onClick={onClose} data-tv-close data-tv-focusable aria-label="Back to audiobooks" className="mb-6 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold">
          <ChevronLeft className="w-4 h-4" /> Audiobooks
        </button>
        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="w-44 md:w-60 shrink-0 mx-auto md:mx-0">
            <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-zinc-800">
              <img src={big} alt="" className="w-full h-full object-cover" onError={(e) => { if (book.cover) e.currentTarget.src = book.cover; }} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="lux-kicker mb-2"><BookOpen className="w-3.5 h-3.5" /> Bestseller</p>
            <h1 className="text-3xl md:text-5xl font-display font-extrabold text-white tracking-tight leading-[1.05]">{book.title}</h1>
            <p className="mt-2 text-lg text-zinc-200">{book.author}</p>
            <p className="mt-4 text-sm text-zinc-400 max-w-xl">This book is in copyright, so no free library may stream it. {tv ? 'Choose a way to listen and scan the code with your phone.' : 'Listen to it legally here:'}</p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 max-w-2xl">
              {links.map((l, i) => (
                <button key={l.id} onClick={() => go(l)} data-tv-focusable {...(i === 0 ? { 'data-tv-autofocus': true } : {})}
                  className={`text-left rounded-2xl px-4 py-3.5 ring-1 transition-colors ${i === 0 ? 'bg-amber-400/15 ring-amber-300/40 hover:bg-amber-400/25' : 'bg-white/[0.05] ring-white/10 hover:bg-white/[0.09]'}`}>
                  <span className="flex items-center gap-2 text-[15px] font-bold text-white">{i === 0 ? <Library className="w-4 h-4 text-amber-300" /> : null}{l.label}<ExternalLink className="w-3.5 h-3.5 text-zinc-400 ml-auto" /></span>
                  <span className="block mt-0.5 text-xs text-zinc-400">{l.note}</span>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <button onClick={() => toggleSaved(book)} data-tv-focusable aria-pressed={isSaved(book.id)} className="lux-chip h-11 px-5 text-sm">
                <Heart className={`w-4 h-4 ${isSaved(book.id) ? 'fill-current' : ''}`} /> {isSaved(book.id) ? 'In your library' : 'Add to library'}
              </button>
            </div>
            {about && (
              <div className="mt-6 max-w-2xl">
                <p className={`text-[15px] leading-relaxed text-zinc-300 whitespace-pre-line ${more ? '' : 'line-clamp-5'}`}>{about}</p>
                {about.length > 320 && <button onClick={() => setMore((m) => !m)} data-tv-focusable className="mt-1 text-sm font-semibold text-amber-300">{more ? 'Less' : 'More'}</button>}
              </div>
            )}
          </div>
        </div>

        {audio?.show && (
          <section className="mt-12">
            <p className="lux-kicker mb-1"><Mic className="w-3.5 h-3.5" /> Free · the author's own show</p>
            <h2 className="mb-4 text-xl font-display font-bold text-white">{audio.show.name}</h2>
            <EpisodeList tracks={audio.show.episodes} />
          </section>
        )}
        <section className="mt-12">
          <p className="lux-kicker mb-1"><Mic className="w-3.5 h-3.5" /> Free · plays here</p>
          <h2 className="mb-1 text-xl font-display font-bold text-white">{book.author} in conversation</h2>
          <p className="mb-4 text-sm text-zinc-400">Interviews with the author on podcasts, often about this book.</p>
          {!audio ? <div className="flex items-center gap-2 text-zinc-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Finding interviews…</div>
            : audio.talks.length ? <EpisodeList tracks={audio.talks} />
            : <p className="text-sm text-zinc-500">No interviews found right now.</p>}
        </section>
        {alikeShelfDef && (
          <div className="-mt-2">
            <ShelfRow shelf={{ ...alikeShelfDef, title: 'Free classics on the same idea' }} library="librivox" language="eng" onOpen={onOpen} eager />
          </div>
        )}
        <p className="mt-8 text-xs text-zinc-500">{libraryOf('shop').credit} Library availability depends on your library; store prices and Spotify audiobooks vary by country.</p>
      </div>

      {qr && (
        <div role="dialog" aria-label={`Open ${qr.label} on your phone`} data-tv-layer className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm grid place-items-center p-6" onClick={() => setQr(null)}>
          <div className="rounded-3xl bg-zinc-900 ring-1 ring-white/10 p-8 flex flex-col items-center text-center max-w-md" onClick={(e) => e.stopPropagation()}>
            <Qr text={qr.url} />
            <p className="mt-5 text-lg font-bold text-white">{qr.label}</p>
            <p className="mt-1 text-sm text-zinc-400">Scan with your phone's camera to open {book.title} there.</p>
            <button onClick={() => setQr(null)} data-tv-close data-tv-focusable data-tv-autofocus className="mt-6 lux-btn px-6 py-2.5">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AudiobooksView() {
  const [language, setLanguage] = useState(chosenLanguage);
  const [libraryId, setLibraryId] = useState<LibraryId>(chosenLibrary);
  const library = libraryOf(libraryId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ library: LibraryId; books: Book[] }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<Book | null>(null);
  const v = useBooksVersion();
  const going = useMemo(() => listening(), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => saved(), [v]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search as you type, after a pause; only the newest answer is shown.
  const seq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); setSearching(false); return; }
    const n = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(() => {
      findEverywhere(q, language)
        .then((r) => { if (n === seq.current) setResults(r); })
        .catch(() => { if (n === seq.current) setResults([]); })
        .finally(() => { if (n === seq.current) setSearching(false); });
    }, 380);
    return () => window.clearTimeout(t);
  }, [query, language]);

  const pickLanguage = useCallback((code: string) => { setLanguage(code); chooseLanguage(code); }, []);
  const pickLibrary = useCallback((id: LibraryId) => { setLibraryId(id); chooseLibrary(id); }, []);

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      <LuxGlow />
      <LuxHeader kicker={<><BookOpen className="w-3.5 h-3.5" /> Sahrae · Listen</>} title="Audiobooks"
        meta={<span>Over 30,000 free books, readings, lectures and classic radio plays, found through Open Library and the Internet Archive, your place kept to the second on every device. And today's bestsellers, through your library card or a store.</span>} />

      <div className="mt-6 flex flex-col gap-2">
        <LuxSeg items={LIBRARIES.map((l) => ({ id: l.id, label: l.name }))} active={libraryId} onChange={pickLibrary} className="self-start max-w-full overflow-x-auto" />
        <p className="text-sm text-zinc-400">{library.note}</p>
      </div>

      <div className="mt-6 flex flex-col md:flex-row md:items-center gap-3">
        <label className="relative flex-1 max-w-xl">
          <span className="sr-only">Search audiobooks</span>
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or author" data-tv-focusable
            className="w-full h-12 rounded-full bg-white/[0.06] ring-1 ring-white/10 focus:ring-amber-400/60 outline-none pl-11 pr-10 text-white placeholder:text-zinc-500" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-full hover:bg-white/10 text-zinc-400"><X className="w-4 h-4" /></button>}
        </label>
        {library.languages && <div className="flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="Language">
          {LANGUAGES.map((l) => <button key={l.code} onClick={() => pickLanguage(l.code)} aria-pressed={language === l.code} data-tv-focusable className="lux-chip">{l.name}</button>)}
        </div>}
      </div>

      {query.trim().length >= 2 ? (
        <section className="mt-8">
          <h2 className="text-xl font-display font-bold text-white mb-1">{searching ? 'Searching every library…' : results?.length ? `Results for “${query.trim()}”` : `Nothing found for “${query.trim()}”`}</h2>
          {!searching && results?.length ? <p className="text-sm text-zinc-400 mb-2">From every library at once.</p> : null}
          {(results || []).map((group) => (
            <div key={group.library} className="mt-6">
              <p className="lux-kicker mb-3">{libraryOf(group.library).name} · {group.books.length}</p>
              {libraryOf(group.library).shop && <p className="-mt-1 mb-3 text-sm text-zinc-400">In copyright: borrow free with a library card, or buy.</p>}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
                {group.books.map((b) => <BookCard key={b.id} book={b} onOpen={setOpen} />)}
              </div>
            </div>
          ))}
        </section>
      ) : (
        <>
          {going.length > 0 && (
            <Row title="Continue listening" kicker="Where you left off">
              {going.map((p) => <BookCard key={p.id} book={p.book} onOpen={setOpen} progress={progressOf(p)} />)}
            </Row>
          )}
          {mine.length > 0 && (
            <Row title="Your library">{mine.map((b) => <BookCard key={b.id} book={b} onOpen={setOpen} />)}</Row>
          )}
          {library.shelves.map((s, i) => <ShelfRow key={`${library.id}-${s.id}-${language}`} shelf={s} library={library.id} language={library.languages ? language : undefined} onOpen={setOpen} eager={i < 2} />)}
        </>
      )}

      {open && (open.library === 'shop'
        ? <ShopPage key={open.id} book={open} onClose={() => setOpen(null)} onOpen={setOpen} />
        : <BookPage key={open.id} book={open} onClose={() => setOpen(null)} onOpen={setOpen} />)}
    </div>
  );
}
