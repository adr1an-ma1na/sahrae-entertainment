import { useState, useEffect, useRef, Fragment, ReactNode } from 'react';
import { Search, Play, Pause, Heart, Loader2, Music2, Plus, X, ListMusic, Shuffle, Trash2, ChevronLeft, Library, Sparkles, Disc3, User } from 'lucide-react';
import { ytmusic, Track, Artist, Album, GENRES, SECTIONS } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60); const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

function Equalizer() {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className="w-0.5 bg-amber-400 rounded-full animate-[eq_0.9s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: `${i * 0.15}s` }} />)}
    </div>
  );
}

function TrackRow({ track, onPlay, onRemove }: { track: Track; onPlay: () => void; onRemove?: () => void }) {
  const { current, isPlaying, toggle, toggleLike, isLiked, openAddSheet } = useMusic();
  const active = current?.id === track.id;
  return (
    <div tabIndex={0} data-tv-focusable role="button" onClick={() => (active ? toggle() : onPlay())}
      className="card-lift group flex items-center gap-3 p-2 pr-2 rounded-xl border border-white/5 bg-zinc-900/40 cursor-pointer focus:outline-none">
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
        <CoverArt imageUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
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
  return (
    <div tabIndex={0} data-tv-focusable role="button" onClick={onPlay} className="card-lift group relative flex-none w-[150px] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer focus:outline-none">
      <div className="aspect-square bg-zinc-800 relative">
        <CoverArt imageUrl={track.artwork} dominantColor={track.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
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

const SectionHead = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    {icon ?? <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-amber-500" />}
    <h3 className="text-xl font-display font-bold text-white tracking-tight">{children}</h3>
  </div>
);

type Detail = { kind: 'artist' | 'album'; id: string; name: string; thumbnail?: string; subtitle?: string };

export default function MusicView() {
  const { playQueue, likedTracks, playlists, recentlyPlayed, createPlaylist, deletePlaylist, removeFromPlaylist, openAddSheet } = useMusic();

  const [tab, setTab] = useState<'home' | 'library'>('home');
  const [sections, setSections] = useState<{ title: string; tracks: Track[] }[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [mix, setMix] = useState<Track[]>([]);
  const [madeForYou, setMadeForYou] = useState<{ id: string; title: string; subtitle: string; tracks: Track[] }[]>([]);

  const [query, setQuery] = useState('');
  const [searchTab, setSearchTab] = useState<'songs' | 'artists' | 'albums'>('songs');
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
        const tracks = await ytmusic.search(s.q);
        if (cancelled) return;
        if (tracks.length) setSections((prev) => [...prev, { title: s.title, tracks }]);
        setLoadingHome(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Your Mix from listening (built on entry)
  useEffect(() => {
    if (recentlyPlayed.length === 0) return;
    let cancelled = false;
    (async () => {
      const seeds = recentlyPlayed.slice(0, 4);
      const lists = await Promise.all(seeds.map((s) => ytmusic.related(s.id)));
      if (cancelled) return;
      const seen = new Set(recentlyPlayed.map((t) => t.id));
      const agg: Track[] = [];
      for (const list of lists) for (const t of list) if (!seen.has(t.id)) { seen.add(t.id); agg.push(t); }
      for (let i = agg.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [agg[i], agg[j]] = [agg[j], agg[i]]; }
      setMix(agg.slice(0, 30));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── "Made For You" — Spotify-grade curated playlists from your listening
  //    (On Repeat, Daily Mixes, Discover Weekly, Release Radar). DEFERRED ~3s so
  //    the first track + home shelves get priority, and globally throttled (see
  //    ytmusic pipedGet limiter) so it can never starve playback. ──
  useEffect(() => {
    if (recentlyPlayed.length === 0 && likedTracks.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        // Seeds: explicit taste (liked) first, then recent rotation. Unique.
        const seedSeen = new Set<string>();
        const seeds: Track[] = [];
        for (const t of [...likedTracks, ...recentlyPlayed]) { if (!seedSeen.has(t.id)) { seedSeen.add(t.id); seeds.push(t); } }
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
          const tracks = [...aSeeds, ...rel.filter((t) => !aSeeds.some((s) => s.id === t.id))].slice(0, 30);
          if (tracks.length >= 6) { out.push({ id: `daily-${dm}`, title: `Daily Mix ${dm}`, subtitle: `${aSeeds[0].artist} & similar`, tracks }); dm++; }
        }

        // Discover Weekly — highest cross-seed-agreement songs you haven't heard.
        const discover = ranked.filter((t) => !known.has(t.id)).slice(0, 30);
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
  }, []);

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

  const openArtist = async (a: Artist) => {
    setDetail({ kind: 'artist', id: a.id, name: a.name, thumbnail: a.thumbnail, subtitle: 'Artist' });
    setDetailLoading(true); setDetailTracks([]); setDetailAlbums([]);
    const [songs, albums] = await Promise.all([ytmusic.search(`${a.name} songs`), ytmusic.searchAlbums(a.name)]);
    setDetailTracks(songs); setDetailAlbums(albums); setDetailLoading(false);
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

  // ── Detail page (artist / album) ──
  if (detail) {
    return (
      <div className="sauti pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 pb-40 mx-auto min-h-screen">
        <button onClick={() => setDetail(null)} className="flex items-center gap-1 text-zinc-400 hover:text-white mb-5 text-sm"><ChevronLeft className="w-4 h-4" /> Back</button>
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
                <SectionHead>{detail.kind === 'artist' ? 'Popular' : 'Songs'}</SectionHead>
                <div className="grid sm:grid-cols-2 gap-2">{detailTracks.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(detailTracks, i)} /></Fragment>)}</div>
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
      {/* premium aurora glow behind the header so the top never reads flat */}
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-0 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(245,158,11,0.22), transparent 70%), radial-gradient(50% 60% at 80% 10%, rgba(251,191,36,0.12), transparent 72%)', filter: 'blur(8px)' }} />
      <div className="relative overline text-sauti mb-1.5">Sauti · sound on Sahrae</div>
      <div className="relative flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-300 via-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30"><Music2 className="w-6 h-6 text-white" /></div>
          <div><h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Sauti</h2><p className="text-sm text-zinc-400">Songs · artists · albums · radio</p></div>
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
          <div className="relative mb-5 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, albums…" className="w-full bg-zinc-900/70 border border-white/10 rounded-full pl-10 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/60" />
          </div>

          {query.trim() ? (
            <section>
              {/* search tabs */}
              <div className="flex gap-2 mb-5">
                {(['songs', 'artists', 'albums'] as const).map((st) => (
                  <button key={st} onClick={() => setSearchTab(st)} tabIndex={0} data-tv-focusable className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize ${searchTab === st ? 'bg-white text-zinc-950' : 'chip text-zinc-300 hover:text-white'}`}>{st}</button>
                ))}
              </div>
              {searching ? (
                <div className="flex items-center gap-2 text-zinc-400 py-8"><Loader2 className="w-5 h-5 animate-spin text-amber-500" /> Searching…</div>
              ) : searchTab === 'songs' ? (
                rSongs.length ? <div className="grid sm:grid-cols-2 gap-2">{rSongs.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(rSongs, i)} /></Fragment>)}</div> : <p className="text-zinc-500 py-8">No songs found.</p>
              ) : searchTab === 'artists' ? (
                rArtists.length ? <div className="flex flex-wrap gap-5">{rArtists.map(artistTile)}</div> : <p className="text-zinc-500 py-8">No artists found.</p>
              ) : (
                rAlbums.length ? <div className="flex flex-wrap gap-4">{rAlbums.map(albumTile)}</div> : <p className="text-zinc-500 py-8">No albums found.</p>
              )}
            </section>
          ) : (
            <>
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

              {madeForYou.length > 0 && (
                <section className="mb-9">
                  <SectionHead icon={<Sparkles className="w-5 h-5 text-sauti" />}>Made For You</SectionHead>
                  <div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">
                    {madeForYou.map((m) => (
                      <button key={m.id} onClick={() => playQueue(m.tracks, 0, m.title)} tabIndex={0} data-tv-focusable
                        className="card-lift group flex-none w-[160px] text-left rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 focus:outline-none">
                        <div className="aspect-square relative bg-zinc-800">
                          <CoverArt imageUrl={m.tracks[0]?.artworkLarge || m.tracks[0]?.artwork} dominantColor={m.tracks[0]?.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                          <div className="absolute bottom-2.5 left-2.5 right-2.5">
                            <div className="overline text-[9px] mb-0.5">Made for you</div>
                            <p className="text-white font-display font-bold text-base leading-tight line-clamp-2">{m.title}</p>
                          </div>
                          <span className="absolute top-2 right-2 btn-sauti w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Play className="w-4 h-4 fill-current ml-0.5" /></span>
                        </div>
                        <div className="p-2.5"><p className="text-xs text-zinc-400 line-clamp-2 leading-snug">{m.subtitle}</p></div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <div className="flex overflow-x-auto gap-2 pb-2 mb-8 scrollbar-hide">
                {GENRES.map((g) => <button key={g} onClick={() => setQuery(g)} tabIndex={0} data-tv-focusable className="chip px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap text-zinc-300 hover:text-white">{g}</button>)}
              </div>

              {mix.length > 0 && (
                <section className="mb-10">
                  <SectionHead icon={<Sparkles className="w-5 h-5 text-sauti" />}>Your Mix · made from your listening</SectionHead>
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
        <section>
          <button onClick={() => setOpenId(null)} className="flex items-center gap-1 text-zinc-400 hover:text-white mb-4 text-sm"><ChevronLeft className="w-4 h-4" /> Library</button>
          <div className="flex items-end gap-4 mb-6">
            <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-500 flex items-center justify-center shadow-xl shrink-0">{openList.id === 'liked' ? <Heart className="w-12 h-12 text-white fill-current" /> : <ListMusic className="w-12 h-12 text-white" />}</div>
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
            <div className="grid sm:grid-cols-2 gap-2">{openList.tracks.map((t, i) => <Fragment key={t.id}><TrackRow track={t} onPlay={() => playQueue(openList.tracks, i)} onRemove={openList.id !== 'liked' ? () => removeFromPlaylist(openList.id, t.id) : undefined} /></Fragment>)}</div>
          )}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
            <button onClick={() => setOpenId('liked')} tabIndex={0} data-tv-focusable className="card-lift flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/20 border border-amber-500/20 text-left">
              <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-500 flex items-center justify-center shrink-0"><Heart className="w-6 h-6 text-white fill-current" /></span>
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
          </div>
          {recentlyPlayed.length > 0 && (
            <section className="mb-10"><SectionHead>Recently Played</SectionHead><div className="flex overflow-x-auto gap-4 pt-1 pb-4 scrollbar-hide">{recentlyPlayed.map((t, i) => <Fragment key={t.id}><TrackCard track={t} onPlay={() => playQueue(recentlyPlayed, i)} /></Fragment>)}</div></section>
          )}
          <section><SectionHead>Your Playlists</SectionHead>
            {playlists.length === 0 ? <p className="text-zinc-500 py-6">No playlists yet. Create one above, or tap + on any song.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{playlists.map((p) => (
                <button key={p.id} onClick={() => setOpenId(p.id)} tabIndex={0} data-tv-focusable className="card-lift text-left rounded-2xl overflow-hidden border border-white/10 bg-zinc-900">
                  <div className="aspect-square bg-gradient-to-br from-zinc-700 to-zinc-900 relative flex items-center justify-center">{p.tracks[0]?.artwork ? <img src={p.tracks[0].artwork} alt="" className="w-full h-full object-cover" /> : <ListMusic className="w-10 h-10 text-zinc-500" />}</div>
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
