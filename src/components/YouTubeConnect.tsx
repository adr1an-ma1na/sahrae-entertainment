import { useCallback, useEffect, useState } from 'react';
import { Youtube, Loader2, Play, RefreshCw, LogOut, Music2, Video, ListMusic } from 'lucide-react';
import { youtubeService, API_DISABLED_HELP, KEY_BLOCKED_HELP, CREDENTIALS_URL, type YoutubePlaylist, type YoutubeUserProfile } from '../services/youtube';
import { getApiState, ENABLE_URL } from '../services/ytDataApi';
import { Track } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';
import { CoverArt } from './ui/CoverArt';
import { ShelfHeader, WideRow, ArtCard, Shelf, CardSkeleton } from './ui/Shelf';

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

type Tab = 'music' | 'videos' | 'playlists';

const TABS: { id: Tab; label: string; icon: typeof Music2; blurb: string }[] = [
  { id: 'music', label: 'YouTube Music', icon: Music2, blurb: 'Songs you have liked' },
  { id: 'videos', label: 'YouTube', icon: Video, blurb: 'Everything you have liked' },
  { id: 'playlists', label: 'Playlists', icon: ListMusic, blurb: 'Your saved playlists' },
];

const fmt = (s: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export default function YouTubeConnect() {
  const { playQueue, current, isPlaying } = useMusic();

  const [connected, setConnected] = useState(() => youtubeService.isConnected());
  const [profile, setProfile] = useState<YoutubeUserProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('music');
  const [music, setMusic] = useState<Track[] | null>(null);
  const [videos, setVideos] = useState<Track[] | null>(null);
  const [playlists, setPlaylists] = useState<YoutubePlaylist[] | null>(null);
  const [openList, setOpenList] = useState<{ p: YoutubePlaylist; tracks: Track[] | null } | null>(null);
  const [loading, setLoading] = useState(false);

  // Two different 403s with two different fixes. Naming the wrong one sends
  // someone to the wrong console page, which is how this was got wrong before.
  const state = getApiState();
  const apiOff = state === 'disabled';
  const keyBlocked = state === 'keyBlocked';

  const load = useCallback(async (which: Tab, force = false) => {
    if (!youtubeService.isConnected()) return;
    if (!force) {
      if (which === 'music' && music) return;
      if (which === 'videos' && videos) return;
      if (which === 'playlists' && playlists) return;
    }
    setLoading(true); setError(null);
    try {
      if (which === 'music') setMusic(await youtubeService.fetchLikedMusic());
      else if (which === 'videos') setVideos(await youtubeService.fetchLikedVideos());
      else setPlaylists(await youtubeService.fetchPlaylists());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that from YouTube.');
    } finally {
      setLoading(false);
    }
  }, [music, videos, playlists]);

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
    setMusic(null); setVideos(null); setPlaylists(null); setOpenList(null);
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
            <button key={t.id} onClick={() => { setTab(t.id); setOpenList(null); }} tabIndex={0} data-tv-focusable
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

      {/* Playlist detail */}
      {openList ? (
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
