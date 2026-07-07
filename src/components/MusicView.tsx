import { useState, useEffect, useRef, Fragment, ReactNode, type MouseEvent as RMouseEvent } from 'react';
import { Search, Play, Pause, Heart, Loader2, Music2, Plus, X, ListMusic, Shuffle, Trash2, ChevronLeft, Library, Sparkles, Disc3, User } from 'lucide-react';
import { ytmusic, Track, Artist, Album, GENRES, SECTIONS } from '../services/ytmusic';
import { buildMix, diverseSample } from '../services/recommend';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import SautiOnboarding from './SautiOnboarding';
import ListenTabs from './ListenTabs';
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
  if (t.duration && t.duration > 600) return false; // >10 min → almost always a mix/compilation
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
  { name: 'Gospel', grad: 'from-amber-400 to-yellow-600', tint: 'rgba(245,158,11,0.5)' },
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

function TrackRow({ track, onPlay, onRemove }: { track: Track; onPlay: () => void; onRemove?: () => void }) {
  const { current, isPlaying, toggle, toggleLike, isLiked, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  const { handlers, consumed } = useLongPress(() => openAddSheet(track));
  return (
    <div tabIndex={0} data-tv-focusable role="button" {...handlers} onClick={() => { if (consumed()) return; active ? toggle() : onPlay(); }}
      className="card-lift group flex items-center gap-3 p-2 pr-2 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none">
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
      {active && isPlaying && <Equalizer />}
      <button onClick={(e) => { e.stopPropagation(); toggleLike(track); }} className={`p-2 rounded-full ${isLiked(track.id) ? 'text-sauti' : 'text-zinc-500 hover:text-white'}`} aria-label="Like"><Heart className={`w-4 h-4 ${isLiked(track.id) ? 'fill-current' : ''}`} /></button>
      {onRemove ? (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-2 rounded-full text-zinc-500 hover:text-red-400" aria-label="Remove"><X className="w-4 h-4" /></button>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-500 hover:text-white" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
      )}
    </div>
  );
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const { current, isPlaying, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  const { handlers, consumed } = useLongPress(() => openAddSheet(track));
  return (
    <div tabIndex={0} data-tv-focusable role="button" {...handlers} onClick={() => { if (consumed()) return; onPlay(); }} className="card-lift group relative flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer focus:outline-none">
      <div className="aspect-square bg-zinc-800 relative">
        <CoverArt imageUrl={track.artworkLarge || track.artwork} fallbackUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
        {!track.artwork && <Music2 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}
        <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="absolute top-2 left-2 z-10 w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Add"><Plus className="w-4 h-4" /></button>
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity flex items-end justify-end p-2 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <span className="btn-sauti w-9 h-9 rounded-full flex items-center justify-center">{active && isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}</span>
        </div>
      </div>
      <div className="p-2.5"><p className={`text-sm font-semibold truncate ${active ? 'text-sauti' : 'text-white'}`}>{track.title}</p><p className="text-xs text-zinc-500 truncate">{track.artist}</p></div>
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
      <button onClick={(e) => { e.stopPropagation(); openAddSheet(track); }} className="p-2 rounded-full text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100 shrink-0" aria-label="Add to playlist"><Plus className="w-4 h-4" /></button>
    </div>
  );
}

const SectionHead = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    {icon ?? <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-500" />}
    <h3 className="text-xl font-display font-bold text-white tracking-tight">{children}</h3>
  </div>
);

type Detail = { kind: 'artist' | 'album'; id: string; name: string; thumbnail?: string; subtitle?: string };

// Time-of-day greeting (spec §1.2.3 / §1.2.4).
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

export default function MusicView({ onNav }: { onNav?: (tab: string) => void }) {
  const { playQueue, likedTracks, playlists, recentlyPlayed: rawRecent, tasteSeeds, onboarded, addTasteSeeds, completeOnboarding, createPlaylist, deletePlaylist, removeFromPlaylist, openAddSheet } = useMusic();
  // Sauti is music only — podcasts play through the shared engine, so strip them
  // from every recently-played-derived shelf, pill, mix, and the header gradient.
  const recentlyPlayed = rawRecent.filter((t) => !t.id.startsWith('pod:') && !t.feedUrl);

  // Cold-start onboarding: show the taste picker only to a genuinely fresh
  // listener (no plays, likes, or seeds yet). `tasteSig` is a stable dep for the
  // personalised builders below — it changes when seeds are added (first
  // onboarding OR a later "Tune your taste"), but NOT while listening, so the
  // mixes rebuild on taste changes without thrashing on every play.
  const tasteSig = tasteSeeds.length;
  const [redoTaste, setRedoTaste] = useState(false); // "Tune your taste" manually re-opens the picker
  const showOnboarding = redoTaste || (!onboarded && recentlyPlayed.length === 0 && likedTracks.length === 0 && tasteSeeds.length === 0);
  const closeOnboarding = () => { completeOnboarding(); setRedoTaste(false); };
  const seedFromArtists = async (names: string[]) => {
    try {
      const lists = await Promise.all(names.map((n) => ytmusic.search(`${n} songs`).catch(() => [] as Track[])));
      const seen = new Set<string>(); const seeds: Track[] = [];
      for (const list of lists) {
        let added = 0;
        for (const t of list) {
          if (added >= 3) break;
          if (!isCleanSong(t) || seen.has(t.id)) continue;
          seen.add(t.id); seeds.push(t); added++;
        }
      }
      if (seeds.length) addTasteSeeds(seeds);
    } finally {
      closeOnboarding();
    }
  };

  const [tab, setTab] = useState<'home' | 'library'>('home');
  const [sections, setSections] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [mix, setMix] = useState<Track[]>([]);
  const [madeForYou, setMadeForYou] = useState<{ id: string; title: string; subtitle: string; tracks: Track[] }[]>([]);
  const [viewMix, setViewMix] = useState<{ id: string; title: string; subtitle: string; tracks: Track[] } | null>(null);

  // Mood / genre page (YouTube-Music-style) — a chip opens a dedicated page.
  const [genre, setGenre] = useState<string | null>(null);
  const [genreTint, setGenreTint] = useState<string | null>(null);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const openMood = (name: string, tint?: string) => { setGenreTint(tint || null); setGenre(name); };


  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [rSongs, setRSongs] = useState<Track[]>([]);
  const [rArtists, setRArtists] = useState<Artist[]>([]);
  const [rAlbums, setRAlbums] = useState<Album[]>([]);
  const tRef = useRef<number | undefined>(undefined);

  // Detail pages (artist / album)
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTracks, setDetailTracks] = useState<Track[]>([]);
  const [detailAlbums, setDetailAlbums] = useState<Album[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [trackSort, setTrackSort] = useState<'default' | 'title' | 'artist' | 'duration'>('default');

  // Library local state
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Home shelves (progressive)
  useEffect(() => {
    let cancelled = false;
    setSections([]); setLoadingHome(true);
    (async () => {
      for (const s of SECTIONS) {
        const raw = await ytmusic.search(s.q);
        if (cancelled) return;
        const tracks = freshFirst(raw.filter(isCleanSong), dayKey() ^ hashStr(s.title), 40);
        if (tracks.length) setSections((prev) => [...prev, { title: s.title, tracks }]);
        setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Your Mix from listening (built on entry)
  useEffect(() => {
    if (recentlyPlayed.length === 0 && tasteSeeds.length === 0) return;
    let cancelled = false;
    (async () => {
      const seeds = (recentlyPlayed.length ? recentlyPlayed : tasteSeeds).slice(0, 4);
      const lists = await Promise.all(seeds.map((s) => ytmusic.related(s.id)));
      if (cancelled) return;
      const seen = new Set([...recentlyPlayed, ...tasteSeeds].map((t) => t.id));
      const agg: Track[] = [];
      for (const list of lists) for (const t of list) if (!seen.has(t.id)) { seen.add(t.id); agg.push(t); }
      for (let i = agg.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [agg[i], agg[j]] = [agg[j], agg[i]]; }
      setMix(diverseSample(agg, 30)); // no clustered artists
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasteSig]);

  // ── "Made For You" — Spotify-grade curated playlists from your listening
  //    (On Repeat, Daily Mixes, Discover Weekly, Release Radar). DEFERRED ~3s so
  //    the first track + home shelves get priority, and globally throttled (see
  //    ytmusic pipedGet limiter) so it can never starve playback. ──
  useEffect(() => {
    if (recentlyPlayed.length === 0 && likedTracks.length === 0 && tasteSeeds.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        // Seeds: explicit taste (liked) first, then recent rotation. Unique.
        const seedSeen = new Set<string>();
        const seeds: Track[] = [];
        for (const t of [...likedTracks, ...tasteSeeds, ...recentlyPlayed]) { if (!seedSeen.has(t.id)) { seedSeen.add(t.id); seeds.push(t); } }
        const topSeeds = seeds.slice(0, 8);
        const known = new Set(seeds.map((t) => t.id));

        // YouTube's own "related" is its recommendation engine. Pull it per seed.
        const related = await Promise.all(topSeeds.map((s) => ytmusic.related(s.id).catch(() => [] as Track[])));
        if (cancelled) return;

        // Score each candidate by HOW MANY of your seeds recommend it — cross-seed
        // agreement is a far stronger signal than any single related list (this is
        // the collaborative-filtering idea YT Music leans on).
        const score = new Map<string, number>();
        const cand = new Map<string, Track>();
        related.forEach((list) => {
          const inList = new Set<string>();
          list.forEach((t) => {
            if (inList.has(t.id)) return; inList.add(t.id);
            score.set(t.id, (score.get(t.id) || 0) + 1);
            if (!cand.has(t.id)) cand.set(t.id, t);
          });
        });
        const ranked = [...cand.values()].sort((a, b) => (score.get(b.id) || 0) - (score.get(a.id) || 0));

        const out: { id: string; title: string; subtitle: string; tracks: Track[] }[] = [];

        // On Repeat — your recent rotation.
        if (recentlyPlayed.length >= 4) {
          out.push({ id: 'repeat', title: 'On Repeat', subtitle: 'The songs you keep coming back to', tracks: recentlyPlayed.slice(0, 30) });
        }

        // Daily Mixes — one per distinct top artist, coherent (that artist + its
        // related), so each mix has a clear identity like YT Music's mixes.
        const byArtist = new Map<string, Track[]>();
        for (const t of seeds) { const k = (t.artist || '').toLowerCase(); if (!k) continue; if (!byArtist.has(k)) byArtist.set(k, []); byArtist.get(k)!.push(t); }
        let dm = 1;
        for (const ak of [...byArtist.keys()].slice(0, 3)) {
          const aSeeds = byArtist.get(ak)!;
          const idx = topSeeds.findIndex((s) => (s.artist || '').toLowerCase() === ak);
          const rel = idx >= 0 ? related[idx] : [];
          // Blend familiar (your plays of this artist) with discovery (its related),
          // interleaved in blocks and artist-diversified (spec §1.3.3).
          const tracks = buildMix(aSeeds, rel.filter((t) => !aSeeds.some((s) => s.id === t.id)), 30);
          if (tracks.length >= 6) { out.push({ id: `daily-${dm}`, title: `Daily Mix ${dm}`, subtitle: `${aSeeds[0].artist} & similar`, tracks }); dm++; }
        }

        // Discover Weekly — highest cross-seed-agreement songs you haven't heard.
        const discover = diverseSample(ranked.filter((t) => !known.has(t.id)), 30);
        if (discover.length >= 8) out.push({ id: 'discover', title: 'Discover Weekly', subtitle: "Fresh picks your taste agrees on", tracks: discover });

        if (!cancelled) setMadeForYou(out);

        // Release Radar — newest from your top artists.
        const artists = Array.from(new Set(seeds.map((t) => t.artist).filter(Boolean))).slice(0, 5);
        const radarLists = await Promise.all(artists.map((a) => ytmusic.search(`${a} new song`).catch(() => [] as Track[])));
        if (cancelled) return;
        const radar: Track[] = []; const rseen = new Set<string>();
        for (const list of radarLists) for (const t of list.slice(0, 3)) if (!rseen.has(t.id)) { rseen.add(t.id); radar.push(t); }
        if (radar.length >= 6 && !cancelled) setMadeForYou((prev) => [...prev, { id: 'radar', title: 'Release Radar', subtitle: 'New from artists you love', tracks: radar.slice(0, 30) }]);
      })();
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasteSig]);

  // Debounced search (songs + artists + albums)
  useEffect(() => {
    const q = query.trim();
    window.clearTimeout(tRef.current);
    if (!q) { setSearching(false); setRSongs([]); setRArtists([]); setRAlbums([]); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const [s, a, al] = await Promise.all([ytmusic.search(q), ytmusic.searchArtists(q), ytmusic.searchAlbums(q)]);
      setRSongs(s); setRArtists(a); setRAlbums(al); setSearching(false);
    }, 400);
    return () => window.clearTimeout(tRef.current);
  }, [query]);

  // Load a mood/genre page's tracks on open — build a deep pool (≥50) from
  // several queries, then shuffle deterministically by today's date so the page
  // is fresh each day but stable within the day.
  useEffect(() => {
    if (!genre) return;
    let cancelled = false; setGenreLoading(true); setGenreTracks([]);
    (async () => {
      // Song-oriented (NOT "mix"/"playlist", which pull cheap DJ-mix compilations).
      const queries = [`best ${genre} songs 2026`, `${genre} hits 2026`, `popular ${genre} songs`, `${genre} essentials`, `top ${genre} tracks`];
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
    setDetailLoading(true); setDetailTracks([]); setDetailAlbums([]);
    const name = a.name.toLowerCase();
    const byArtist = (s?: string) => { const ar = (s || '').toLowerCase(); return !!ar && (ar.includes(name) || name.includes(ar)); };
    const [songs, albums] = await Promise.all([ytmusic.search(`${a.name} songs`), ytmusic.searchAlbums(a.name)]);
    // Show only THIS artist's songs/albums (fall back to all if filtering is too aggressive).
    const mineSongs = songs.filter((t) => byArtist(t.artist));
    const mineAlbums = albums.filter((al) => byArtist(al.artist));
    setDetailTracks(mineSongs.length >= 3 ? mineSongs : songs);
    setDetailAlbums(mineAlbums.length ? mineAlbums : albums);
    setDetailLoading(false);
  };
  const openAlbum = async (al: Album) => {
    setDetail({ kind: 'album', id: al.id, name: al.name, thumbnail: al.thumbnail, subtitle: al.artist || 'Album' });
    setDetailLoading(true); setDetailTracks([]); setDetailAlbums([]);
    let tracks = await ytmusic.playlistTracks(al.id);
    // YouTube-Music album IDs (OLAK5uy_…) can't be expanded by the proxies, so
    // fall back to finding the album's songs by name + artist.
    if (!tracks.length) tracks = await ytmusic.search(`${al.artist || ''} ${al.name}`.trim());
    setDetailTracks(tracks); setDetailLoading(false);
  };

  const artistTile = (a: Artist) => (
    <button key={a.id} onClick={() => openArtist(a)} tabIndex={0} data-tv-focusable className="card-lift flex-none w-[130px] text-center focus:outline-none">
      <div className="w-[130px] h-[130px] rounded-full overflow-hidden bg-zinc-800 border border-white/10 mb-2 mx-auto">{a.thumbnail ? <img src={a.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /> : <User className="w-10 h-10 text-zinc-600 absolute inset-0 m-auto" />}</div>
      <p className="text-sm font-semibold text-white truncate">{a.name}</p><p className="text-xs text-zinc-500">Artist</p>
    </button>
  );
  const albumTile = (al: Album) => (
    <button key={al.id} onClick={() => openAlbum(al)} tabIndex={0} data-tv-focusable className="card-lift flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 text-left focus:outline-none">
      <div className="aspect-square bg-zinc-800 relative">{al.thumbnail ? <img src={al.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Disc3 className="w-8 h-8 text-zinc-600 absolute inset-0 m-auto" />}</div>
      <div className="p-2.5"><p className="text-sm font-semibold text-white truncate">{al.name}</p><p className="text-xs text-zinc-500 truncate">{al.artist || 'Album'}</p></div>
    </button>
  );

  const openList = openId === 'liked' ? { name: 'Liked Songs', tracks: likedTracks, id: 'liked' } : playlists.find((p) => p.id === openId) || null;

  // Featured spotlight for the Home hero — the freshest thing we have.
  const featuredList = mix.length ? mix : (sections[0]?.tracks ?? []);
  const featured = featuredList[0];
  const featuredSource = mix.length ? 'Your Mix' : (sections[0]?.title ?? 'Sauti');

  // "Quick picks" (YouTube-Music-style 4-row tap-to-play grid): personalised mix
  // if we have one, else the freshest catalog shelf, deduped.
  const quickSource = mix.length ? mix : (sections.find((s) => s.tracks.length)?.tracks ?? []);
  const quickPicks = quickSource.slice(0, 20);

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


  if (genre) {
    const shown = sortTracks(genreTracks);
    const hc = genreTint || genreTracks[0]?.dominantColor || 'rgba(245,158,11,0.4)';
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative">
        <div aria-hidden className="absolute inset-x-0 top-0 h-80 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${hc} 0%, transparent 100%)`, opacity: 0.5 }} />
        <button onClick={() => setGenre(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="overline mb-1">Mood &amp; genre</div>
        <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">{genre}</h2>
        {genreTracks.length > 0 && (
          <div className="flex gap-2 mb-8">
            <button onClick={() => playQueue(shown, 0, genre)} className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play</button>
            <button onClick={() => { const arr = [...genreTracks].sort(() => Math.random() - 0.5); playQueue(arr, 0, genre); }} className="btn-glass px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Shuffle className="w-4 h-4" /> Shuffle</button>
            {sortSelect}
          </div>
        )}
        {genreLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Loading {genre}…</div>
        ) : genreTracks.length === 0 ? (
          <p className="text-zinc-500 py-8">Nothing found for {genre}.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">{shown.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(shown, i, genre)} /></Fragment>)}</div>
        )}
      </div>
    );
  }

  if (viewMix) {
    const shown = sortTracks(viewMix.tracks);
    const hc = viewMix.tracks[0]?.dominantColor || 'rgba(245,158,11,0.4)';
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative">
        <div aria-hidden className="absolute inset-x-0 top-0 h-80 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${hc} 0%, transparent 100%)`, opacity: 0.5 }} />
        <button onClick={() => setViewMix(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-end gap-5 mb-8">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10 shrink-0 shadow-xl relative">
            <CoverArt imageUrl={viewMix.tracks[0]?.artworkLarge || viewMix.tracks[0]?.artwork} dominantColor={viewMix.tracks[0]?.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
          </div>
          <div className="min-w-0">
            <div className="overline mb-1">Made for you</div>
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white truncate">{viewMix.title}</h2>
            <p className="text-sm text-zinc-400 mb-4">{viewMix.subtitle} · {viewMix.tracks.length} songs</p>
            <div className="flex gap-2">
              <button onClick={() => playQueue(shown, 0, viewMix.title)} className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play</button>
              <button onClick={() => { const arr = [...viewMix.tracks].sort(() => Math.random() - 0.5); playQueue(arr, 0, viewMix.title); }} className="btn-glass px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Shuffle className="w-4 h-4" /> Shuffle</button>
              {sortSelect}
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">{shown.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(shown, i, viewMix.title)} /></Fragment>)}</div>
      </div>
    );
  }

  if (detail) {
    const shownTracks = sortTracks(detailTracks);
    const heroColor = detailTracks[0]?.dominantColor || 'rgba(245,158,11,0.4)';
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative">
        <div aria-hidden className="absolute inset-x-0 top-0 h-80 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${heroColor} 0%, transparent 100%)`, opacity: 0.5 }} />
        <button onClick={() => setDetail(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-5 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-end gap-5 mb-8">
          <div className={`w-32 h-32 md:w-40 md:h-40 ${detail.kind === 'artist' ? 'rounded-full' : 'rounded-2xl'} overflow-hidden bg-zinc-800 border border-white/10 shrink-0 shadow-xl`}>
            {detail.thumbnail ? <img src={detail.thumbnail} alt="" className="w-full h-full object-cover" /> : (detail.kind === 'artist' ? <User className="w-14 h-14 text-zinc-600 absolute inset-0 m-auto" /> : <Disc3 className="w-14 h-14 text-zinc-600 absolute inset-0 m-auto" />)}
          </div>
          <div className="min-w-0">
            <div className="overline mb-1">{detail.subtitle}</div>
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white truncate">{detail.name}</h2>
            {detailTracks.length > 0 && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => playQueue(detailTracks, 0)} className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play</button>
                <button onClick={() => { const arr = [...detailTracks].sort(() => Math.random() - 0.5); playQueue(arr, 0); }} className="btn-glass px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Shuffle className="w-4 h-4" /> Shuffle</button>
              </div>
            )}
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 py-10"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /> Loading…</div>
        ) : (
          <>
            {detailTracks.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <SectionHead>{detail.kind === 'artist' ? 'Popular' : 'Songs'}</SectionHead>
                  {sortSelect}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">{shownTracks.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(shownTracks, i)} /></Fragment>)}</div>
              </section>
            )}
            {detail.kind === 'artist' && detailAlbums.length > 0 && (
              <section><SectionHead icon={<Disc3 className="w-5 h-5 text-sauti" />}>Albums & Singles</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{detailAlbums.map(albumTile)}</div></section>
            )}
            {detailTracks.length === 0 && <p className="text-zinc-500 py-8">Nothing to show here.</p>}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen relative">
      {showOnboarding && <SautiOnboarding onComplete={seedFromArtists} onSkip={closeOnboarding} />}
      {/* Living aurora glow — tinted by the most recently played track (spec §1.2.4) */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-0 opacity-70"
        style={{ background: `radial-gradient(60% 70% at 12% 0%, ${recentlyPlayed[0]?.dominantColor || 'rgba(245,158,11,0.5)'}, transparent 70%), radial-gradient(50% 60% at 80% 10%, rgba(251,191,36,0.12), transparent 72%)`, filter: 'blur(8px)', transition: 'background 700ms ease' }} />
      <div className="relative"><ListenTabs active="music" onNav={onNav ?? (() => {})} /></div>
      <div className="relative overline text-sauti mb-1.5">Sauti · sound on Sahrae</div>
      <div className="relative flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 shrink-0" aria-hidden>
            <div className="absolute inset-0 rounded-full bg-[#0b0b0d] shadow-lg shadow-amber-500/25" style={{ backgroundImage: 'repeating-radial-gradient(circle at 50% 50%, rgba(245,158,11,0.20) 0 1px, transparent 1px 4px)' }} />
            <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
            <div className="absolute inset-0 m-auto w-[22px] h-[22px] rounded-full bg-gradient-to-tr from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-inner"><Music2 className="w-3.5 h-3.5 text-amber-950" /></div>
          </div>
          <div><h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">{tab === 'home' ? greeting() : 'Your Library'}</h2><p className="text-sm text-zinc-400">Songs · artists · albums · playlists</p></div>
        </div>
        <div className="flex gap-1 glass p-1 rounded-xl self-start">
          {(['home', 'library'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setOpenId(null); }} tabIndex={0} data-tv-focusable className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${tab === t ? 'bg-sauti text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
              {t === 'home' ? <><Music2 className="w-4 h-4" /> Home</> : <><Library className="w-4 h-4" /> Library</>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'home' ? (
        <>
          <Coachmark id="sauti" text="Long-press any song for Radio, Play next, Queue and Download." />
          <div className="relative mb-5 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, albums…" className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
          </div>

          {query.trim() ? (
            searching ? (
              <div className="flex items-center gap-2 text-zinc-400 py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
            ) : (rSongs.length + rArtists.length + rAlbums.length === 0) ? (
              <p className="text-zinc-500 py-8">No results found.</p>
            ) : (
              <div className="space-y-8">
                {/* Top result + Songs (Spotify-exact, spec §1.3.7) */}
                <div className="grid lg:grid-cols-2 gap-5 lg:gap-7 items-start">
                  {rSongs[0] && (
                    <div>
                      <SectionHead>Top result</SectionHead>
                      <button onClick={() => playQueue(rSongs, 0)} tabIndex={0} data-tv-focusable className="group relative w-full text-left rounded-2xl p-5 bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="w-24 h-24 rounded-xl overflow-hidden mb-4 relative shadow-xl"><CoverArt imageUrl={rSongs[0].artworkLarge || rSongs[0].artwork} fallbackUrl={rSongs[0].artwork} dominantColor={rSongs[0].dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                        <p className="text-2xl font-display font-bold text-white truncate">{rSongs[0].title}</p>
                        <p className="text-sm text-zinc-400 mt-1 truncate">{rSongs[0].artist} · <span className="text-zinc-300 font-semibold">Song</span></p>
                        <span className="absolute bottom-5 right-5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all btn-sauti w-12 h-12 rounded-full flex items-center justify-center shadow-lg"><Play className="w-5 h-5 fill-current ml-0.5" /></span>
                      </button>
                    </div>
                  )}
                  {rSongs.length > 0 && (
                    <div>
                      <SectionHead>Songs</SectionHead>
                      <div className="space-y-1">{rSongs.slice(0, 4).map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(rSongs, i)} /></Fragment>)}</div>
                    </div>
                  )}
                </div>
                {rArtists.length > 0 && (
                  <section><SectionHead>Artists</SectionHead><div className="flex overflow-x-auto gap-5 pt-1 pb-3 scrollbar-hide">{rArtists.map(artistTile)}</div></section>
                )}
                {rAlbums.length > 0 && (
                  <section><SectionHead>Albums</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-3 scrollbar-hide">{rAlbums.map(albumTile)}</div></section>
                )}
              </div>
            )
          ) : (
            <>
              {/* Quick-access pills — jump straight back into recent plays (spec §1.2.5) */}
              {recentlyPlayed.length >= 2 && (
                <div className="grid grid-cols-2 gap-2 mb-7">
                  {recentlyPlayed.slice(0, 6).map((t, i) => (
                    <button key={t.id} onClick={() => playQueue(recentlyPlayed, i, 'Recently played')} tabIndex={0} data-tv-focusable
                      className="group flex items-center gap-3 rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition-colors h-14 pr-3 text-left">
                      <div className="w-14 h-14 shrink-0 relative"><CoverArt imageUrl={t.artwork} dominantColor={t.dominantColor} rounded="" className="absolute inset-0 w-full h-full" /></div>
                      <span className="text-sm font-bold text-white truncate flex-1 min-w-0">{t.title}</span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity btn-sauti w-8 h-8 rounded-full flex items-center justify-center shrink-0"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
                    </button>
                  ))}
                </div>
              )}

              {/* Mood cards — colourful, scannable at a glance (Spotify pattern) */}
              <section className="mb-6">
                <SectionHead>Moods &amp; genres</SectionHead>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {MOODS.map((m) => (
                    <button key={m.name} onClick={() => openMood(m.name, m.tint)} tabIndex={0} data-tv-focusable
                      className={`card-lift relative overflow-hidden rounded-xl h-[100px] md:h-[120px] p-3 flex items-start text-left bg-gradient-to-br ${m.grad} focus:outline-none`}>
                      <span className="text-white font-display font-bold text-lg leading-tight drop-shadow-md">{m.name}</span>
                      <div className="absolute -bottom-3 -right-3 w-16 h-16 rounded-lg bg-black/25 rotate-[18deg] shadow-lg" />
                    </button>
                  ))}
                </div>
              </section>

              {/* Quick genre chips */}
              <div className="flex overflow-x-auto gap-2 pb-2 mb-6 scrollbar-hide">
                {GENRES.map((g) => <button key={g} onClick={() => setGenre(g)} tabIndex={0} data-tv-focusable className="chip px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-zinc-300 hover:text-white">{g}</button>)}
              </div>

              {/* ── Featured spotlight hero ── */}
              {featured && (
                <section className="relative mb-9 rounded-3xl overflow-hidden border border-white/10 elev-2">
                  <img aria-hidden alt="" src={featured.artworkLarge || featured.artwork} className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0.2) 100%)' }} />
                  <div className="relative flex items-center gap-4 md:gap-7 p-5 md:p-7">
                    <div className="relative w-24 h-24 md:w-40 md:h-40 shrink-0">
                      <CoverArt imageUrl={featured.artworkLarge || featured.artwork} fallbackUrl={featured.artwork} dominantColor={featured.dominantColor} rounded="rounded-2xl" className="np-art w-full h-full" />
                    </div>
                    <div className="min-w-0">
                      <div className="overline mb-1.5">Featured · {featuredSource}</div>
                      <h3 className="np-title text-2xl md:text-4xl font-display font-bold text-white truncate">{featured.title}</h3>
                      <p className="text-zinc-300 truncate mb-4 font-medium">{featured.artist}</p>
                      <div className="flex gap-2">
                        <button onClick={() => playQueue(featuredList, 0, featuredSource)} tabIndex={0} data-tv-focusable className="btn-sauti px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Play className="w-4 h-4 fill-current" /> Play</button>
                        <button onClick={() => openAddSheet(featured)} tabIndex={0} data-tv-focusable className="btn-glass px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Add</button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Quick picks — YouTube-Music's signature 4-row tap-to-play grid ── */}
              {quickPicks.length > 0 && (
                <section className="mb-9">
                  <SectionHead icon={<Sparkles className="w-5 h-5 text-sauti" />}>Quick picks</SectionHead>
                  <div className="overflow-x-auto scrollbar-hide pb-3 -mx-1 px-1">
                    <div className="grid grid-rows-4 grid-flow-col auto-cols-[86%] sm:auto-cols-[minmax(320px,360px)] gap-x-5 gap-y-0.5">
                      {quickPicks.map((t, i) => <Fragment key={t.id}><QuickRow track={t} onPlay={() => playQueue(quickPicks, i, 'Quick picks')} /></Fragment>)}
                    </div>
                  </div>
                </section>
              )}

              {madeForYou.length > 0 && (
                <section className="mb-9">
                  <SectionHead icon={<Sparkles className="w-5 h-5 text-sauti" />}>Mixed for you</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {madeForYou.map((m) => (
                      <div key={m.id} role="button" onClick={() => setViewMix(m)} tabIndex={0} data-tv-focusable
                        className="card-lift group flex-none w-[160px] text-left rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 focus:outline-none cursor-pointer">
                        <div className="aspect-square relative bg-zinc-800">
                          <CoverArt imageUrl={m.tracks[0]?.artworkLarge || m.tracks[0]?.artwork} dominantColor={m.tracks[0]?.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                          {/* Colourful tint from the mix's dominant colour (YT Music mix-card look) */}
                          <div className="absolute inset-0" style={{ background: `linear-gradient(150deg, ${m.tracks[0]?.dominantColor || 'rgba(245,158,11,0.6)'} 0%, transparent 60%)`, opacity: 0.55, mixBlendMode: 'soft-light' }} />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                          <div className="absolute bottom-2.5 left-2.5 right-2.5">
                            <div className="overline text-[9px] mb-0.5">Made for you</div>
                            <p className="text-white font-display font-bold text-base leading-tight line-clamp-2">{m.title}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); playQueue(m.tracks, 0, m.title); }} className="absolute top-2 right-2 btn-sauti w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Play"><Play className="w-4 h-4 fill-current ml-0.5" /></button>
                        </div>
                        <div className="p-2.5"><p className="text-xs text-zinc-400 line-clamp-2 leading-snug">{m.subtitle}</p></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {mix.length > 0 && (
                <section className="mb-10">
                  <SectionHead icon={<Sparkles className="w-5 h-5 text-sauti" />}>Listen again</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{mix.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(mix, i, 'Your Mix')} /></Fragment>)}</div>
                </section>
              )}

              {sections.map((sec) => (
                <section key={sec.title} className="mb-10">
                  <SectionHead>{sec.title}</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{sec.tracks.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(sec.tracks, i, sec.title)} /></Fragment>)}</div>
                </section>
              ))}
              {loadingHome && sections.length === 0 && <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-zinc-400"><Loader2 className="w-9 h-9 animate-spin text-amber-500" /><span>Loading Sauti…</span></div>}
              {!loadingHome && sections.length === 0 && <p className="text-zinc-500 py-10 text-center">Couldn't reach the music service right now. Try a search, or again shortly.</p>}
            </>
          )}
        </>
      ) : openList ? (
        <section className="relative">
          <div aria-hidden className="absolute inset-x-0 -top-24 h-72 -z-10 pointer-events-none" style={{ background: `linear-gradient(180deg, ${openList.tracks[0]?.dominantColor || 'rgba(245,158,11,0.4)'} 0%, transparent 100%)`, opacity: 0.5 }} />
          <button onClick={() => setOpenId(null)} className="sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 w-fit flex items-center gap-1 text-zinc-200 hover:text-white mb-4 text-sm px-3.5 py-2 rounded-full bg-zinc-900/85 backdrop-blur-xl border border-white/10 shadow-lg"><ChevronLeft className="w-4 h-4" /> Library</button>
          <div className="flex items-end gap-4 mb-6">
            <div className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${openList.id === 'liked' ? 'from-amber-400 via-orange-500 to-rose-600' : gradFor(openList.name)} flex items-center justify-center shadow-xl shrink-0`}>{openList.id === 'liked' ? <Heart className="w-12 h-12 text-white fill-current drop-shadow" /> : <ListMusic className="w-12 h-12 text-white drop-shadow" />}</div>
            <div className="min-w-0">
              <h3 className="text-3xl font-display font-bold text-white truncate">{openList.name}</h3>
              <p className="text-sm text-zinc-400 tabular">{openList.tracks.length} songs</p>
              <div className="flex gap-2 mt-3">
                <button disabled={!openList.tracks.length} onClick={() => playQueue(openList.tracks, 0)} className="btn-sauti px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-40"><Play className="w-4 h-4 fill-current" /> Play</button>
                <button disabled={!openList.tracks.length} onClick={() => { const arr = [...openList.tracks].sort(() => Math.random() - 0.5); playQueue(arr, 0); }} className="btn-glass px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 disabled:opacity-40"><Shuffle className="w-4 h-4" /> Shuffle</button>
                {openList.id !== 'liked' && <button onClick={() => { deletePlaylist(openList.id); setOpenId(null); }} className="px-4 py-2 rounded-full text-sm font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-2"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          </div>
          {openList.tracks.length === 0 ? <p className="text-zinc-500 py-8">No songs yet. Tap the + on any song to add it here.</p> : (
            <>
              <div className="flex justify-end mb-3">{sortSelect}</div>
              <div className="grid sm:grid-cols-2 gap-2">{sortTracks(openList.tracks).map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(sortTracks(openList.tracks), i)} onRemove={openList.id !== 'liked' ? () => removeFromPlaylist(openList.id, t.id) : undefined} /></Fragment>)}</div>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
            <button onClick={() => setOpenId('liked')} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-rose-600/20 border border-rose-500/25 text-left">
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 flex items-center justify-center shrink-0 shadow-lg shadow-rose-600/25"><Heart className="w-6 h-6 text-white fill-current" /></span>
              <span><span className="block font-bold text-white">Liked Songs</span><span className="block text-xs text-zinc-300 tabular">{likedTracks.length} songs</span></span>
            </button>
            {creating ? (
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-zinc-900/60 border border-white/10 col-span-2 sm:col-span-1">
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} placeholder="Playlist name" className="flex-1 min-w-0 bg-transparent px-2 text-sm text-white focus:outline-none" />
                <button onClick={() => { if (newName.trim()) { createPlaylist(newName); setNewName(''); setCreating(false); } }} className="btn-sauti px-3 py-2 rounded-lg text-xs font-bold shrink-0">Add</button>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-zinc-900/50 border border-white/10 text-left"><span className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Plus className="w-6 h-6 text-sauti" /></span><span className="font-bold text-white">New playlist</span></button>
            )}
            <button onClick={() => setRedoTaste(true)} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 border border-violet-500/25 text-left">
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-lg shadow-fuchsia-600/25"><Sparkles className="w-6 h-6 text-white" /></span>
              <span><span className="block font-bold text-white">Tune your taste</span><span className="block text-xs text-zinc-300">Refresh your mixes</span></span>
            </button>
          </div>
          {recentlyPlayed.length > 0 && (
            <section className="mb-10"><SectionHead>Recently Played</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{recentlyPlayed.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(recentlyPlayed, i)} /></Fragment>)}</div></section>
          )}
          <section><SectionHead>Your Playlists</SectionHead>
            {playlists.length === 0 ? <p className="text-zinc-500 py-6">No playlists yet. Create one above, or tap + on any song.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{playlists.map((p) => (
                <button key={p.id} onClick={() => setOpenId(p.id)} tabIndex={0} data-tv-focusable className="card-lift text-left rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
                  <div className={`aspect-square relative flex items-center justify-center overflow-hidden ${p.tracks[0]?.artwork ? 'bg-zinc-800' : `bg-gradient-to-br ${gradFor(p.name)}`}`}>{p.tracks[0]?.artwork ? <img src={p.tracks[0].artwork} alt="" className="w-full h-full object-cover" /> : <><div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" /><span className="relative font-display font-black text-white/95 text-3xl tracking-tight drop-shadow">{monogram(p.name)}</span></>}</div>
                  <div className="p-2.5"><p className="text-sm font-semibold text-white truncate">{p.name}</p><p className="text-xs text-zinc-500 tabular">{p.tracks.length} songs</p></div>
                </button>
              ))}</div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
