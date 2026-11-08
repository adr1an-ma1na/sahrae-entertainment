import { useState, useEffect, useRef, useMemo, Fragment, ReactNode, type MouseEvent as RMouseEvent } from 'react';
import { isSong } from '../services/musicCatalog';
import { isMusicTrack } from '../services/musicFilter';
import { artistsIn, genrePage, myGenres, catalogueSongsBy, GENRES as CATALOG_GENRES, genreById, type GenrePage } from '../services/musicLibrary';
import { ytDataApi } from '../services/ytDataApi';
import { Search, Play, Pause, Heart, Loader2, Music2, Plus, X, ListMusic, Shuffle, Trash2, ChevronLeft, Library, Sparkles, Disc3, User, Youtube, Link2 as LinkIcon, Radio as RadioIcon, Sunrise, MoreVertical } from 'lucide-react';
import AudioShowcase, { type ShowcaseSlide } from './ui/AudioShowcase';
import { momentFor } from '../services/discoverCore';
import { ytmusic, Track, Artist, Album } from '../services/ytmusic';
import { getApiState, ENABLE_URL, type ApiState } from '../services/ytDataApi';
import { useMusic } from '../hooks/useMusic';
import { youtubeService, YoutubePlaylist, YoutubeUserProfile } from '../services/youtube';
import { CoverArt } from './ui/CoverArt';
import { ArtCard, QuickTile } from './ui/Shelf';
import VideoCard from './ui/VideoCard';
import EmptyState from './EmptyState';

// The current year, for search queries. Hardcoding it meant every shelf
// quietly became last year's music on 1 January.
const YEAR = new Date().getFullYear();
import SautiOnboarding, { type OnboardingResult } from './SautiOnboarding';
import { loadPicks, savePicks, dailyMixes as curatedDailyMixes, pickedGenreMixes, artistNamed } from '../services/sautiMixes';
import { asTrack } from '../services/resolveYt';
import { weigh, loadTaste, artistKey, TASTE_CHANGE } from '../services/taste';
import { buildTasteHome, songKey, uniqueSongs, type TasteHome } from '../services/tasteHome';
import { deezer, type DzAlbum } from '../services/deezer';
import { splitReleases, onePerSong } from '../services/curate';
import { searchCatalogue } from '../services/musicSearch';
import { LuxHeader, LuxSeg } from './ui/Lux';
import Coachmark from './Coachmark';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60); const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

// Deterministic PRNG + string hash, so a mood/genre page shuffles the SAME way
// all day (stable within a day) but reshuffles each new day.
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seededShuffle<T>(arr: T[], seed: number): T[] { const a = [...arr]; const rng = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Bias a pool toward recent uploads so "top/trending/new" lists feel current
// instead of surfacing 6-year-old viral videos. Recent (≤ ~18 months) come first
// (shuffled by seed), older fill the tail so lists never go thin. Undated tracks
// are treated as older.
function freshFirst(pool: Track[], seed: number, count: number): Track[] {
  const RECENT_MS = 1000 * 60 * 60 * 24 * 30 * 18; // ~18 months
  const now = Date.now();
  const recent: Track[] = []; const older: Track[] = [];
  for (const t of pool) ((t.uploaded && now - t.uploaded < RECENT_MS) ? recent : older).push(t);
  return [...seededShuffle(recent, seed), ...seededShuffle(older, seed ^ 0x9e3779b9)].slice(0, count);
}

// Drop bootleg compilations / DJ mixes / bass-boosted junk so shelves show real
// songs, not "TOP HITS 2026 V2" or "EDM MIX ULTRA BEATS BASS BOOSTED".
const JUNK_RE = /(\bdj\s|nonstop|non-stop|mashup|megamix|mega\s?mix|\bmix\b|bass\s?boosted|ultra\s?beats|top\s?hits\s?(vol|v\d|\d{2,})|vol\.?\s*\d|hour[s]?\s(of|mix)|full\salbum|compilation|greatest\shits|the\stop\sdeep|slowed|reverb|\bremix\b)/i;
function isCleanSong(t: Track): boolean {
  if (!t) return false;
  if (!isMusicTrack(t)) return false; // a video about music, or many songs at once (services/musicFilter.ts)
  if (t.duration && t.duration > 600) return false; // >10 min → almost always a mix/compilation
  // YouTube Shorts and behind-the-scenes clips: a song title does not tag
  // itself #shorts, and three or more hashtags is promotion rather than a name.
  // One reached "New in Kenya" as "Making Of #TseMonate #behindthescenes #BTS
  // #shorts #kenya #trending…".
  const title = t.title || '';
  if (/#shorts?\b/i.test(title) || (title.match(/#\w+/g) || []).length >= 3) return false;
  if (t.duration && t.duration < 60) return false; // under a minute is a clip, not a song
  return !JUNK_RE.test(`${t.title} ${t.artist}`);
}

const dayKey = () => Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));

// Stable colour identity for playlists / covers that have no artwork — one
// hand-picked duotone per name, so the Library reads as distinct, colourful
// tiles instead of identical grey slabs. Literal strings so Tailwind keeps them.
const COVER_GRADS = [
  'from-rose-500 to-orange-600', 'from-emerald-500 to-teal-700', 'from-sky-500 to-indigo-700',
  'from-violet-500 to-fuchsia-700', 'from-fuchsia-500 to-rose-700', 'from-cyan-500 to-blue-700',
  'from-lime-500 to-emerald-700', 'from-indigo-500 to-purple-800', 'from-amber-400 to-orange-700',
  'from-teal-400 to-cyan-700',
];
const gradFor = (s: string) => COVER_GRADS[hashStr(s || 'x') % COVER_GRADS.length];
const monogram = (n: string) => (n || '').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '♪';

// Spotify-style mood cards — each scannable at a glance with its own colour.
// `grad` classes are literal so Tailwind keeps them; `tint` colours the mood page.
const MOODS: { name: string; grad: string; tint: string }[] = [
  { name: 'Chill', grad: 'from-teal-500 to-teal-700', tint: 'rgba(20,184,166,0.5)' },
  { name: 'Workout', grad: 'from-orange-500 to-orange-700', tint: 'rgba(249,115,22,0.5)' },
  { name: 'Party', grad: 'from-fuchsia-500 to-pink-700', tint: 'rgba(217,70,239,0.5)' },
  { name: 'Focus', grad: 'from-blue-700 to-blue-900', tint: 'rgba(29,78,216,0.5)' },
  { name: 'Sad', grad: 'from-indigo-500 to-indigo-800', tint: 'rgba(99,102,241,0.5)' },
  { name: 'Happy', grad: 'from-yellow-400 to-amber-500', tint: 'rgba(250,204,21,0.5)' },
  { name: 'Romance', grad: 'from-pink-500 to-rose-600', tint: 'rgba(236,72,153,0.5)' },
  { name: 'Afro Vibes', grad: 'from-green-500 to-emerald-700', tint: 'rgba(34,197,94,0.5)' },
  { name: 'Gospel', grad: 'from-amber-400 to-yellow-600', tint: 'rgba(251,191,36,0.5)' },
  { name: 'Road Trip', grad: 'from-sky-400 to-sky-600', tint: 'rgba(56,189,248,0.5)' },
  { name: 'Sleep', grad: 'from-slate-700 to-slate-900', tint: 'rgba(51,65,85,0.6)' },
  { name: 'Throwback', grad: 'from-purple-500 to-purple-800', tint: 'rgba(168,85,247,0.5)' },
  { name: 'Motivation', grad: 'from-red-500 to-red-700', tint: 'rgba(239,68,68,0.5)' },
  { name: 'Lounge', grad: 'from-stone-500 to-stone-700', tint: 'rgba(120,113,108,0.5)' },
  { name: 'Dance', grad: 'from-rose-400 to-orange-500', tint: 'rgba(251,113,133,0.5)' },
];

function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className="w-0.5 bg-amber-400 rounded-full animate-[eq_0.9s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: `${i * 0.15}s` }} />)}
    </div>
  );
}

// Long-press (mobile) / right-click (desktop) → open the track context menu
// (the add-to-playlist sheet, which carries Radio / Play next / Queue / Download).
// `consumed()` lets the row swallow the click that follows a long-press.
function useLongPress(onTrigger: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = undefined; } };
  const handlers = {
    onContextMenu: (e: RMouseEvent) => { e.preventDefault(); onTrigger(); },
    onTouchStart: () => { fired.current = false; clear(); timer.current = window.setTimeout(() => { fired.current = true; onTrigger(); }, 500); },
    onTouchEnd: clear,
    onTouchMove: clear,
  };
  const consumed = () => { if (fired.current) { fired.current = false; return true; } return false; };
  return { handlers, consumed };
}

/**
 * m:ss, the way every music app shows a track length. Blank when we don't know
 * it — the catalog used to report a flat 180s for everything, and a confident
 * wrong number is worse than an honest gap.
 */
const fmtDur = (s?: number): string => {
  if (!s || !isFinite(s) || s <= 0) return '';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};

/**
 * What "new" and "discovery" mean in each chart region.
 *
 * These shelves used to search the same words for everyone —
 * "new releases music hits 2026" — with no region. YouTube's global volume
 * for that phrase is dominated by Indian releases, so a Kenyan listener who
 * picked Burna Boy, Wizkid and Tems was shown Haryanvi and Punjabi tracks.
 * Now the query speaks the region's music, and the search is scoped to the
 * region, so its results are also what can actually play there.
 *
 * The year is computed, not typed: a hardcoded "2026" silently turns every
 * shelf into last year's music on the first of January.
 */
const REGION_MUSIC: Record<string, { name: string; releases: string; discover: string }> = {
  KE: { name: 'Kenya', releases: 'new kenyan songs official video', discover: 'east african music new artists' },
  NG: { name: 'Nigeria', releases: 'new naija afrobeats songs official video', discover: 'new afrobeats artists' },
  ZA: { name: 'South Africa', releases: 'new amapiano songs official video', discover: 'south african new artists amapiano' },
  GB: { name: 'the UK', releases: 'new uk songs official video', discover: 'uk rising artists new music' },
  US: { name: 'the US', releases: 'new songs official video', discover: 'rising artists new music' },
};
const regionMusic = (code: string) => REGION_MUSIC[code] || REGION_MUSIC.KE;

function TrackRow({ track, onPlay, onRemove, index, list = false }: { track: Track; onPlay: () => void; onRemove?: () => void; index?: number; list?: boolean }) {
  const { current, isPlaying, toggle, toggleLike, isLiked, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  const { handlers, consumed } = useLongPress(() => openAddSheet(track));
  return (
    <div tabIndex={0} data-tv-focusable role="button" {...handlers} onClick={() => { if (consumed()) return; active ? toggle() : onPlay(); }}
      className={list
        ? `group flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer focus:outline-none transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] ${active ? 'bg-amber-400/[0.08]' : ''}`
        : 'card-lift group flex items-center gap-3 p-2 pr-2 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none'}>
      {typeof index === 'number' && (
        <span className={`w-6 text-center text-xs font-semibold tabular shrink-0 hidden sm:block ${active ? 'text-sauti' : 'text-zinc-500'}`}>{active && isPlaying ? <Equalizer /> : index + 1}</span>
      )}
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
        <CoverArt imageUrl={track.artworkLarge || track.artwork} fallbackUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        {!track.artwork && <Music2 className="w-5 h-5 text-zinc-600 absolute inset-0 m-auto" />}
        <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active && isPlaying ? <Pause className="w-5 h-5 text-white fill-current" /> : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${active ? 'text-sauti' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
      </div>
      {active && isPlaying && (list ? <span className="sm:hidden"><Equalizer /></span> : <Equalizer />)}
      {fmtDur(track.duration) && (
        <span className="text-xs text-zinc-500 tabular shrink-0 hidden sm:block">{fmtDur(track.duration)}</span>
      )}
      <button onClick={(e) => { e.stopPropagation(); toggleLike(track); }} className={`p-2 rounded-full ${list ? 'hidden md:block' : ''} ${isLiked(track.id) ? 'text-sauti' : 'text-zinc-500 hover:text-white'}`} aria-label="Like"><Heart className={`w-4 h-4 ${isLiked(track.id) ? 'fill-current' : ''}`} /></button>
      {onRemove ? (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 rounded-full text-zinc-500 hover:text-red-400" aria-label="Remove"><X className="w-4 h-4" /></button>
      ) : list ? (
        // One menu for the rest (like, playlist, radio, queue, download), as in Spotify.
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-400 hover:text-white" aria-label={`More for ${track.title}`}><MoreVertical className="w-5 h-5" /></button>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-500 hover:text-white" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
      )}
    </div>
  );
}

/**
 * A "Mixed for you" card, drawn as a poster rather than a tile: the lead
 * artist's photo melting into the mix's colour, the name set large over it, the
 * artists inside as a row of small covers, a gold hairline at the foot and a
 * faint record in the corner (Sauti's vinyl motif). The flat colour band it
 * replaces copied Spotify exactly and looked cheaper than the rest of Sahrae.
 */
function MixCard({ title, subtitle, tracks, cover, tint, onOpen, onPlay }: {
  title: string; subtitle: string; tracks: Track[]; cover?: string; tint?: string; onOpen: () => void; onPlay: () => void;
}) {
  const colour = tint || tracks[0]?.dominantColor || 'rgb(var(--acc-rgb))';
  const faces: Track[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const a = (t.artist || '').toLowerCase();
    if (!t.artwork || seen.has(a)) continue;
    seen.add(a); faces.push(t);
    if (faces.length === 3) break;
  }
  const wash = 'linear-gradient(to top, #000 0%, #000 34%, transparent 74%)';
  return (
    <div role="button" onClick={onOpen} tabIndex={0} data-tv-focusable aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="group flex-none w-[168px] md:w-[208px] text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
        <CoverArt imageUrl={cover || tracks[0]?.artworkLarge || tracks[0]?.artwork} dominantColor={tracks[0]?.dominantColor} rounded=""
          className="absolute inset-0 w-full h-[82%] transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]" />
        {/* The photo melts into the mix's colour. */}
        <div aria-hidden className="absolute inset-0" style={{ background: colour, maskImage: wash, WebkitMaskImage: wash }} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25" />
        {/* A record turning out of the corner, barely there. */}
        <span aria-hidden className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full opacity-[0.14]"
          style={{ background: 'repeating-radial-gradient(circle, #fff 0 1px, transparent 1px 4px)' }} />
        {/* A light sweep on hover. */}
        <span aria-hidden className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <span className="absolute top-2.5 left-2.5 px-2 py-[3px] rounded-full bg-black/40 backdrop-blur-sm text-[9px] font-bold uppercase tracking-[0.2em] text-amber-200 ring-1 ring-amber-200/25">Made for you</span>
        <div className="absolute inset-x-0 bottom-0 p-3 md:p-3.5">
          <p className="font-display font-extrabold text-[21px] md:text-[25px] leading-[1.02] tracking-tight text-[#fff] line-clamp-2 [text-shadow:0_2px_14px_rgba(0,0,0,0.45)]">{title}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="flex -space-x-2">
              {faces.map((t) => (
                <img key={t.id} src={t.artwork} alt="" loading="lazy" className="w-6 h-6 md:w-7 md:h-7 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${colour}` }} />
              ))}
            </span>
            <button onClick={(e) => { e.stopPropagation(); onPlay(); }} tabIndex={-1} aria-label={`Play ${title}`}
              className="btn-sauti w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shadow-[0_8px_18px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-105">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          </div>
        </div>
        <span aria-hidden className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      </div>
      <p className="mt-2.5 text-xs text-zinc-400 line-clamp-2 leading-snug">{subtitle}</p>
    </div>
  );
}

/** A Library row, the way Spotify lists one: artwork, the name, what it is. */
function LibRow({ title, subtitle, art, round = false, onClick }: { title: string; subtitle: string; art: ReactNode; round?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} tabIndex={0} data-tv-focusable
      className="w-full flex items-center gap-3 p-1.5 rounded-lg text-left hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors">
      <span className={`relative w-16 h-16 shrink-0 overflow-hidden bg-zinc-800 shadow-[0_6px_16px_rgba(0,0,0,0.4)] ${round ? 'rounded-full' : 'rounded-md'}`}>{art}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-white truncate">{title}</span>
        <span className="block text-xs text-zinc-400 truncate mt-0.5">{subtitle}</span>
      </span>
    </button>
  );
}

/** A playlist's cover: four covers as a collage, else its first, else its colour and initials. */
function ListArt({ name, tracks }: { name: string; tracks: Track[] }) {
  const covers = [...new Set(tracks.map((t) => t.artwork).filter(Boolean) as string[])].slice(0, 4);
  if (covers.length >= 4) {
    return <span className="absolute inset-0 grid grid-cols-2 grid-rows-2">{covers.map((c) => <img key={c} src={c} alt="" loading="lazy" className="w-full h-full object-cover" />)}</span>;
  }
  if (covers[0]) return <img src={covers[0]} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />;
  return (
    <span className={`absolute inset-0 bg-gradient-to-br ${gradFor(name)} flex items-center justify-center`}>
      <span className="font-display font-black text-[#fff] text-lg drop-shadow">{monogram(name)}</span>
    </span>
  );
}

/** "1 h 22 min", "38 min": a collection's running time. */
function runtime(tracks: Track[]): string {
  const s = tracks.reduce((n, t) => n + (t.duration || 0), 0);
  if (!s) return '';
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/**
 * The top of a playlist, mix, album or artist: its artwork blown up into the
 * room's light, the cover on a pedestal (four covers as a collage for a
 * playlist, the way Spotify and Apple Music show one), a kicker, a metal title,
 * the count and running time, and the actions.
 */
function CollectionHero({ kicker, title, tracks, image, icon, round = false, blurb, meta: metaText, children }: {
  kicker: ReactNode; title: string; tracks: Track[]; image?: string; icon?: ReactNode; round?: boolean;
  /** A line under the title: who is in a mix. */
  blurb?: string;
  /** Replaces the song count and running time; '' shows none (an artist is not a playlist). */
  meta?: string;
  children?: ReactNode;
}) {
  const covers = [...new Set(tracks.map((t) => t.artworkLarge || t.artwork).filter(Boolean) as string[])].slice(0, 4);
  const lead = image || covers[0];
  const meta = metaText ?? [tracks.length ? `${tracks.length} songs` : '', runtime(tracks)].filter(Boolean).join(' · ');
  return (
    <section className="mb-7">
      {/* The artwork's own light, filling the top of the page and fading into it. A
          dark box around the hero cut the page in two. */}
      {lead && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px] -z-10 overflow-hidden">
          <img src={lead} alt="" className="hero-bleed absolute inset-0 w-full h-full object-cover scale-125 blur-3xl opacity-55" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 0%, var(--page-ground) 92%)' }} />
        </div>
      )}
      <div className="flex flex-col items-center sm:flex-row sm:items-end gap-5 md:gap-8">
        <div className={`relative shrink-0 w-56 h-56 md:w-60 md:h-60 overflow-hidden shadow-[0_30px_60px_-18px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.1)] ${round ? 'rounded-full' : 'rounded-xl'}`}>
          {icon ? icon
            : !image && covers.length >= 4 ? (
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                {covers.map((c) => <img key={c} src={c} alt="" className="w-full h-full object-cover" />)}
              </div>
            ) : lead ? <img src={lead} alt="" className="absolute inset-0 w-full h-full object-cover" />
            : <div className={`absolute inset-0 bg-gradient-to-br ${gradFor(title)} flex items-center justify-center`}><ListMusic className="w-16 h-16 text-[#fff] drop-shadow" /></div>}
        </div>
        <div className="min-w-0 w-full sm:flex-1">
          <p className="lux-kicker mb-1.5">{kicker}</p>
          <h2 className="lux-title text-[34px] leading-[1.05] md:text-6xl pb-1 line-clamp-2">{title}</h2>
          {blurb && <p className="mt-1.5 text-sm text-zinc-300 line-clamp-2">{blurb}</p>}
          {meta && <p className="mt-1.5 text-[13px] font-semibold text-zinc-400 tabular">{meta}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** The songs of a collection, as one clean list: number, title, length. */
function SongList({ tracks, onPlay, onRemove }: { tracks: Track[]; onPlay: (i: number) => void; onRemove?: (t: Track) => void }) {
  return (
    <div>
      <div className="hidden sm:flex items-center gap-3 px-3 pb-2 mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 border-b" style={{ borderColor: 'var(--lux-line)' }}>
        <span className="w-6 text-center">#</span><span className="flex-1">Title</span><span className="pr-24">Time</span>
      </div>
      {tracks.map((t, i) => (
        <Fragment key={t.id}><TrackRow track={t} index={i} list onPlay={() => onPlay(i)} onRemove={onRemove ? () => onRemove(t) : undefined} /></Fragment>
      ))}
    </div>
  );
}

/**
 * Shelf card. Built on the shared ArtCard so a rail of songs, a rail of albums
 * and a rail of podcast shows are the same object in three places: square art
 * with a shadow, title and artist below it, and a round play button that lifts
 * out of the artwork on hover.
 */
function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying, toggle, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  const { handlers, consumed } = useLongPress(() => openAddSheet(track));
  return (
    <div {...handlers} className="relative shrink-0 group/card">
      <ArtCard
        title={track.title}
        subtitle={track.artist}
        artwork={track.artworkLarge || track.artwork}
        dominantColor={track.dominantColor}
        playing={active && isPlaying}
        onClick={() => { if (consumed()) return; onPlay(); }}
        onPlay={() => { if (active) toggle(); else onPlay(); }}
      />
      <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }}
        className="absolute top-2 left-2 md:top-5 md:left-5 z-10 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity"
        aria-label={`Add ${track.title} to a playlist`}>
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

// Compact, borderless row for the YouTube-Music-style "Quick picks" grid.
function QuickRow({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying, toggle, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  const { handlers, consumed } = useLongPress(() => openAddSheet(track));
  return (
    <div tabIndex={0} data-tv-focusable role="button" {...handlers} onClick={() => { if (consumed()) return; active ? toggle() : onPlay(); }}
      className="group flex items-center gap-3 p-1.5 rounded-lg hover:bg-white/5 focus:bg-white/5 cursor-pointer focus:outline-none">
      <div className="relative w-12 h-12 rounded-md overflow-hidden bg-zinc-800 shrink-0">
        <CoverArt imageUrl={track.artworkLarge || track.artwork} fallbackUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        {!track.artwork && <Music2 className="w-5 h-5 text-zinc-600 absolute inset-0 m-auto" />}
        <div className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {active && isPlaying ? <Pause className="w-4 h-4 text-white fill-current" /> : <Play className="w-4 h-4 text-white fill-current ml-0.5" />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate ${active ? 'text-sauti' : 'text-white'}`}>{track.title}</p>
        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
      </div>
      {active && isPlaying && <Equalizer />}
      {fmtDur(track.duration) && (
        <span className="text-xs text-zinc-500 tabular shrink-0">{fmtDur(track.duration)}</span>
      )}
      <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 shrink-0" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
    </div>
  );
}

/**
 * Shelf heading. Matches ShelfHeader on the Podcasts page so the two Listen
 * destinations read as one product: bold title, no decorative rule. The gold bar
 * that used to prefix every heading is gone — with a heading above every shelf
 * it became visual noise rather than an accent. An explicit `icon` still shows,
 * because those carry meaning (Sparkles for generated mixes, YouTube for synced
 * playlists) rather than being decoration.
 */
const SectionHead = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <div className="flex items-center gap-2.5 mb-4">
    {icon}
    <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight">{children}</h3>
  </div>
);

type Detail = { kind: 'artist' | 'album'; id: string; name: string; thumbnail?: string; subtitle?: string };

/** "Today", "3 days ago", "2 weeks ago", "12 Sep": how recent a release is. */
function releasedAgo(date: string): string {
  const t = Date.parse(date);
  if (!t) return '';
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Time-of-day greeting (spec §1.2.3 / §1.2.4).
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

export default function MusicView({ onNav }: { onNav?: (tab: string) => void }) {
  const { current, isPlaying, playQueue, playShuffled, startRadio, likedTracks, playlists, recentlyPlayed: rawRecent, tasteSeeds, onboarded, addTasteSeeds, completeOnboarding, createPlaylist, importPlaylist, deletePlaylist, removeFromPlaylist, openAddSheet, setVideoMode, setExpanded } = useMusic();
  // One hover preview at a time across the Music videos shelf.
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);
  // Sauti is music only — podcasts play through the shared engine, so strip them
  // from every recently-played-derived shelf, pill, mix, and the header gradient.
  // isPodcast covers video episodes, which are ordinary YouTube ids with no feed.
  const recentlyPlayed = rawRecent.filter((t) => !t.id.startsWith('pod:') && !t.feedUrl && !t.isPodcast);
  // The artists in this listener's Library: whoever they like and play most,
  // each with their songs (the first one's art stands in for a photo).
  const libArtists = useMemo(() => {
    const by = new Map<string, { key: string; name: string; tracks: Track[] }>();
    const music = rawRecent.filter((t) => !t.id.startsWith('pod:') && !t.feedUrl && !t.isPodcast);
    for (const t of uniqueSongs([...likedTracks, ...music])) {
      const name = (t.artist || '').split(/,|&|\s+(?:feat\.?|ft\.?|featuring|x)\s+/i)[0].trim();
      if (!name || name === 'Unknown Artist') continue;
      const key = artistKey(name);
      const e = by.get(key) || { key, name, tracks: [] };
      e.tracks.push(t);
      by.set(key, e);
    }
    return [...by.values()].sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12);
  }, [likedTracks, rawRecent]);

  // Cold-start onboarding: show the taste picker only to a genuinely fresh
  // listener (no plays, likes, or seeds yet). `tasteSig` is a stable dep for the
  // personalised builders below — it changes when seeds are added (first
  // onboarding OR a later "Tune your taste"), but NOT while listening, so the
  // mixes rebuild on taste changes without thrashing on every play.
  const tasteSig = tasteSeeds.length;

  // The taste profile (services/taste.ts): the listener's artists, weighted by
  // picks, likes, plays and skips. Everything personal on this page starts from
  // it; a listener with none sees the charts and regional shelves instead.
  const [tasteRev, setTasteRev] = useState(0);
  useEffect(() => {
    const on = () => setTasteRev((n) => n + 1);
    window.addEventListener(TASTE_CHANGE, on);
    return () => window.removeEventListener(TASTE_CHANGE, on);
  }, []);
  const [picksRev, setPicksRev] = useState(0);
  const tasteLog = useMemo(() => loadTaste(), [tasteRev, rawRecent[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => weigh({
    picks: (loadPicks()?.artists || []).map((a) => a.name),
    liked: likedTracks.filter((t) => !t.isPodcast).map((t) => t.artist),
    log: tasteLog,
  }), [tasteLog, likedTracks, picksRev]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasTaste = ranked.length > 0;
  const banned = useMemo(() => new Set(tasteLog.banned), [tasteLog]);
  const allowed = (t: { artist: string }) => !banned.has(artistKey(t.artist));
  // The strongest dozen and the bans: when these change, the personal shelves are rebuilt.
  const topSig = ranked.slice(0, 12).map((w) => w.key).join(',') + '|' + tasteLog.banned.join(',');
  const [tasteHome, setTasteHome] = useState<TasteHome | null>(null);
  const [redoTaste, setRedoTaste] = useState(false); // "Tune your taste" manually re-opens the picker
  const showOnboarding = redoTaste || (!onboarded && recentlyPlayed.length === 0 && likedTracks.length === 0 && tasteSeeds.length === 0);
  const closeOnboarding = () => { completeOnboarding(); setRedoTaste(false); };
  const finishOnboarding = async (r: OnboardingResult) => {
    savePicks({ artists: r.artists, genres: r.genres });
    setPicksAt(Date.now());
    setPicksRev((n) => n + 1);
    closeOnboarding();
  };


  const [tab, setTab] = useState<'home' | 'library'>('home');
  const [sections, setSections] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [mix, setMix] = useState<Track[]>([]);
  const [madeForYou, setMadeForYou] = useState<{ id: string; title: string; subtitle: string; tracks: Track[]; cover?: string; tint?: string }[]>([]);
  // Bumped when the first-run picks change, so the mixes rebuild from them.
  const [picksAt, setPicksAt] = useState(() => loadPicks()?.at || 0);
  const [viewMix, setViewMix] = useState<{ id: string; title: string; subtitle: string; tracks: Track[] } | null>(null);

  // YouTube Music style Mood filter chips
  const [activeMood, setActiveMood] = useState<string>('All');
  // "Right now": the hour and the day pick a mix (discoverCore.momentFor).
  const [moment] = useState(() => momentFor(new Date(), YEAR));
  const [daylist, setDaylist] = useState<Track[]>([]);
  const [moodTracks, setMoodTracks] = useState<Track[]>([]);
  const [moodLoading, setMoodLoading] = useState(false);

  // Live Trending Charts region. This defaulted to 'US' for everyone, in an app
  // built for Kenya — the first chart a Nairobi listener saw was Billboard. Now:
  // the listener's last choice, else their device region if it is one of the
  // charts on offer, else Kenya.
  const [chartRegion, setChartRegionState] = useState<string>(() => {
    const offered = ['US', 'GB', 'KE', 'NG', 'ZA'];
    try {
      const saved = localStorage.getItem('sahrae.music.chartRegion.v1');
      if (saved && offered.includes(saved)) return saved;
    } catch { /* storage unavailable */ }
    const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
    for (const l of langs) {
      const region = String(l || '').split(/[-_]/)[1]?.toUpperCase();
      if (region && offered.includes(region)) return region;
    }
    return 'KE';
  });
  const setChartRegion = (r: string) => {
    setChartRegionState(r);
    try { localStorage.setItem('sahrae.music.chartRegion.v1', r); } catch { /* storage unavailable */ }
  };
  const [chartTracks, setChartTracks] = useState<Track[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Mood / genre page (YouTube-Music-style) — a chip opens a dedicated page.
  const [genre, setGenre] = useState<string | null>(null);
  const [genreTint, setGenreTint] = useState<string | null>(null);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const openMood = (name: string, tint?: string) => { setGenreTint(tint || null); setGenre(name); };
  // Catalogue genres (Afrobeats, Amapiano, ...): their own pages, built from
  // the genre's playlists rather than searches.
  const [catGenre, setCatGenre] = useState<string | null>(null);
  const [allGenres, setAllGenres] = useState(false);
  const [catPage, setCatPage] = useState<GenrePage | null>(null);
  const [catTab, setCatTab] = useState<'popular' | 'new' | 'artists'>('popular');
  const [artistsForYou, setArtistsForYou] = useState<Artist[]>([]);
  useEffect(() => {
    if (!catGenre) return;
    let cancelled = false;
    setCatPage(null); setCatTab('popular');
    genrePage(catGenre).then((p) => { if (!cancelled) setCatPage(p); }).catch(() => { if (!cancelled) setCatPage({ popular: [], fresh: [], artists: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [catGenre]);
  useEffect(() => {
    // With a taste profile, "Artists you might like" comes from the listener's own
    // artists (tasteHome.ts); this region-and-genre guess is for a listener with none.
    if (hasTaste) return;
    let cancelled = false;
    // After the home shelves, so the first screen is never waiting on this.
    const t = setTimeout(() => {
      artistsIn(myGenres(4), 30).then((a) => { if (!cancelled) setArtistsForYou(a); }).catch(() => {});
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [hasTaste]);

  // The personal shelves: built from the listener's artists only, kept for the day.
  useEffect(() => {
    if (!hasTaste) { setTasteHome(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      const heard = new Set([...rawRecent, ...likedTracks].map((x) => songKey(x.artist, x.title)));
      buildTasteHome({ ranked, picks: loadPicks()?.artists || [], banned: tasteLog.banned, heard })
        .then((h) => { if (!cancelled) setTasteHome(h); })
        .catch(() => {});
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topSig]);


  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [rSongs, setRSongs] = useState<Track[]>([]);
  const [rTopArtist, setRTopArtist] = useState<Artist | null>(null);
  const [rArtists, setRArtists] = useState<Artist[]>([]);
  const [rAlbums, setRAlbums] = useState<Album[]>([]);
  const tRef = useRef<number | undefined>(undefined);

  // Detail pages (artist / album)
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTracks, setDetailTracks] = useState<Track[]>([]);
  const [detailAlbums, setDetailAlbums] = useState<(Album & { sub?: string })[]>([]);
  const [detailSingles, setDetailSingles] = useState<(Album & { sub?: string })[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [trackSort, setTrackSort] = useState<'default' | 'title' | 'artist' | 'duration'>('default');

  // Library local state
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [libFilter, setLibFilter] = useState<'all' | 'playlists' | 'artists'>('all');
  const [popularAll, setPopularAll] = useState(false);
  const [newName, setNewName] = useState('');

  // YouTube Sync States
  const [isYoutubeConnected, setIsYoutubeConnected] = useState(youtubeService.isConnected());
  const [youtubeProfile, setYoutubeProfile] = useState<YoutubeUserProfile | null>(null);
  const [youtubePlaylists, setYoutubePlaylists] = useState<YoutubePlaylist[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  // Connected, loaded, no error: YouTube's liked list and playlists can sit in the Library list.
  const ytReady = isYoutubeConnected && !youtubeLoading && !youtubeError;

  const [ytTracks, setYtTracks] = useState<Track[]>([]);
  const [ytTracksLoading, setYtTracksLoading] = useState(false);

  // Catalog connector state, polled because it is learned from the first real
  // API response rather than known up front.
  const [catalogState, setCatalogState] = useState<ApiState>(getApiState());
  useEffect(() => {
    const id = window.setInterval(() => setCatalogState(getApiState()), 1500);
    return () => window.clearInterval(id);
  }, []);

  // Import-by-link state (public playlists, no sign-in).
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadYoutubeData = async () => {
    if (!youtubeService.isConnected()) return;
    setYoutubeLoading(true);
    setYoutubeError(null);
    try {
      const profile = await youtubeService.fetchUserProfile();
      setYoutubeProfile(profile);
      const playlists = await youtubeService.fetchPlaylists();
      setYoutubePlaylists(playlists);
    } catch (err: any) {
      console.error('Error loading YouTube data:', err);
      setYoutubeError(err.message || 'Failed to sync your YouTube Music account.');
    } finally {
      setYoutubeLoading(false);
    }
  };

  useEffect(() => {
    if (isYoutubeConnected) {
      loadYoutubeData();
    }
  }, [isYoutubeConnected]);

  useEffect(() => {
    if (!openId) {
      setYtTracks([]);
      return;
    }

    if (openId === 'yt_liked') {
      setYtTracksLoading(true);
      youtubeService.fetchLikedMusic()
        .then(tracks => {
          setYtTracks(tracks);
        })
        .catch(err => {
          console.error(err);
          setYoutubeError(err.message || 'Failed to load Liked Music.');
        })
        .finally(() => {
          setYtTracksLoading(false);
        });
    } else if (openId.startsWith('yt_')) {
      const pId = openId.replace('yt_', '');
      setYtTracksLoading(true);
      youtubeService.fetchPlaylistTracks(pId)
        .then(tracks => {
          setYtTracks(tracks);
        })
        .catch(err => {
          console.error(err);
          setYoutubeError(err.message || 'Failed to load YouTube playlist.');
        })
        .finally(() => {
          setYtTracksLoading(false);
        });
    }
  }, [openId]);

  const handleConnectYoutube = async () => {
    setYoutubeLoading(true);
    setYoutubeError(null);
    try {
      await youtubeService.signInWithGoogle();
      setIsYoutubeConnected(true);
    } catch (err: any) {
      console.error('YouTube login error:', err);
      setYoutubeError(err.message || 'Failed to connect your YouTube Music account.');
    } finally {
      setYoutubeLoading(false);
    }
  };

  // Import a public/unlisted playlist by link — no sign-in required.
  const handleImportPlaylist = async () => {
    const url = importUrl.trim();
    if (!url || importing) return;
    setImporting(true); setImportMsg(null);
    try {
      const { playlist, tracks } = await youtubeService.importPublicPlaylist(url);
      if (!tracks.length) {
        setImportMsg({ ok: false, text: 'That playlist resolved but had no playable tracks in it.' });
        return;
      }
      const id = importPlaylist(playlist.title, tracks);
      setImportUrl('');
      setImportMsg({ ok: true, text: `Imported “${playlist.title}”: ${tracks.length} track${tracks.length === 1 ? '' : 's'}.` });
      setOpenId(id);
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not import that playlist.' });
    } finally {
      setImporting(false);
    }
  };

  const handleDisconnectYoutube = () => {
    youtubeService.disconnect();
    setIsYoutubeConnected(false);
    setYoutubeProfile(null);
    setYoutubePlaylists([]);
    setOpenId(null);
  };

  // Fetch real-time YouTube trending songs based on region choice
  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    (async () => {
      try {
        const raw = await ytmusic.trending(chartRegion);
        if (cancelled) return;
        const cleaned = raw.filter(isCleanSong).slice(0, 30);
        setChartTracks(cleaned);
      } catch (err) {
        console.error('Error fetching trending tracks', err);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [chartRegion]);

  useEffect(() => {
    // A listener with a taste profile gets mixes from their own artists instead
    // of the hour's generic searches.
    if (hasTaste) { setDaylist([]); return; }
    let cancelled = false;
    // Kept for the moment it belongs to (this part of this day): three searches
    // cost 300 of the day's YouTube allowance, which every listener shares.
    const DAYLIST_KEY = 'sahrae.music.daylist.v1';
    const stamp = `${moment.title}|${new Date().toDateString()}`;
    try {
      const saved = JSON.parse(localStorage.getItem(DAYLIST_KEY) || 'null') as { stamp: string; tracks: Track[] } | null;
      if (saved?.stamp === stamp && saved.tracks?.length >= 6) { setDaylist(saved.tracks); return; }
    } catch { /* nothing kept */ }
    Promise.all(moment.queries.map((q) => ytmusic.search(q).catch(() => [] as Track[])))
      .then((lists) => {
        if (cancelled) return;
        // Interleaved, so the mix moves between its styles instead of playing
        // one search's results end to end; one song per title.
        const seen = new Set<string>();
        const out: Track[] = [];
        const clean = lists.map((l) => l.filter(isCleanSong));
        for (let i = 0; out.length < 30 && clean.some((l) => i < l.length); i++) {
          for (const l of clean) {
            const t = l[i];
            const key = t && `${t.title}|${t.artist}`.toLowerCase();
            if (t && !seen.has(t.id) && !seen.has(key)) { seen.add(t.id); seen.add(key); out.push(t); }
          }
        }
        setDaylist(out);
        if (out.length >= 6) { try { localStorage.setItem(DAYLIST_KEY, JSON.stringify({ stamp, tracks: out })); } catch { /* storage full */ } }
      });
    return () => { cancelled = true; };
  }, [moment.queries, hasTaste]);

  // Fetch in-place tracks for active mood filter chip
  useEffect(() => {
    if (activeMood === 'All') {
      setMoodTracks([]);
      return;
    }
    let cancelled = false;
    setMoodLoading(true);
    setMoodTracks([]);
    (async () => {
      try {
        const moodQueries: Record<string, string> = {
          'Energize': `best energy upbeat pop songs ${YEAR}`,
          'Relax': 'lofi chill relax acoustic instrumental indie',
          'Focus': 'deep focus study brain music ambient lofi',
          'Workout': 'gym motivation workout pump hip hop electro dance',
          'Feel Good': `happy feel good positive hits ${YEAR}`,
        };
        const q = moodQueries[activeMood] || `${activeMood} music`;
        const raw = await ytmusic.search(q);
        if (cancelled) return;
        const cleaned = raw.filter(isCleanSong).slice(0, 24);
        setMoodTracks(cleaned);
      } catch (err) {
        console.error('Error fetching mood tracks', err);
      } finally {
        if (!cancelled) setMoodLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeMood]);

  // Home shelves (parallel, fast, simple)
  useEffect(() => {
    let cancelled = false;
    // Regional shelves ("New in Kenya") are for a listener Sauti knows nothing
    // about yet; with a taste profile they were the off-taste noise on the page.
    if (hasTaste) { setSections([]); setLoadingHome(false); return; }
    setSections([]); setLoadingHome(true);
    (async () => {
      try {
        const rm = regionMusic(chartRegion);
        const year = new Date().getFullYear();
        const shelves = [
          // Most-watched among the last month's uploads. Sorting by upload date
          // alone surfaced whatever was posted an hour ago — AI covers included.
          { title: `New in ${rm.name}`, q: `${rm.releases} ${year}`, order: 'viewCount' as const, withinDays: 30 },
          { title: 'Fresh Discoveries', q: `${rm.discover} ${year}`, order: 'relevance' as const, withinDays: 0 },
        ];
        const results = await Promise.all(
          shelves.map(async (s) => {
            try {
              // Scoped to the chart region, and shared: everyone in a region
              // asking the same question is answered from one paid search.
              const raw = await ytmusic.search(s.q, { order: s.order, region: chartRegion, withinDays: s.withinDays });
              const tracks = freshFirst(raw.filter(isCleanSong), dayKey() ^ hashStr(s.title), 30);
              return { title: s.title, tracks };
            } catch {
              return { title: s.title, tracks: [] };
            }
          })
        );
        if (cancelled) return;
        setSections(results.filter((r) => r.tracks.length > 0));
      } finally {
        if (!cancelled) setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-runs when the listener switches chart region, so "New in Kenya"
    // becomes "New in Nigeria" rather than staying on the first region loaded.
  }, [chartRegion, hasTaste]);

  // Quick picks: the listener's artists' best songs woven with their neighbours'
  // (tasteHome.ts). It was YouTube's "related" list for the last few plays,
  // which wandered off to artists the listener had never played.
  useEffect(() => { setMix(tasteHome ? tasteHome.quick.map((t) => asTrack(t)) : []); }, [tasteHome]);

  // ── "Made For You" — Spotify-grade curated playlists from your listening
  //    (On Repeat, Daily Mixes, Discover Weekly, Release Radar). DEFERRED ~3s so
  //    the first track + home shelves get priority, and globally throttled (see
  //    ytmusic pipedGet limiter) so it can never starve playback. ──
  useEffect(() => {
    let cancelled = false;
    const hasHistory = recentlyPlayed.length > 0 || likedTracks.length > 0 || tasteSeeds.length > 0;
    const timer = setTimeout(() => {
      (async () => {

        // Daily Mixes, built the way Spotify's are (services/sautiMixes.ts): the
        // listener's artists (first-run picks, then the ones they play most),
        // grouped by who is related to whom, each woven with related artists'
        // real top songs; then a mix for each genre they picked. Real releases
        // from the catalogue, matched to YouTube audio as they play: never a
        // YouTube search for a genre's name, which filled a Rumba mix with AI uploads.
        const picks = loadPicks();
        // The artists the listener plays and likes most (taste.ts), beyond the ones they picked.
        const pickKeys = new Set((picks?.artists || []).map((a) => artistKey(a.name)));
        const played = ranked.filter((w) => !pickKeys.has(w.key)).map((w) => w.name);
        const pickedArtists = (picks?.artists || []).filter((a) => !banned.has(artistKey(a.name)));
        const [daily, byGenre] = await Promise.all([
          curatedDailyMixes(pickedArtists, played).catch(() => []),
          pickedGenreMixes(picks?.genres || []).catch(() => []),
        ]);
        if (cancelled) return;
        const dailyCards = [...daily, ...byGenre].map((m) => ({ id: m.id, title: m.title, subtitle: m.subtitle, tracks: m.tracks.map((t) => asTrack(t)), cover: m.cover, tint: m.tint }));
        setMadeForYou(dailyCards);

        // Release Radar and Discover Weekly come from the listener's artists
        // (tasteHome.ts), not YouTube's genre pools and related videos.
        if (!hasHistory) return;
        // On Repeat — your recent rotation.
        if (recentlyPlayed.length >= 4 && !cancelled) {
          setMadeForYou((prev) => [...prev.filter((m) => m.id !== 'repeat'), { id: 'repeat', title: 'On Repeat', subtitle: 'The songs you keep coming back to', tracks: recentlyPlayed.slice(0, 30) }]);
        }

      })();
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasteSig, picksAt, topSig]);

  // Debounced search (songs + artists + albums): the catalogue first
  // (musicSearch.ts), YouTube only when the catalogue has nothing to say.
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setRSongs([]); setRArtists([]); setRAlbums([]); setRTopArtist(null); return; }
    setSearching(true);
    let stale = false;
    tRef.current = window.setTimeout(async () => {
      const own = new Set([...libArtists.map((a) => a.key), ...tasteSeeds.map((t) => artistKey(t.artist))]);
      const r = await searchCatalogue(q, own, artistKey).catch(() => null);
      if (stale) return;
      if (r && (r.songs.length || r.artists.length)) {
        setRSongs(r.songs.map((t) => asTrack(t)));
        setRArtists(r.artists.map((a) => ({ id: `dz:${a.id}`, name: a.name, thumbnail: a.picture })));
        setRAlbums(r.albums.map((al) => ({ id: `dz:${al.id}`, name: al.title, thumbnail: al.coverXl || al.cover, artist: al.artist })));
        setRTopArtist(r.topArtist ? { id: `dz:${r.topArtist.id}`, name: r.topArtist.name, thumbnail: r.topArtist.picture } : null);
      } else {
        const [s, a, al] = await Promise.all([ytmusic.search(q), ytmusic.searchArtists(q), ytmusic.searchAlbums(q)]);
        if (stale) return;
        setRSongs(s); setRArtists(a); setRAlbums(al); setRTopArtist(null);
      }
      setSearching(false);
    }, 400);
    return () => { stale = true; window.clearTimeout(tRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Load a mood/genre page's tracks on open — build a deep pool (≥50) from
  // several queries, then shuffle deterministically by today's date so the page
  // is fresh each day but stable within the day.
  useEffect(() => {
    if (!genre) return;
    let cancelled = false; setGenreLoading(true); setGenreTracks([]);
    (async () => {
      // Song-oriented (NOT "mix"/"playlist", which pull cheap DJ-mix compilations).
      const queries = [`best ${genre} songs ${YEAR}`, `${genre} hits ${YEAR}`, `popular ${genre} songs`, `${genre} essentials`, `top ${genre} tracks`];
      const lists = await Promise.all(queries.map((q) => ytmusic.search(q).catch(() => [] as Track[])));
      if (cancelled) return;
      const seen = new Set<string>(); const pool: Track[] = [];
      for (const l of lists) for (const t of l) if (!seen.has(t.id)) { seen.add(t.id); pool.push(t); }
      const rotated = freshFirst(pool.filter(isCleanSong), dayKey() ^ hashStr(genre), 60);
      if (!cancelled) { setGenreTracks(rotated); setGenreLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [genre]);

  const openArtist = async (a: Artist) => {
    setDetail({ kind: 'artist', id: a.id, name: a.name, thumbnail: a.thumbnail, subtitle: 'Artist' });
    setPopularAll(false);
    setDetailLoading(true); setDetailTracks([]); setDetailAlbums([]); setDetailSingles([]);
    // A catalogue artist (dz:<id>): their real top songs and releases, matched to YouTube as they play.
    // Each song and release once (no remix or Deluxe twice), albums apart from
    // singles and EPs, the most saved first (curate.ts).
    if (a.id.startsWith('dz:')) {
      const id = Number(a.id.slice(3));
      const [songs, releases] = await Promise.all([
        deezer.topTracks(id, 50).catch(() => []),
        deezer.artistAlbums({ id, name: a.name }, 100).catch(() => []),
      ]);
      const { albums, singles } = splitReleases(releases);
      const tile = (r: DzAlbum) => ({ id: `dz:${r.id}`, name: r.title, thumbnail: r.coverXl || r.cover, artist: r.artist, sub: [r.date.slice(0, 4), r.type === 'album' ? 'Album' : r.type === 'ep' ? 'EP' : 'Single'].filter(Boolean).join(' · ') });
      setDetailTracks(onePerSong(songs).map((t) => asTrack(t)));
      setDetailAlbums(albums.slice(0, 20).map(tile));
      setDetailSingles(singles.slice(0, 30).map(tile));
      setDetailLoading(false);
      return;
    }
    const name = a.name.toLowerCase();
    const byArtist = (s?: string) => { const ar = (s || '').toLowerCase(); return !!ar && (ar.includes(name) || name.includes(ar)); };
    if (/^UC[\w-]{22}$/.test(a.id)) {
      const uploads = (await ytDataApi.channelUploads(a.id, 50).catch(() => null)) || [];
      // A label channel uploads many artists: keep this artist's songs, plus
      // what the catalogue already holds for them.
      const theirs = uploads.filter((t) => byArtist(t.artist) && isSong(t));
      const seen = new Set<string>();
      const merged = [...theirs, ...catalogueSongsBy(a.name)].filter((t) => !seen.has(t.id) && seen.add(t.id));
      if (merged.length >= 3) {
        setDetailTracks(merged); setDetailAlbums([]); setDetailLoading(false);
        return;
      }
    }
    const [songs, albums] = await Promise.all([ytmusic.search(`${a.name} songs`), ytmusic.searchAlbums(a.name)]);
    // Show only THIS artist's songs/albums (fall back to all if filtering is too aggressive).
    const mineSongs = songs.filter((t) => byArtist(t.artist));
    const mineAlbums = albums.filter((al) => byArtist(al.artist));
    setDetailTracks(mineSongs.length >= 3 ? mineSongs : songs);
    setDetailAlbums(mineAlbums.length ? mineAlbums : albums);
    setDetailLoading(false);
  };
  // A Library artist is known only by name (from the songs played and liked):
  // find them in the catalogue to open their page; failing that, play their songs.
  const openArtistNamed = async (name: string, tracks: Track[]) => {
    const a = await artistNamed(name).catch(() => null);
    if (a) openArtist({ id: `dz:${a.id}`, name: a.name, thumbnail: a.picture });
    else playQueue(tracks, 0, name);
  };

  const openAlbum = async (al: Album) => {
    setDetail({ kind: 'album', id: al.id, name: al.name, thumbnail: al.thumbnail, subtitle: al.artist || 'Album' });
    setDetailLoading(true); setDetailTracks([]); setDetailAlbums([]);
    if (al.id.startsWith('dz:')) {
      const songs = await deezer.albumTracks(Number(al.id.slice(3)), { cover: al.thumbnail, coverXl: al.thumbnail }).catch(() => []);
      setDetailTracks(songs.map((t) => asTrack(t))); setDetailLoading(false);
      return;
    }
    let tracks = await ytmusic.playlistTracks(al.id);
    // YouTube-Music album IDs (OLAK5uy_…) can't be expanded by the proxies, so
    // fall back to finding the album's songs by name + artist.
    if (!tracks.length) tracks = await ytmusic.search(`${al.artist || ''} ${al.name}`.trim());
    setDetailTracks(tracks); setDetailLoading(false);
  };

  const artistTile = (a: Artist, sub = 'Artist') => (
    <button key={a.id} onClick={() => openArtist(a)} tabIndex={0} data-tv-focusable className="card-lift flex-none w-[130px] text-center focus:outline-none">
      <div className="w-[130px] h-[130px] rounded-full overflow-hidden bg-zinc-800 border border-white/10 mb-2 mx-auto">{a.thumbnail ? <img src={a.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /> : <User className="w-10 h-10 text-zinc-600 absolute inset-0 m-auto" />}</div>
      <p className="text-sm font-semibold text-white truncate">{a.name}</p><p className="text-xs text-zinc-500 truncate">{sub}</p>
    </button>
  );
  // Bare cover and two lines, like the song shelves (ArtCard). On an artist's
  // page the second line is the year and kind ("2018 · Single"), as in Spotify.
  const albumTile = (al: Album & { sub?: string }) => (
    <button key={al.id} onClick={() => openAlbum(al)} tabIndex={0} data-tv-focusable className="group flex-none w-[144px] md:w-[164px] text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
      <div className="aspect-square bg-zinc-800 relative rounded-lg overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        {al.thumbnail ? <img src={al.thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" loading="lazy" /> : <Disc3 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
      </div>
      <p className="mt-2.5 text-[13px] md:text-sm font-semibold text-white truncate">{al.name}</p>
      <p className="text-xs text-zinc-400 truncate mt-0.5">{al.sub || al.artist || 'Album'}</p>
    </button>
  );

  const isYtList = openId && openId.startsWith('yt_');
  let openList: { name: string; tracks: Track[]; id: string } | null = null;
  if (openId === 'liked') {
    openList = { name: 'Liked Songs', tracks: likedTracks, id: 'liked' };
  } else if (openId === 'yt_liked') {
    openList = { name: 'YouTube Liked Music', tracks: ytTracks, id: 'yt_liked' };
  } else if (isYtList) {
    const pId = openId!.replace('yt_', '');
    const ytPl = youtubePlaylists.find(p => p.id === pId);
    openList = ytPl ? { name: ytPl.title, tracks: ytTracks, id: openId! } : null;
  } else {
    const localPl = playlists.find((p) => p.id === openId);
    openList = localPl ? { name: localPl.name, tracks: localPl.tracks, id: localPl.id } : null;
  }

  // Featured spotlight for the Home hero — the freshest thing we have.
  // Every mix for this listener, in the order Spotify shows them: Daily Mixes,
  // Discover Weekly, Release Radar, the picked genres, On Repeat. A "Not
  // interested" artist drops out of all of them at once.
  const tasteCard = (id: string, title: string, subtitle: string, list: TasteHome['radar']) =>
    list.length >= 8 ? { id, title, subtitle, tracks: list.map((t) => asTrack(t)), cover: list[0].coverXl || list[0].cover, tint: undefined as string | undefined } : null;
  const discoverMix = tasteHome ? tasteCard('discover', 'Discover Weekly', 'Artists new to you, reached through the ones you play. New every Monday.', tasteHome.discover) : null;
  const radarMix = tasteHome ? tasteCard('radar', 'Release Radar', 'New songs from the artists you play', tasteHome.radar) : null;
  const mixes = [
    ...madeForYou.filter((m) => m.id.startsWith('daily-')),
    ...(discoverMix ? [discoverMix] : []),
    ...(radarMix ? [radarMix] : []),
    ...madeForYou.filter((m) => !m.id.startsWith('daily-')),
  ].map((m) => ({ ...m, tracks: m.tracks.filter(allowed) })).filter((m) => m.tracks.length > 0);

  // The showcase: the right-now mix, your top mix, the chart's number one, and
  // radio from the last song played. Each slide only when it has something in it.
  const slides: ShowcaseSlide[] = [];
  if (daylist.length >= 6) slides.push({
    id: 'daylist', kicker: 'Right now', title: moment.title, subtitle: moment.blurb,
    art: daylist[0].artworkLarge || daylist[0].artwork, tint: daylist[0].dominantColor,
    note: `${daylist.length} songs · changes with the time of day`,
    primary: { label: 'Play', icon: <Play className="w-4 h-4 fill-current" />, onClick: () => playQueue(daylist, 0, moment.title) },
    secondary: { label: 'Shuffle', icon: <Shuffle className="w-4 h-4" />, onClick: () => playQueue(seededShuffle(daylist, Date.now()), 0, moment.title) },
  });
  if (mixes[0]?.tracks.length) {
    const m = mixes[0];
    slides.push({
      id: `mix-${m.id}`, kicker: 'Made for you', title: m.title, subtitle: m.subtitle,
      art: m.tracks[0].artworkLarge || m.tracks[0].artwork, tint: m.tracks[0].dominantColor,
      primary: { label: 'Play', icon: <Play className="w-4 h-4 fill-current" />, onClick: () => playQueue(m.tracks, 0, m.title) },
      secondary: { label: 'Open', icon: <ListMusic className="w-4 h-4" />, onClick: () => setViewMix(m) },
    });
  }
  if (discoverMix) {
    const m = discoverMix;
    slides.push({
      id: 'discover', kicker: 'New to you · this week', title: m.title, subtitle: m.subtitle,
      art: m.tracks[0].artworkLarge || m.tracks[0].artwork, tint: m.tracks[0].dominantColor,
      note: `${m.tracks.length} songs from artists you have not played yet`,
      primary: { label: 'Play', icon: <Play className="w-4 h-4 fill-current" />, onClick: () => playQueue(m.tracks, 0, m.title) },
      secondary: { label: 'Open', icon: <ListMusic className="w-4 h-4" />, onClick: () => setViewMix(m) },
    });
  }
  // The chart's number one is for a listener Sauti knows nothing about yet.
  if (chartTracks[0] && !hasTaste) {
    const top = chartTracks[0];
    slides.push({
      id: `chart-${top.id}`, kicker: `No. 1 in ${regionMusic(chartRegion).name}`, title: top.title, subtitle: top.artist,
      art: top.artworkLarge || top.artwork, tint: top.dominantColor, note: 'From the live chart below',
      primary: { label: 'Play the chart', icon: <Play className="w-4 h-4 fill-current" />, onClick: () => playQueue(chartTracks, 0, `${chartRegion} Charts`) },
      secondary: { label: 'Start radio', icon: <RadioIcon className="w-4 h-4" />, onClick: () => startRadio(top) },
    });
  }
  if (recentlyPlayed[0]) {
    const last = recentlyPlayed[0];
    slides.push({
      id: `radio-${last.id}`, kicker: 'Keep it going', title: `${last.artist} radio`, subtitle: `Songs like ${last.title}, picked to follow on from it.`,
      art: last.artworkLarge || last.artwork, tint: last.dominantColor,
      primary: { label: 'Start radio', icon: <RadioIcon className="w-4 h-4" />, onClick: () => startRadio(last) },
      secondary: { label: 'Play the song', icon: <Play className="w-4 h-4 fill-current" />, onClick: () => playQueue([last], 0, 'Recently played') },
    });
  }

  // "Your sound lately": the artists you keep coming back to, from what you
  // played and liked on this device.
  const leadArtist = (a: string) => (a || '').split(/,|&|\sfeat\.?\s|\sft\.?\s|\sx\s/i)[0].trim();
  // The artists picked at first run count from day one; plays and likes take over as they come.
  const soundPool = [...recentlyPlayed, ...likedTracks, ...tasteSeeds].filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
  const soundLately = (() => {
    const by = new Map<string, { name: string; tracks: Track[] }>();
    for (const t of soundPool) {
      const name = leadArtist(t.artist);
      if (!name) continue;
      const k = name.toLowerCase();
      const c = by.get(k) || { name, tracks: [] };
      c.tracks.push(t);
      by.set(k, c);
    }
    return [...by.values()].filter((c) => c.tracks.length >= 2).sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 6);
  })();


  // "Quick picks" (YouTube-Music-style 4-row tap-to-play grid): personalised mix
  // if we have one, else the freshest catalog shelf, deduped.
  const quickSource = mix.length ? mix : (sections.find((s) => s.tracks.length)?.tracks ?? []);
  const quickPicks = quickSource.filter(allowed).slice(0, 20);

  // ── Detail page (artist / album) ──
  const sortTracks = (list: Track[]): Track[] => {
    if (trackSort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (trackSort === 'artist') return [...list].sort((a, b) => a.artist.localeCompare(b.artist));
    if (trackSort === 'duration') return [...list].sort((a, b) => (a.duration || 0) - (b.duration || 0));
    return list;
  };
  const sortSelect = (
    <select value={trackSort} onChange={(e) => setTrackSort(e.target.value as typeof trackSort)}
      className="bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/60 shrink-0">
      <option value="default">Sort: Default</option>
      <option value="title">Title</option>
      <option value="artist">Artist</option>
      <option value="duration">Duration</option>
    </select>
  );


  // An artist or mix opened FROM a genre page shows over it; Back returns to it.
  if (catGenre && !detail && !viewMix) {
    const g = genreById(catGenre);
    const list = catPage ? (catTab === 'new' ? catPage.fresh : catPage.popular) : [];
    const title = g?.name || 'Genre';
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+6.25rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative isolate">
        <div aria-hidden className="absolute inset-x-0 top-0 h-80 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${g?.tint || '#555'} 0%, transparent 100%)`, opacity: 0.45 }} />
        <button onClick={() => setCatGenre(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <CollectionHero kicker="Genre" title={title} tracks={catPage?.popular || []}
          meta={catPage ? `${catPage.total} songs · ${catPage.artists.length} artists` : ''}>
          {catPage && catPage.popular.length > 0 && (
            <>
              <button onClick={() => playQueue(catPage.popular, 0, title)} data-tv-focusable className="lux-btn px-7 py-3 text-sm md:text-base"><Play className="w-4 h-4 fill-current" /> Play</button>
              <button onClick={() => playShuffled(catPage.popular, title)} data-tv-focusable aria-label="Shuffle" className="btn-glass w-12 h-12 rounded-full flex items-center justify-center"><Shuffle className="w-5 h-5" /></button>
            </>
          )}
        </CollectionHero>
        <div className="flex gap-2 mb-6" role="tablist">
          {([['popular', 'Popular'], ['new', 'New releases'], ['artists', 'Artists']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={catTab === k} onClick={() => setCatTab(k)} tabIndex={0} data-tv-focusable
              aria-pressed={catTab === k} className="lux-chip">{label}</button>
          ))}
        </div>
        {!catPage ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Loading {title}…</div>
        ) : catTab === 'artists' ? (
          catPage.artists.length === 0
            ? <EmptyState compact illustration="search" title="No artists yet" message="This genre's catalogue could not be loaded. Check your connection and try again." />
            : <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4">{catPage.artists.map((a) => artistTile(a))}</div>
        ) : list.length === 0 ? (
          <EmptyState compact illustration="search" title={catTab === 'new' ? 'No new releases in the last four weeks' : `Nothing for ${title} right now`} message={catTab === 'new' ? 'Try Popular, or check back after Friday.' : 'This genre could not be loaded. Check your connection and try again.'} />
        ) : (
          <SongList tracks={list} onPlay={(i) => playQueue(list, i, title)} />
        )}
      </div>
    );
  }

  if (genre) {
    const shown = sortTracks(genreTracks);
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+6.25rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative isolate">
        <button onClick={() => setGenre(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <CollectionHero kicker="Mood and genre" title={genre} tracks={genreTracks}>
          {genreTracks.length > 0 && (
            <>
              <button onClick={() => playQueue(shown, 0, genre)} data-tv-focusable className="lux-btn px-7 py-3 text-sm md:text-base"><Play className="w-4 h-4 fill-current" /> Play</button>
              <button onClick={() => playShuffled(genreTracks, genre)} data-tv-focusable aria-label="Shuffle" className="btn-glass w-12 h-12 rounded-full flex items-center justify-center"><Shuffle className="w-5 h-5" /></button>
              {sortSelect}
            </>
          )}
        </CollectionHero>
        {genreLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Loading {genre}…</div>
        ) : genreTracks.length === 0 ? (
          <EmptyState compact illustration="search" title={`Nothing for ${genre} right now`} message="Try another mood or genre. These fill from YouTube and change through the day." />
        ) : (
          <SongList tracks={shown} onPlay={(i) => playQueue(shown, i, genre)} />
        )}
      </div>
    );
  }

  if (viewMix) {
    const shown = sortTracks(viewMix.tracks);
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+6.25rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative isolate">
        <button onClick={() => setViewMix(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <CollectionHero kicker="Made for you" blurb={viewMix.subtitle} title={viewMix.title} tracks={viewMix.tracks}>
          <button onClick={() => playQueue(shown, 0, viewMix.title)} data-tv-focusable className="lux-btn px-7 py-3 text-sm md:text-base"><Play className="w-4 h-4 fill-current" /> Play</button>
          <button onClick={() => playShuffled(viewMix.tracks, viewMix.title)} data-tv-focusable aria-label="Shuffle" className="btn-glass w-12 h-12 rounded-full flex items-center justify-center"><Shuffle className="w-5 h-5" /></button>
        </CollectionHero>
        <SongList tracks={shown} onPlay={(i) => playQueue(shown, i, viewMix.title)} />
      </div>
    );
  }

  if (detail) {
    const shownTracks = sortTracks(detailTracks);
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+6.25rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative isolate">
        <button onClick={() => setDetail(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <CollectionHero kicker={detail.subtitle} title={detail.name} tracks={detailTracks} image={detail.thumbnail} round={detail.kind === 'artist'}
          meta={detail.kind === 'artist' ? '' : undefined}
          icon={detail.thumbnail ? undefined : <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">{detail.kind === 'artist' ? <User className="w-16 h-16 text-zinc-500" /> : <Disc3 className="w-16 h-16 text-zinc-500" />}</div>}>
          {detailTracks.length > 0 && (
            <>
              <button onClick={() => playQueue(detailTracks, 0)} data-tv-focusable className="lux-btn px-7 py-3 text-sm md:text-base"><Play className="w-4 h-4 fill-current" /> Play</button>
              <button onClick={() => playShuffled(detailTracks)} data-tv-focusable aria-label="Shuffle" className="btn-glass w-12 h-12 rounded-full flex items-center justify-center"><Shuffle className="w-5 h-5" /></button>
            </>
          )}
        </CollectionHero>

        {detailLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Loading…</div>
        ) : (
          <>
            {detailTracks.length > 0 && (() => {
              // An artist's page leads with their ten most popular songs, then
              // their releases, as Spotify's does; all fifty in a row buried the
              // albums. The rest are one tap away. An album lists every song.
              const isArtist = detail.kind === 'artist';
              const list = isArtist && !popularAll ? shownTracks.slice(0, 10) : shownTracks;
              return (
                <section className="mb-10">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <SectionHead>{isArtist ? 'Popular' : 'Songs'}</SectionHead>
                    {!isArtist && sortSelect}
                  </div>
                  <SongList tracks={list} onPlay={(i) => playQueue(shownTracks, i)} />
                  {isArtist && shownTracks.length > 10 && (
                    <button onClick={() => setPopularAll((v) => !v)} data-tv-focusable className="lux-chip mt-3">
                      {popularAll ? 'Show less' : `See all ${shownTracks.length} songs`}
                    </button>
                  )}
                </section>
              );
            })()}
            {detail.kind === 'artist' && detailAlbums.length > 0 && (
              <section className="mb-8"><SectionHead>{detailSingles.length ? 'Albums' : 'Albums & Singles'}</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{detailAlbums.map((al) => albumTile(al))}</div></section>
            )}
            {detail.kind === 'artist' && detailSingles.length > 0 && (
              <section className="mb-8"><SectionHead>Singles & EPs</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{detailSingles.map((al) => albumTile(al))}</div></section>
            )}
            {detailTracks.length === 0 && <EmptyState compact illustration="playlist" title="Nothing here yet" message="This list has no playable songs at the moment." />}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+6.25rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative">
      {showOnboarding && <SautiOnboarding onComplete={finishOnboarding} onSkip={closeOnboarding} />}
      {/* Living aurora glow — tinted by the most recently played track (spec §1.2.4) */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-0 opacity-70"
        style={{ background: `radial-gradient(60% 70% at 12% 0%, ${recentlyPlayed[0]?.dominantColor || 'rgb(var(--acc-rgb) / 0.45)'}, transparent 70%), radial-gradient(50% 60% at 85% 8%, rgb(var(--acc2-rgb) / 0.22), transparent 72%)`, filter: 'blur(8px)', transition: 'background 700ms ease' }} />
      {/* Kept short: on a phone the old header (kicker, title, a line of
          description, then the switch) pushed the first song below the fold. */}
      <LuxHeader className="relative !mb-5 md:!mb-8 !gap-4" kicker={<><Music2 className="w-3.5 h-3.5" /> Sauti</>}
        title={tab === 'home' ? greeting() : 'Your Library'}
        right={<LuxSeg active={tab} onChange={(t) => { setTab(t); setOpenId(null); }} items={[
          { id: 'home', label: 'Home', icon: Music2 },
          { id: 'library', label: 'Library', icon: Library },
        ]} />} />

      {tab === 'home' ? (
        <>
          <Coachmark id="sauti" text="Long-press any song for Radio, Play next, Queue and Download." />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute z-10 left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, albums…" className="w-full lux-field pl-10 pr-4 py-3 text-sm" />
            </div>

            {/* YouTube Music style Mood filter pills */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {['All', 'Energize', 'Relax', 'Focus', 'Workout', 'Feel Good'].map((m) => {
                const isActive = activeMood === m;
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setActiveMood(m);
                      setGenre(null); // Close other genres
                    }}
                    aria-pressed={isActive} className="lux-chip"
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {query.trim() ? (
            searching ? (
              <div className="flex items-center gap-2 text-zinc-400 py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
            ) : (rSongs.length + rArtists.length + rAlbums.length === 0) ? (
              <EmptyState compact illustration="search" title="No matches" message="Check the spelling, or search for an artist instead of a song." />
            ) : (
              <div className="space-y-8">
                {/* Top result + Songs (Spotify-exact, spec §1.3.7) */}
                <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-5 lg:gap-7 items-start">
                  {rTopArtist ? (
                    // The search names an artist: they are the top result, as in Spotify.
                    <div>
                      <SectionHead>Top result</SectionHead>
                      <button onClick={() => openArtist(rTopArtist)} tabIndex={0} data-tv-focusable className="group relative w-full text-left rounded-2xl p-5 bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="w-24 h-24 rounded-full overflow-hidden mb-4 relative shadow-xl bg-zinc-800">
                          {rTopArtist.thumbnail ? <img src={rTopArtist.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <User className="w-10 h-10 text-zinc-500 absolute inset-0 m-auto" />}
                        </div>
                        <p className="text-2xl font-display font-bold text-white truncate">{rTopArtist.name}</p>
                        <p className="text-sm text-zinc-300 font-semibold mt-1">Artist</p>
                        <span onClick={(e) => { e.stopPropagation(); if (rSongs.length) playQueue(rSongs, 0, rTopArtist.name); }} role="button" aria-label={`Play ${rTopArtist.name}`}
                          className="btn-sauti absolute bottom-5 right-5 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"><Play className="w-5 h-5 fill-current ml-0.5" /></span>
                      </button>
                    </div>
                  ) : rSongs[0] && (
                    <div>
                      <SectionHead>Top result</SectionHead>
                      <button onClick={() => playQueue(rSongs, 0)} tabIndex={0} data-tv-focusable className="group relative w-full text-left rounded-2xl p-5 bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="w-24 h-24 rounded-xl overflow-hidden mb-4 relative shadow-xl"><CoverArt imageUrl={rSongs[0].artworkLarge || rSongs[0].artwork} fallbackUrl={rSongs[0].artwork} dominantColor={rSongs[0].dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                        <p className="text-2xl font-display font-bold text-white truncate">{rSongs[0].title}</p>
                        <p className="text-sm text-zinc-400 mt-1 truncate">{rSongs[0].artist} · <span className="text-zinc-300 font-semibold">Song</span></p>
                        <span className="btn-sauti absolute bottom-5 right-5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all w-12 h-12 rounded-full flex items-center justify-center shadow-lg"><Play className="w-5 h-5 fill-current ml-0.5" /></span>
                      </button>
                    </div>
                  )}
                  {rSongs.length > 0 && (
                    <div>
                      <SectionHead>Songs</SectionHead>
                      <div>{rSongs.slice(0, 5).map((t, i) => <Fragment key={t.id}><TrackRow track={t} list onPlay={() => playQueue(rSongs, i)} /></Fragment>)}</div>
                    </div>
                  )}
                </div>
                {rArtists.length > 0 && (
                  <section><SectionHead>Artists</SectionHead><div className="flex overflow-x-auto gap-5 pt-1 pb-3 scrollbar-hide">{rArtists.map((a) => artistTile(a))}</div></section>
                )}
                {rAlbums.length > 0 && (
                  <section><SectionHead>Albums</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-3 scrollbar-hide">{rAlbums.map(albumTile)}</div></section>
                )}
              </div>
            )
          ) : activeMood !== 'All' ? (
            <div className="space-y-6 mt-4">
              <div className="flex items-center justify-between">
                <SectionHead>{activeMood}</SectionHead>
                {moodTracks.length > 0 && (
                  <button onClick={() => playQueue(moodTracks, 0, activeMood)} className="btn-sauti px-5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 fill-current" /> Play All
                  </button>
                )}
              </div>

              {moodLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                  <span>Curating {activeMood} vibes…</span>
                </div>
              ) : moodTracks.length === 0 ? (
                <p className="text-zinc-500 text-center py-10">Vibes are refreshing. Try again shortly.</p>
              ) : (
                <SongList tracks={moodTracks} onPlay={(i) => playQueue(moodTracks, i, activeMood)} />
              )}
            </div>
          ) : (
            <>
              {/* ── Quick access ───────────────────────────────────────────
                  Spotify's home opens with a two-column grid of short tiles: the
                  shortest path back to what you were already playing, above
                  everything else. Liked Songs first, then recent songs and your
                  mixes woven together, eight in all, each song once. */}
              {(() => {
                const recent = uniqueSongs(recentlyPlayed).slice(0, 6);
                const tiles: ReactNode[] = [];
                let r = 0, m = 0;
                while (tiles.length < 7 && (r < recent.length || m < Math.min(mixes.length, 3))) {
                  if (r < recent.length) {
                    const t = recent[r++];
                    tiles.push(<QuickTile key={t.id} title={t.title} artwork={t.artwork} dominantColor={t.dominantColor}
                      onClick={() => playQueue(recent, recent.indexOf(t), 'Recently played')} />);
                  }
                  if (tiles.length < 7 && m < Math.min(mixes.length, 3) && (tiles.length % 3 === 2 || r >= recent.length)) {
                    const mx = mixes[m++];
                    tiles.push(<QuickTile key={mx.id} title={mx.title} artwork={mx.cover || mx.tracks[0]?.artwork} dominantColor={mx.tracks[0]?.dominantColor}
                      onClick={() => setViewMix(mx)} />);
                  }
                }
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-8">
                    <QuickTile
                      title="Liked Songs"
                      icon={<span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-300 via-amber-500 to-orange-700"><Heart className="w-6 h-6 text-[#fff] fill-current drop-shadow" /></span>}
                      onClick={() => setOpenId('liked')}
                    />
                    {tiles}
                  </div>
                );
              })()}

              <AudioShowcase slides={slides} label="Featured in Sauti" />

              {/* ── Your sound lately ─────────────────────────────────────────
                  A small, always-current "wrapped": the artists this listener
                  keeps returning to. Each plays their songs from your own
                  history; the button plays them all, most-played artist first. */}
              {soundLately.length >= 2 && (
                <section className="lux-card p-5 md:p-6 mb-9">
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                    <div>
                      <p className="lux-kicker mb-1.5"><Sunrise className="w-3.5 h-3.5" />Your sound lately</p>
                      <h3 className="text-xl md:text-2xl font-display font-bold text-white">The artists you keep coming back to</h3>
                    </div>
                    <button onClick={() => playQueue(soundLately.flatMap((a) => a.tracks), 0, 'Your sound lately')} data-tv-focusable className="lux-btn px-5 py-2.5 text-sm">
                      <Play className="w-4 h-4 fill-current" /> Play them all
                    </button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
                    {soundLately.map((a, i) => (
                      <button key={a.name} onClick={() => playQueue(a.tracks, 0, a.name)} data-tv-focusable aria-label={`Play ${a.name}`}
                        className="group shrink-0 w-[104px] text-center focus:outline-none">
                        <span className="relative block w-[88px] h-[88px] mx-auto rounded-full overflow-hidden ring-2 ring-white/10 group-hover:ring-amber-400/70 group-focus-visible:ring-amber-400 transition-shadow">
                          <CoverArt imageUrl={a.tracks[0].artwork} dominantColor={a.tracks[0].dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                          <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-[11px] font-extrabold text-amber-300 flex items-center justify-center tabular">{i + 1}</span>
                        </span>
                        <span className="block mt-2 text-xs font-bold text-white truncate">{a.name}</span>
                        <span className="block text-[11px] text-zinc-500 tabular">{a.tracks.length} songs</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Quick picks — YouTube-Music's signature 4-row tap-to-play grid ── */}
              {quickPicks.length > 0 && (
                <section className="mb-9">
                  <SectionHead>Quick picks</SectionHead>
                  <div className="overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
                    <div className="grid grid-rows-4 grid-flow-col auto-cols-[86%] sm:auto-cols-[minmax(320px,360px)] gap-x-5 gap-y-0.5">
                      {quickPicks.map((t, i) => <Fragment key={t.id}><QuickRow track={t} onPlay={() => playQueue(quickPicks, i, 'Quick picks')} /></Fragment>)}
                    </div>
                  </div>
                </section>
              )}

              {mixes.length > 0 && (
                <section className="mb-9">
                  <SectionHead>Mixed for you</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {mixes.map((m) => (
                      <Fragment key={m.id}>
                        <MixCard title={m.title} subtitle={m.subtitle} tracks={m.tracks} cover={m.cover} tint={m.tint}
                          onOpen={() => setViewMix(m)} onPlay={() => playQueue(m.tracks, 0, m.title)} />
                      </Fragment>
                    ))}
                  </div>
                </section>
              )}

              {/* ── More like <artist>: the listener's two strongest artists, as radio ── */}
              {tasteHome?.moreLike.map(({ artist, tracks: raw }) => {
                const list = raw.map((t) => asTrack(t)).filter(allowed);
                if (list.length < 8) return null;
                const title = `More like ${artist.name}`;
                return (
                  <section key={artist.id} className="mb-9">
                    <div className="flex items-center gap-3 mb-3">
                      <button onClick={() => openArtist({ id: `dz:${artist.id}`, name: artist.name, thumbnail: artist.picture })} data-tv-focusable aria-label={artist.name}
                        className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 shrink-0 ring-1 ring-white/10">
                        {artist.picture ? <img src={artist.picture} alt="" className="w-full h-full object-cover" loading="lazy" /> : <User className="w-5 h-5 text-zinc-500 m-auto" />}
                      </button>
                      <div className="min-w-0">
                        <p className="lux-kicker">Because you play {artist.name}</p>
                        <h3 className="text-xl md:text-2xl font-display font-bold text-white tracking-tight truncate">{title}</h3>
                      </div>
                    </div>
                    <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{list.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(list, i, title)} /></Fragment>)}</div>
                  </section>
                );
              })}

              {/* ── New releases from the listener's artists (the catalogue's dates, newest first) ── */}
              {tasteHome && tasteHome.releases.filter(allowed).length > 0 && (
                <section className="mb-9">
                  <SectionHead>New releases for you</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {tasteHome.releases.filter(allowed).map((r) => (
                      <button key={r.id} onClick={() => openAlbum({ id: `dz:${r.id}`, name: r.title, thumbnail: r.coverXl || r.cover, artist: r.artist })} tabIndex={0} data-tv-focusable
                        className="card-lift flex-none w-[150px] md:w-[170px] text-left focus:outline-none">
                        <div className="aspect-square rounded-2xl overflow-hidden bg-zinc-800 relative ring-1 ring-white/10">
                          {r.cover ? <img src={r.coverXl || r.cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Disc3 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur text-[9px] font-bold uppercase tracking-wider text-[#fff]">{r.type === 'single' ? 'Single' : r.type === 'ep' ? 'EP' : 'Album'}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-white truncate">{r.title}</p>
                        <p className="text-xs text-zinc-500 truncate">{r.artist} · {releasedAgo(r.date)}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {tasteHome && tasteHome.mightLike.length > 0 ? (
                <section className="mb-9">
                  <SectionHead>Artists you might like</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {tasteHome.mightLike.slice(0, 16).map(({ artist, because }) => artistTile({ id: `dz:${artist.id}`, name: artist.name, thumbnail: artist.picture }, `Like ${because.slice(0, 2).join(' & ')}`))}
                  </div>
                </section>
              ) : !hasTaste && artistsForYou.length > 0 && (
                <section className="mb-9">
                  <SectionHead>Artists for you</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{artistsForYou.map((a) => artistTile(a))}</div>
                </section>
              )}

              {/* Eight genres, the rest a tap away: all of them made the home page
                  a long wall of coloured blocks. Each tile carries a record tilted
                  out of its corner (Sauti's vinyl motif), the way Spotify tilts a
                  cover out of its browse tiles. */}
              <section className="mb-9">
                <SectionHead>Browse genres</SectionHead>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 md:gap-3">
                  {(allGenres ? CATALOG_GENRES : CATALOG_GENRES.slice(0, 8)).map((g) => (
                    <button key={g.id} onClick={() => setCatGenre(g.id)} tabIndex={0} data-tv-focusable
                      className="card-lift relative h-[92px] md:h-28 rounded-lg overflow-hidden text-left p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      style={{ background: `linear-gradient(135deg, ${g.tint} 0%, ${g.tint}B3 100%)` }}>
                      <span aria-hidden className="absolute -right-5 -bottom-6 w-[78px] h-[78px] md:w-24 md:h-24 rounded-full rotate-[25deg] shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
                        style={{ background: `radial-gradient(circle, ${g.tint} 0 17%, #111 18% 21%, transparent 22%), repeating-radial-gradient(circle, #161616 0 2px, #222 2px 4px)` }} />
                      <span className="relative block max-w-[78%] font-display font-bold text-[15px] md:text-lg leading-tight" style={{ color: '#fff' }}>{g.name}</span>
                    </button>
                  ))}
                </div>
                {CATALOG_GENRES.length > 8 && (
                  <button onClick={() => setAllGenres((v) => !v)} data-tv-focusable className="lux-chip mt-4">
                    {allGenres ? 'Show fewer' : `All ${CATALOG_GENRES.length} genres`}
                  </button>
                )}
              </section>

              {/* ── Beyond your taste: what everyone else is playing. Charts are
                  not recommendations, so they sit below everything picked for
                  the listener, and say what they are. ── */}
              {hasTaste && (
                <div className="mt-4 mb-5 pt-6 border-t border-white/10">
                  <p className="lux-kicker mb-1">Beyond your taste</p>
                  <h3 className="text-xl md:text-2xl font-display font-bold text-white">What everyone in {regionMusic(chartRegion).name} is playing</h3>
                </div>
              )}
              {/* ── Music videos — the region's most-watched music on YouTube,
                  as videos. Built from the chart already fetched for Live
                  Trending Charts below, so it costs no extra quota at all.
                  Tapping one opens Now Playing straight into Video. ── */}
              {chartTracks.length > 0 && (() => {
                const videos = chartTracks.filter((t) => t.duration >= 90).slice(0, 16);
                if (videos.length < 4) return null;
                const source = `Music videos · ${regionMusic(chartRegion).name}`;
                return (
                  <section className="mb-9">
                    <SectionHead>
                      Music videos
                      <span className="ml-2 text-sm font-normal text-zinc-400">Trending in {regionMusic(chartRegion).name}</span>
                    </SectionHead>
                    <div className="overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
                      <div className="flex gap-4">
                        {videos.map((t, i) => (
                          <div key={t.id} className="w-[240px] sm:w-[280px] shrink-0">
                            <VideoCard
                              track={t}
                              activeId={videoPreviewId}
                              onHoverStart={setVideoPreviewId}
                              onHoverEnd={(id) => setVideoPreviewId((cur) => (cur === id ? null : cur))}
                              onPlay={() => {
                                setVideoPreviewId(null);
                                playQueue(videos, i, source);
                                setVideoMode(true);
                                setExpanded(true);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* ── YouTube Music Real-Time Trending Charts Section ── */}
              <section className="mb-10 lux-card p-5 md:p-7" style={{ transform: 'none' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <SectionHead icon={<span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}>
                    Live Trending Charts
                  </SectionHead>

                  {/* Region Tabs */}
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    {[
                      { code: 'US', label: 'US 🇺🇸' },
                      { code: 'GB', label: 'UK 🇬🇧' },
                      { code: 'KE', label: 'Kenya 🇰🇪' },
                      { code: 'NG', label: 'Nigeria 🇳🇬' },
                      { code: 'ZA', label: 'SA 🇿🇦' }
                    ].map((r) => (
                      <button
                        key={r.code}
                        onClick={() => setChartRegion(r.code)}
                        aria-pressed={chartRegion === r.code} data-tv-focusable className="lux-chip"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {chartLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    <span className="text-sm font-semibold">Retrieving official charts…</span>
                  </div>
                ) : chartTracks.length === 0 ? (
                  <p className="text-zinc-500 py-10 text-center">Charts are updating. Try again shortly.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {chartTracks.slice(0, 9).map((t, i) => {
                      const playing = current?.id === t.id && isPlaying;
                      // The whole row plays: the round button only shows on hover,
                      // so on a phone a chart row used to do nothing when tapped.
                      return (
                        <div key={t.id} role="button" tabIndex={0} data-tv-focusable aria-label={`Play ${t.title}`}
                          onClick={() => playQueue(chartTracks, i, `${chartRegion} Charts`)}
                          onKeyDown={(e) => { if (e.key === 'Enter') playQueue(chartTracks, i, `${chartRegion} Charts`); }}
                          className="relative group/chart flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-all cursor-pointer">
                          <span className="w-5 text-center font-display font-black text-sm text-zinc-500 group-hover/chart:text-sauti tabular">
                            {playing ? <Equalizer /> : i + 1}
                          </span>
                          <CoverArt imageUrl={t.artwork} dominantColor={t.dominantColor} className="w-12 h-12 rounded-lg shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold truncate ${current?.id === t.id ? 'text-sauti' : 'text-white'}`}>{t.title}</p>
                            <p className="text-xs text-zinc-400 truncate">{t.artist}</p>
                          </div>
                          <span aria-hidden className="btn-sauti w-8 h-8 rounded-full hidden sm:flex items-center justify-center opacity-0 group-hover/chart:opacity-100 transition-opacity shrink-0">
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {(() => {
                const again = uniqueSongs(recentlyPlayed).slice(0, 20);
                return again.length >= 6 && (
                  <section className="mb-10">
                    <SectionHead>Listen again</SectionHead>
                    <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{again.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(again, i, 'Listen again')} /></Fragment>)}</div>
                  </section>
                );
              })()}

              {sections.map((sec) => (
                <section key={sec.title} className="mb-10">
                  <SectionHead>{sec.title}</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{sec.tracks.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(sec.tracks, i, sec.title)} /></Fragment>)}</div>
                </section>
              ))}
              {loadingHome && sections.length === 0 && <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading Sauti…</span></div>}
              {/* Only when the page has nothing else to offer: under a full home page
                  this read as a fault with the whole of Sauti. */}
              {!loadingHome && sections.length === 0 && mixes.length === 0 && quickPicks.length === 0 && chartTracks.length === 0 && !tasteHome && (
                <p className="text-zinc-500 py-10 text-center">Couldn't reach the music service right now. Try a search, or again shortly.</p>
              )}
            </>
          )}
        </>
      ) : openList ? (
        <section className="relative isolate">
          <button onClick={() => setOpenId(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-4 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Library</button>
          <CollectionHero
            kicker={openList.id === 'liked' ? 'Your library' : openList.id.startsWith('yt_') ? 'From YouTube Music' : 'Playlist'}
            title={openList.name} tracks={openList.tracks}
            icon={openList.id === 'liked' || openList.id === 'yt_liked'
              ? <div className={`absolute inset-0 bg-gradient-to-br ${openList.id === 'liked' ? 'from-amber-400 via-orange-500 to-rose-600' : 'from-red-600 via-rose-500 to-amber-500'} flex items-center justify-center`}><Heart className="w-20 h-20 text-[#fff] fill-current drop-shadow-lg" /></div>
              : undefined}>
            <button disabled={!openList.tracks.length || ytTracksLoading} onClick={() => playQueue(openList.tracks, 0)} data-tv-focusable className="lux-btn px-7 py-3 text-sm md:text-base disabled:opacity-40"><Play className="w-4 h-4 fill-current" /> Play</button>
            <button disabled={!openList.tracks.length || ytTracksLoading} onClick={() => playShuffled(openList.tracks)} data-tv-focusable aria-label="Shuffle" className="btn-glass w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-40"><Shuffle className="w-5 h-5" /></button>
            {openList.tracks.length > 0 && sortSelect}
            {openList.id !== 'liked' && openList.id !== 'yt_liked' && !openList.id.startsWith('yt_') && (
              <button onClick={() => { deletePlaylist(openList.id); setOpenId(null); }} aria-label="Delete playlist" className="w-12 h-12 rounded-full text-red-300 border border-red-400/30 hover:bg-red-500/15 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
            )}
          </CollectionHero>
          {ytTracksLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              <span className="text-sm font-bold">Syncing tracks from YouTube…</span>
            </div>
          ) : openList.tracks.length === 0 ? (
            <EmptyState compact illustration="music" title="No songs yet" message="Like songs on YouTube Music, or connect your account, and they appear here." />
          ) : (
            <>
              <SongList tracks={sortTracks(openList.tracks)} onPlay={(i) => playQueue(sortTracks(openList.tracks), i)}
                onRemove={(!openList.id.startsWith('yt_') && openList.id !== 'liked' && openList.id !== 'yt_liked') ? (t) => removeFromPlaylist(openList.id, t.id) : undefined} />
            </>
          )}
        </section>
      ) : (
        <>
          {/* Catalog connector status.
              Everything in Sauti — charts, shelves, search, radio — is served by
              the official YouTube Data API. When that is unreachable the app
              still works off the old proxy network, but quietly degraded, and a
              silent degrade is exactly what made Music feel broken before. So
              the state is shown rather than hidden. */}
          {/* Only when it matters: the passing 'unknown' state while the first
              request is out read as a fault at the top of the Library. */}
          {catalogState !== 'ok' && catalogState !== 'unknown' && (
            <div className={`p-4 rounded-3xl border mb-6 flex flex-col sm:flex-row sm:items-center gap-3 ${
              catalogState === 'disabled' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-900/40 border-white/10'
            }`}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Youtube className={`w-5 h-5 shrink-0 mt-0.5 ${catalogState === 'disabled' ? 'text-amber-400' : 'text-zinc-500'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">
                    {catalogState === 'disabled' ? 'YouTube Music catalog is switched off' : 'Running on the backup catalog'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {catalogState === 'disabled'
                      ? 'Enable YouTube Data API v3 on this app’s Google project and charts, search and radio all come straight from YouTube.'
                      : catalogState === 'quota'
                        ? 'Today’s YouTube search allowance is used up. Browsing still works; search resets at midnight Pacific.'
                        : 'YouTube is not answering Sahrae right now, so songs come from the backup catalog. Everything still plays.'}
                  </p>
                </div>
              </div>
              {catalogState === 'disabled' && (
                <a href={ENABLE_URL} target="_blank" rel="noreferrer"
                  className="btn-sauti px-4 py-2 rounded-full text-xs font-black shrink-0 text-center">
                  Enable it
                </a>
              )}
            </div>
          )}

          {/* ── Your Library, laid out the way Spotify and Apple Music do it: what
              you can do (new, import, tune) as small buttons, a filter, then ONE
              list: Liked Songs, your playlists, YouTube's, and the artists you
              play. Connecting and importing from YouTube moved to the foot of the
              page; two large panels used to stand above everything you own. ── */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-4">
            <button onClick={() => setCreating(true)} data-tv-focusable className="lux-chip flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" /> New playlist</button>
            <button onClick={() => document.getElementById('sauti-import')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-tv-focusable className="lux-chip flex items-center gap-1.5 shrink-0"><LinkIcon className="w-4 h-4" /> Import</button>
            <button onClick={() => setRedoTaste(true)} data-tv-focusable className="lux-chip flex items-center gap-1.5 shrink-0"><Sparkles className="w-4 h-4" /> Tune your taste</button>
          </div>
          {creating && (
            <div className="flex items-center gap-2 p-2 mb-4 rounded-2xl bg-zinc-900/60 border border-white/10">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} placeholder="Playlist name" aria-label="Playlist name" className="flex-1 min-w-0 bg-transparent px-2 text-sm text-white focus:outline-none" />
              <button onClick={() => { if (newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} className="btn-sauti px-4 py-2 rounded-full text-xs font-bold shrink-0">Create</button>
              <button onClick={() => { setCreating(false); setNewName(''); }} aria-label="Cancel" className="p-2 rounded-full text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}
          <div className="flex gap-2 mb-3" role="group" aria-label="Show">
            {(['all', 'playlists', 'artists'] as const).map((f) => (
              <button key={f} onClick={() => setLibFilter(f)} aria-pressed={libFilter === f} data-tv-focusable className="lux-chip">
                {f === 'all' ? 'All' : f === 'playlists' ? 'Playlists' : 'Artists'}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-0.5 mb-10">
            {libFilter !== 'artists' && (
              <>
                <LibRow title="Liked Songs" subtitle={`Playlist · ${likedTracks.length} ${likedTracks.length === 1 ? 'song' : 'songs'}`} onClick={() => setOpenId('liked')}
                  art={<span className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 flex items-center justify-center"><Heart className="w-7 h-7 text-[#fff] fill-current drop-shadow" /></span>} />
                {ytReady && (
                  <LibRow title="YouTube Liked Music" subtitle="Playlist · YouTube Music" onClick={() => setOpenId('yt_liked')}
                    art={<span className="absolute inset-0 bg-gradient-to-br from-red-600 via-rose-500 to-amber-500 flex items-center justify-center"><Heart className="w-7 h-7 text-[#fff] fill-current drop-shadow" /></span>} />
                )}
                {playlists.map((p) => (
                  <LibRow key={p.id} title={p.name} subtitle={`Playlist · ${p.tracks.length} ${p.tracks.length === 1 ? 'song' : 'songs'}`}
                    onClick={() => setOpenId(p.id)} art={<ListArt name={p.name} tracks={p.tracks} />} />
                ))}
                {ytReady && youtubePlaylists.map((p) => (
                  <LibRow key={p.id} title={p.title} subtitle={`YouTube playlist · ${p.trackCount} songs`} onClick={() => setOpenId(`yt_${p.id}`)}
                    art={p.thumbnail ? <img loading="lazy" decoding="async" src={p.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <ListArt name={p.title} tracks={[]} />} />
                ))}
              </>
            )}
            {libFilter !== 'playlists' && libArtists.map((a) => (
              <LibRow key={a.key} round title={a.name} subtitle="Artist" onClick={() => { void openArtistNamed(a.name, a.tracks); }}
                art={<CoverArt imageUrl={a.tracks[0].artworkLarge || a.tracks[0].artwork} dominantColor={a.tracks[0].dominantColor} rounded="" className="absolute inset-0 w-full h-full" />} />
            ))}
            {libFilter === 'playlists' && playlists.length === 0 && (
              <p className="text-sm text-zinc-500 px-1.5 py-3">No playlists of your own yet. Press New playlist, or + on any song.</p>
            )}
            {libFilter === 'artists' && libArtists.length === 0 && (
              <p className="text-sm text-zinc-500 px-1.5 py-3">The artists you play and like will appear here.</p>
            )}
          </div>

          {libFilter === 'all' && (() => {
            const again = uniqueSongs(recentlyPlayed);
            return again.length > 0 && (
              <section className="mb-10">
                <SectionHead>Recently played</SectionHead>
                <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{again.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(again, i)} /></Fragment>)}</div>
              </section>
            );
          })()}

          {/* YouTube Music Playlists Section */}
          {isYoutubeConnected && (youtubeLoading || youtubeError) && (
            <section className="mb-10">
              <SectionHead>Your YouTube Music playlists</SectionHead>
              {youtubeLoading ? (
                <div className="flex items-center gap-3 text-zinc-400 py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span className="text-sm font-semibold">Syncing your YouTube playlists…</span>
                </div>
              ) : youtubeError ? (
                (() => {
                  const isApiDisabledError = youtubeError.includes('YouTube Data API v3') || youtubeError.includes('disabled') || youtubeError.includes('971530348054');
                  if (isApiDisabledError) {
                    return (
                      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-zinc-300 flex flex-col gap-3">
                        <div className="flex items-start gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0 animate-pulse" />
                          <div>
                            <h4 className="font-bold text-amber-400 text-sm mb-1">YouTube Data API Needs to be Enabled</h4>
                            <p className="text-xs text-zinc-300 leading-relaxed">
                              To view your YouTube playlists, you must enable the YouTube Data API v3 in your Google Cloud Console for project <code className="bg-black/30 px-1 py-0.5 rounded text-[11px] text-amber-300 font-mono">971530348054</code>.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 pl-4.5">
                          <a
                            href="https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=971530348054"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            Enable YouTube API in Cloud Console
                          </a>
                          <button
                            onClick={loadYoutubeData}
                            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            I Enabled It, Retry
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center justify-between">
                      <span>{youtubeError}</span>
                      <button onClick={loadYoutubeData} className="px-3 py-1 bg-red-600/20 rounded-lg hover:bg-red-600/30 font-bold">Retry</button>
                    </div>
                  );
                })()
              ) : (
                null
              )}
            </section>
          )}

          <section id="sauti-import" className="mt-2 pt-8 border-t border-white/10 scroll-mt-28">
            <SectionHead>Bring your music from YouTube</SectionHead>
            {/* YouTube Music Connection Banner */}
            {!isYoutubeConnected ? (
              <div className="p-5 rounded-3xl bg-gradient-to-br from-red-600/10 via-red-500/5 to-transparent border border-red-500/15 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/20 text-white shrink-0">
                    <Youtube className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-white">Sync YouTube Music</h3>
                    <p className="text-xs text-zinc-400">Import your real playlists and liked songs from your YouTube account instantly.</p>
                  </div>
                </div>
                <button onClick={handleConnectYoutube} className="btn-sauti bg-red-600 hover:bg-red-500 text-white border-none shadow-[0_0_15px_rgba(220,38,38,0.25)] px-6 py-2.5 rounded-full text-xs font-black shrink-0">
                  Connect Account
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/5 mb-8 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {youtubeProfile?.picture ? (
                    <img loading="lazy" decoding="async" src={youtubeProfile.picture} alt="" className="w-10 h-10 rounded-full border border-white/10" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
                      {youtubeProfile?.name?.charAt(0) || 'Y'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-red-400 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Synced with YouTube
                      </span>
                    </div>
                    <p className="text-sm font-bold text-white">{youtubeProfile?.name || 'YouTube Listener'}</p>
                  </div>
                </div>
                <button onClick={handleDisconnectYoutube} className="text-xs text-zinc-400 hover:text-red-400 px-4 py-2 rounded-full border border-white/5 hover:border-red-500/20 transition-all">
                  Disconnect
                </button>
              </div>
            )}

            {/* Import a playlist by link.
                Signing in covers your own library, but a YouTube Music playlist is
                usually SHARED as a link — and that path needs no account, no
                consent screen and no permissions. Kept visible whether or not the
                account is connected, since the two do different jobs. */}
            <div className="p-4 rounded-3xl bg-zinc-900/40 border border-white/10 mb-8">
              <div className="flex items-center gap-2 mb-2">
                <LinkIcon className="w-4 h-4 text-sauti shrink-0" />
                <h3 className="font-display font-bold text-sm text-white">Import a YouTube Music playlist</h3>
              </div>
              <p className="text-xs text-zinc-400 mb-3">
                Paste a playlist link and it lands in your library with the same order and artwork. The playlist has to be Public or Unlisted for Sahrae to read it.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={importUrl}
                  onChange={(e) => { setImportUrl(e.target.value); setImportMsg(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleImportPlaylist(); }}
                  placeholder="https://music.youtube.com/playlist?list=..."
                  aria-label="YouTube Music playlist link"
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-sauti/60"
                />
                <button
                  onClick={handleImportPlaylist}
                  disabled={importing || !importUrl.trim()}
                  className="btn-sauti px-5 py-2.5 rounded-full text-xs font-black shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : 'Import'}
                </button>
              </div>
              {importMsg && (
                <p className={`text-xs mt-2.5 ${importMsg.ok ? 'text-emerald-400' : 'text-red-400'}`} role="status">{importMsg.text}</p>
              )}
            </div>

          </section>
        </>
      )}
    </div>
  );
}
