import { useCallback, useEffect, useState } from 'react';
import { Youtube, Loader2, Play, RefreshCw, LogOut, Music2, Video, ListMusic, Users, Sparkles } from 'lucide-react';
import { youtubeService, API_DISABLED_HELP, KEY_BLOCKED_HELP, CREDENTIALS_URL, type YoutubeChannel, type YoutubePlaylist, type YoutubeUserProfile } from '../services/youtube';
import { getApiState, ENABLE_URL } from '../services/ytDataApi';
import { Track } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { ShelfHeader, WideRow, ArtCard, Shelf, CardSkeleton } from './ui/Shelf';
import { buildMadeForYou, type Mix } from '../services/mixes';
import { ytDataApi } from '../services/ytDataApi';

/**
 * Connect a Google account and browse what it has liked and saved.
 *
 * ONE connection, TWO libraries. YouTube and YouTube Music are the same Google
 * account and the same `youtube.readonly` grant — there is one Liked list that
 * both write to, and the API cannot issue separate permissions for them. So
 * connecting twice would authorise the same thing twice and read the same data.
 * The split below is what actually differs: Music is that list filtered to
 * YouTube's Music category, Videos is all of it.
 *
 * Playback goes through the app's existing YouTube IFrame player, so YouTube
 * serves the media and the play still counts for the creator.
 */

type Tab = 'foryou' | 'music' | 'videos' | 'artists' | 'playlists';

const TABS: { id: Tab; label: string; icon: typeof Music2; blurb: string }[] = [
  { id: 'foryou', label: 'Made for you', icon: Sparkles, blurb: 'Mixes built from what you listen to' },
  { id: 'music', label: 'YouTube Music', icon: Music2, blurb: 'Songs you have liked' },
  { id: 'videos', label: 'YouTube', icon: Video, blurb: 'Everything you have liked' },
  { id: 'artists', label: 'Artists', icon: Users, blurb: 'Channels you subscribe to' },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, blurb: 'Your saved playlists' },
];

const fmt = (s: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export default function YouTubeConnect() {
  const { playQueue, current, isPlaying, recentlyPlayed } = useMusic();

  const [connected, setConnected] = useState(() => youtubeService.isConnected());
  const [profile, setProfile] = useState<YoutubeUserProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('foryou');
  const [music, setMusic] = useState<Track[] | null>(null);
  const [videos, setVideos] = useState<Track[] | null>(null);
  const [playlists, setPlaylists] = useState<YoutubePlaylist[] | null>(null);
  const [artists, setArtists] = useState<YoutubeChannel[] | null>(null);
  const [openArtist, setOpenArtist] = useState<{ c: YoutubeChannel; tracks: Track[] | null } | null>(null);
  const [mixes, setMixes] = useState<Mix[] | null>(null);
  const [openMix, setOpenMix] = useState<Mix | null>(null);
  const [openList, setOpenList] = useState<{ p: YoutubePlaylist; tracks: Track[] | null } | null>(null);
  const [loading, setLoading] = useState(false);

  // Two different 403s with two different fixes. Naming the wrong one sends
  // someone to the wrong console page, which is how this was got wrong before.
  const state = getApiState();
  const apiOff = state === 'disabled';
  const keyBlocked = state === 'keyBlocked';

  /**
   * Assemble the signals a mix needs, then compute them locally.
   *
   * Liked music is the strongest signal; subscriptions name the artists worth
   * building radios around; the regional chart is the discovery pool. Recent
   * plays come from the player itself. Everything is fetched in parallel — they
   * are independent, and this runs while someone is looking at the tab.
   */
  const buildMixes = useCallback(async (): Promise<Mix[]> => {
    const [likedMusic, subs] = await Promise.all([
      music ? Promise.resolve(music) : youtubeService.fetchLikedMusic().catch(() => [] as Track[]),
      artists ? Promise.resolve(artists) : youtubeService.fetchSubscriptions().catch(() => [] as YoutubeChannel[]),
    ]);

    // Chart for the listener's own region where we can tell, else a broad one.
    const region = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').includes('Nairobi') ? 'KE' : 'US';
    const chart = (await ytDataApi.chart(region, 50).catch(() => null)) || [];

    // Uploads for the top few subscribed artists — enough for real radios
    // without spending a call on a whole subscription list.
    const topSubs = subs.slice(0, 4);
    const uploads = await Promise.all(
      topSubs.map((c) => youtubeService.fetchChannelUploads(c.id, 25).catch(() => [] as Track[])),
    );
    const byArtist = new Map<string, Track[]>();
    topSubs.forEach((c, i) => byArtist.set(c.title.trim().toLowerCase(), uploads[i]));

    return buildMadeForYou(
      { liked: likedMusic, recent: recentlyPlayed, subscribedArtists: subs.map((c) => c.title) },
      { chart, byArtist },
    );
  }, [music, artists, recentlyPlayed]);

  const load = useCallback(async (which: Tab, force = false) => {
    if (!youtubeService.isConnected()) return;
    if (!force) {
      if (which === 'music' && music) return;
      if (which === 'videos' && videos) return;
      if (which === 'playlists' && playlists) return;
      if (which === 'artists' && artists) return;
      if (which === 'foryou' && mixes) return;
    }
    setLoading(true); setError(null);
    try {
      // The first page paints while the rest of the library is still walking —
      // a large Liked list used to show nothing until every page had landed.
      if (which === 'music') setMusic(await youtubeService.fetchLikedMusic((partial) => setMusic((cur) => cur ?? partial)));
      else if (which === 'videos') setVideos(await youtubeService.fetchLikedVideos((partial) => setVideos((cur) => cur ?? partial)));
      else if (which === 'artists') setArtists(await youtubeService.fetchSubscriptions());
      else if (which === 'foryou') setMixes(await buildMixes());
      else setPlaylists(await youtubeService.fetchPlaylists());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that from YouTube.');
    } finally {
      setLoading(false);
    }
  }, [music, videos, playlists, artists, mixes, buildMixes]);

  useEffect(() => { if (connected) load(tab); }, [connected, tab, load]);

  useEffect(() => {
    if (!connected) return;
    youtubeService.fetchUserProfile().then(setProfile).catch(() => { /* name is cosmetic */ });
  }, [connected]);

  const onConnect = async () => {
    setConnecting(true); setError(null);
    try {
      await youtubeService.signInWithGoogle();
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect your Google account.');
    } finally {
      setConnecting(false);
    }
  };

  const onDisconnect = () => {
    youtubeService.disconnect();
    setConnected(false); setProfile(null);
    setMusic(null); setVideos(null); setPlaylists(null); setArtists(null); setMixes(null);
    setOpenList(null); setOpenArtist(null); setOpenMix(null);
  };

  const openArtistPage = async (c: YoutubeChannel) => {
    setOpenArtist({ c, tracks: null });
    try {
      setOpenArtist({ c, tracks: await youtubeService.fetchChannelUploads(c.id, 50) });
    } catch (err) {
      setOpenArtist(null);
      setError(err instanceof Error ? err.message : 'Could not open that channel.');
    }
  };

  const openPlaylist = async (p: YoutubePlaylist) => {
    setOpenList({ p, tracks: null });
    try {
      const tracks = await youtubeService.fetchPlaylistTracks(p.id);
      setOpenList({ p, tracks });
    } catch (err) {
      setOpenList(null);
      setError(err instanceof Error ? err.message : 'Could not open that playlist.');
    }
  };

  const rows = tab === 'music' ? music : videos;

  // ── Not connected ──
  if (!connected) {
    return (
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-red-600/10 via-red-500/5 to-transparent p-6 md:p-8">
        <div className="flex items-start gap-4 mb-5">
          <span className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-600/20">
            <Youtube className="w-6 h-6 text-white fill-current" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-display font-bold text-white">Connect YouTube</h3>
            <p className="text-sm text-zinc-400 mt-1 max-w-xl leading-relaxed">
              Bring your liked songs, liked videos and playlists into Sahrae. One sign-in covers both
              YouTube Music and YouTube — they are the same account, so there is nothing separate to connect.
            </p>
          </div>
        </div>

        {/* A blocked KEY does not stop sign-in: the OAuth path sends a Bearer
            token and no key, so connecting still works and reads your library.
            Only a disabled API stops everything. */}
        <button onClick={onConnect} disabled={connecting || apiOff}
          className="btn-sauti px-6 py-3 rounded-full text-sm font-black inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening Google…</> : 'Connect with Google'}
        </button>

        <p className="text-[11px] text-zinc-500 mt-4 max-w-xl leading-relaxed">
          Sahrae reads your library. It cannot change anything — the permission requested is read-only.
          Playback happens in YouTube's own player.
        </p>

        {apiOff && (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-200 mb-1">YouTube access is switched off for this app</p>
            <p className="text-xs text-amber-200/80 leading-relaxed mb-3">{API_DISABLED_HELP}</p>
            <a href={ENABLE_URL} target="_blank" rel="noreferrer"
              className="btn-sauti px-4 py-2 rounded-lg text-xs font-black inline-block">Enable the API</a>
          </div>
        )}
        {keyBlocked && (
          <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-200 mb-1">Browsing is limited — the app key cannot call YouTube</p>
            <p className="text-xs text-amber-200/80 leading-relaxed mb-3">{KEY_BLOCKED_HELP}</p>
            <a href={CREDENTIALS_URL} target="_blank" rel="noreferrer"
              className="btn-sauti px-4 py-2 rounded-lg text-xs font-black inline-block">Open Credentials</a>
          </div>
        )}
        {error && <p className="text-sm text-red-400 mt-4">{error}</p>}
      </section>
    );
  }

  // ── Connected ──
  return (
    <section>
      <div className="flex items-center gap-3 mb-6 rounded-2xl border border-white/10 bg-zinc-900/40 p-4">
        {profile?.picture
          ? <img src={profile.picture} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full border border-white/10" />
          : <span className="w-10 h-10 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
              {profile?.name?.charAt(0) || 'Y'}
            </span>}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Connected
          </p>
          <p className="text-sm font-bold text-white truncate">{profile?.name || 'Your YouTube account'}</p>
        </div>
        <button onClick={() => load(tab, true)} disabled={loading} aria-label="Refresh"
          className="w-9 h-9 rounded-full border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={onDisconnect}
          className="text-xs font-bold px-3 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-red-400 hover:border-red-500/30 inline-flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Disconnect
        </button>
      </div>

      <div className="flex gap-1 glass p-1 rounded-xl w-fit mb-6">
        {TABS.map((t) => {
          const on = tab === t.id;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setOpenList(null); setOpenArtist(null); setOpenMix(null); }} tabIndex={0} data-tv-focusable
              aria-pressed={on}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${on ? 'bg-sauti text-amber-950' : 'text-zinc-400 hover:text-white'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {keyBlocked && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200 mb-1">Your library works; app-wide browsing does not</p>
          <p className="text-xs text-amber-200/80 leading-relaxed mb-2">{KEY_BLOCKED_HELP}</p>
          <a href={CREDENTIALS_URL} target="_blank" rel="noreferrer"
            className="text-xs font-black text-sauti hover:underline">Open Credentials →</a>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* An opened mix */}
      {openMix ? (
        <div>
          <button onClick={() => setOpenMix(null)} className="text-xs font-bold text-sauti mb-4 hover:underline">← All mixes</button>
          <div className="flex items-end gap-4 mb-5">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative">
              <CoverArt imageUrl={openMix.tracks[0]?.artworkLarge || openMix.tracks[0]?.artwork}
                dominantColor={openMix.tracks[0]?.dominantColor} rounded="" className="absolute inset-0 w-full h-full" />
            </div>
            <div className="min-w-0">
              <h3 className="text-2xl font-display font-bold text-white truncate">{openMix.title}</h3>
              <p className="text-sm text-zinc-400">{openMix.subtitle} · {openMix.tracks.length} tracks</p>
            </div>
            <button onClick={() => playQueue(openMix.tracks, 0, openMix.title)}
              aria-label={`Play ${openMix.title}`}
              className="btn-sauti w-12 h-12 rounded-full flex items-center justify-center shrink-0 ml-auto">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            {openMix.tracks.map((t, i) => (
              <WideRow key={t.id + i} title={t.title} subtitle={t.artist} meta={fmt(t.duration)}
                artwork={t.artwork} dominantColor={t.dominantColor}
                onClick={() => playQueue(openMix.tracks, i, openMix.title)}
                onPlay={() => playQueue(openMix.tracks, i, openMix.title)}
                playing={current?.id === t.id && isPlaying} />
            ))}
          </div>
        </div>
      ) : tab === 'foryou' ? (
        mixes === null ? (
          <div>
            <p className="text-sm text-zinc-400 flex items-center gap-2 mb-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Building your mixes…
            </p>
            <Shelf><CardSkeleton count={5} /></Shelf>
          </div>
        ) : mixes.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-white/10 rounded-xl px-6">
            <p className="text-sm text-zinc-400 mb-1">Not enough to go on yet.</p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              Mixes are built from what you like, follow and play. Like some songs on YouTube or play a
              few here, and they will appear — a mix made from three tracks would not be worth showing.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {mixes.map((m) => (
              <section key={m.id}>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-xl font-display font-bold text-white truncate">{m.title}</h3>
                    <p className="text-xs text-zinc-500">{m.subtitle}</p>
                  </div>
                  <button onClick={() => setOpenMix(m)}
                    className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white shrink-0">
                    Show all
                  </button>
                </div>
                <Shelf>
                  {m.tracks.slice(0, 12).map((t, i) => (
                    <ArtCard key={t.id + i} title={t.title} subtitle={t.artist}
                      artwork={t.artworkLarge || t.artwork} dominantColor={t.dominantColor}
                      playing={current?.id === t.id && isPlaying}
                      onClick={() => playQueue(m.tracks, i, m.title)}
                      onPlay={() => playQueue(m.tracks, i, m.title)} />
                  ))}
                </Shelf>
              </section>
            ))}
          </div>
        )
      ) : /* Artist detail — a channel's recent uploads */
      openArtist ? (
        <div>
          <button onClick={() => setOpenArtist(null)} className="text-xs font-bold text-sauti mb-4 hover:underline">← All artists</button>
          <div className="flex items-end gap-4 mb-5">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 shrink-0 relative">
              <CoverArt imageUrl={openArtist.c.thumbnail} rounded="" className="absolute inset-0 w-full h-full" />
            </div>
            <div className="min-w-0">
              <h3 className="text-2xl font-display font-bold text-white truncate">{openArtist.c.title}</h3>
              <p className="text-sm text-zinc-400">Latest uploads</p>
            </div>
            {openArtist.tracks?.length ? (
              <button onClick={() => playQueue(openArtist.tracks!, 0, openArtist.c.title)}
                aria-label={`Play ${openArtist.c.title}`}
                className="btn-sauti w-12 h-12 rounded-full flex items-center justify-center shrink-0 ml-auto">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </button>
            ) : null}
          </div>
          {openArtist.tracks === null ? (
            <p className="text-sm text-zinc-400 flex items-center gap-2 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : openArtist.tracks.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8">Nothing published on this channel yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-4">
              {openArtist.tracks.map((t, i) => (
                <WideRow key={t.id} title={t.title} subtitle={t.artist} meta={fmt(t.duration)}
                  artwork={t.artwork} dominantColor={t.dominantColor}
                  onClick={() => playQueue(openArtist.tracks!, i, openArtist.c.title)}
                  onPlay={() => playQueue(openArtist.tracks!, i, openArtist.c.title)}
                  playing={current?.id === t.id && isPlaying} />
              ))}
            </div>
          )}
        </div>
      ) : tab === 'artists' ? (
        artists === null ? (
          <Shelf><CardSkeleton count={6} /></Shelf>
        ) : artists.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center border border-dashed border-white/10 rounded-xl">
            You are not subscribed to any channels yet.
          </p>
        ) : (
          <>
            <ShelfHeader>{artists.length} channel{artists.length === 1 ? '' : 's'}</ShelfHeader>
            <div className="flex flex-wrap gap-1">
              {artists.map((c) => (
                <ArtCard key={c.id} title={c.title} artwork={c.thumbnail} round
                  onClick={() => openArtistPage(c)} />
              ))}
            </div>
          </>
        )
      ) : /* Playlist detail */
      openList ? (
        <div>
          <button onClick={() => setOpenList(null)} className="text-xs font-bold text-sauti mb-4 hover:underline">← All playlists</button>
          <div className="flex items-end gap-4 mb-5">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative">
              <CoverArt imageUrl={openList.p.thumbnail} rounded="" className="absolute inset-0 w-full h-full" />
            </div>
            <div className="min-w-0">
              <h3 className="text-2xl font-display font-bold text-white truncate">{openList.p.title}</h3>
              <p className="text-sm text-zinc-400">{openList.p.trackCount} items</p>
            </div>
            {openList.tracks?.length ? (
              <button onClick={() => playQueue(openList.tracks!, 0, openList.p.title)}
                className="btn-sauti w-12 h-12 rounded-full flex items-center justify-center shrink-0 ml-auto">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </button>
            ) : null}
          </div>
          {openList.tracks === null ? (
            <p className="text-sm text-zinc-400 flex items-center gap-2 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-4">
              {openList.tracks.map((t, i) => (
                <WideRow key={t.id} title={t.title} subtitle={t.artist} meta={fmt(t.duration)}
                  artwork={t.artwork} dominantColor={t.dominantColor}
                  onClick={() => playQueue(openList.tracks!, i, openList.p.title)}
                  onPlay={() => playQueue(openList.tracks!, i, openList.p.title)}
                  playing={current?.id === t.id && isPlaying} />
              ))}
            </div>
          )}
        </div>
      ) : tab === 'playlists' ? (
        playlists === null ? (
          <Shelf><CardSkeleton count={6} /></Shelf>
        ) : playlists.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center border border-dashed border-white/10 rounded-xl">
            No playlists on this account yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {playlists.map((p) => (
              <ArtCard key={p.id} title={p.title} subtitle={`${p.trackCount} items`}
                artwork={p.thumbnail} onClick={() => openPlaylist(p)} />
            ))}
          </div>
        )
      ) : rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500 py-10 text-center border border-dashed border-white/10 rounded-xl">
          {tab === 'music'
            ? 'Nothing in your liked list is tagged as music yet. Liked videos still appear under YouTube.'
            : 'Nothing liked on this account yet.'}
        </p>
      ) : (
        <>
          <ShelfHeader>{TABS.find((t) => t.id === tab)?.blurb}</ShelfHeader>
          <div className="grid sm:grid-cols-2 gap-x-4">
            {rows.map((t, i) => (
              <WideRow key={t.id} title={t.title} subtitle={t.artist} meta={fmt(t.duration)}
                artwork={t.artwork} dominantColor={t.dominantColor}
                onClick={() => playQueue(rows, i, tab === 'music' ? 'Liked music' : 'Liked videos')}
                onPlay={() => playQueue(rows, i, tab === 'music' ? 'Liked music' : 'Liked videos')}
                playing={current?.id === t.id && isPlaying} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
