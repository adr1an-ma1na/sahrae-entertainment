import { useEffect, useMemo, useState } from 'react';
import { Loader2, X, RefreshCw } from 'lucide-react';
import { youtubeService, type YoutubeChannel } from '../services/youtube';
import type { Track } from '../services/ytmusic';
import { useMusic } from '../hooks/useMusic';

/**
 * Connect's Home, laid out the way YouTube lays out its own: the channels you
 * subscribe to along the top, then their newest videos as a grid (thumbnail,
 * length, channel picture, title, views, how long ago), and a watch page with
 * the player, the video's details and what to watch next.
 *
 * What YouTube lets another app see of an account is the subscriptions, the
 * likes and the playlists; watch history, Watch Later and the personal home
 * feed are closed to everyone outside YouTube. So this Home is built from the
 * subscriptions: what YouTube's Subscriptions page shows.
 */
type Video = Track & { channelId: string; channelTitle: string };

const KEY = 'sahrae.yt.home.v1';
const TTL = 30 * 60_000;

function ago(ms?: number): string {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  const u: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [n, w] of u) if (s >= n) { const k = Math.floor(s / n); return `${k} ${w}${k > 1 ? 's' : ''} ago`; }
  return 'just now';
}
function views(n?: number): string {
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B views`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M views`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K views`;
  return `${n} views`;
}
const length = (s: number) => {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

function VideoCard({ v, avatar, onOpen }: { v: Video; avatar?: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} data-tv-focusable className="group text-left focus:outline-none">
      <span className="relative block aspect-video rounded-xl overflow-hidden bg-zinc-800 ring-1 ring-white/5 group-hover:ring-white/20 group-focus-visible:ring-2 group-focus-visible:ring-amber-400 transition-shadow">
        <img src={v.artworkLarge || v.artwork} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        {v.duration > 0 && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[11px] font-semibold text-[#fff] tabular">{length(v.duration)}</span>}
      </span>
      <span className="flex gap-3 mt-3">
        <span className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 shrink-0">{avatar && <img src={avatar} alt="" loading="lazy" className="w-full h-full object-cover" />}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white leading-snug line-clamp-2">{v.title}</span>
          <span className="block text-xs text-zinc-400 mt-1 truncate">{v.channelTitle}</span>
          <span className="block text-xs text-zinc-500 truncate">{[views(v.views), ago(v.uploaded)].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
    </button>
  );
}

function WatchPage({ v, avatarOf, next, onPick, onClose }: { v: Video; avatarOf: (id: string) => string | undefined; next: Video[]; onPick: (v: Video) => void; onClose: () => void }) {
  return (
    <div role="dialog" data-tv-layer className="lux-stage fixed inset-0 z-[110] overflow-y-auto bg-zinc-950 animate-in fade-in duration-200">
      <div className="max-w-[1500px] mx-auto px-4 md:px-8 pt-[calc(env(safe-area-inset-top)+1rem)] pb-16">
        <div className="flex justify-end mb-3">
          <button onClick={onClose} data-tv-close data-tv-focusable aria-label="Close" className="btn-glass w-11 h-11 rounded-full flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
          <div className="min-w-0">
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)]">
              <iframe key={v.id} src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} title={v.title}
                className="absolute inset-0 w-full h-full border-0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
            <h1 className="mt-4 text-xl md:text-2xl font-display font-bold text-white leading-snug">{v.title}</h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full overflow-hidden bg-zinc-700 shrink-0">{avatarOf(v.channelId) && <img src={avatarOf(v.channelId)} alt="" className="w-full h-full object-cover" />}</span>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{v.channelTitle}</p>
                <p className="text-xs text-zinc-400">{[views(v.views), ago(v.uploaded)].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          </div>
          <aside>
            <p className="lux-kicker mb-3">Up next</p>
            <div className="space-y-3">
              {next.slice(0, 20).map((n) => (
                <button key={n.id} onClick={() => onPick(n)} data-tv-focusable className="group w-full flex gap-3 text-left focus:outline-none rounded-xl p-1 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-amber-400">
                  <span className="relative w-40 shrink-0 aspect-video rounded-lg overflow-hidden bg-zinc-800">
                    <img src={n.artwork || n.artworkLarge} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    {n.duration > 0 && <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[10px] font-semibold text-[#fff] tabular">{length(n.duration)}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white leading-snug line-clamp-2">{n.title}</span>
                    <span className="block text-xs text-zinc-400 mt-1 truncate">{n.channelTitle}</span>
                    <span className="block text-xs text-zinc-500 truncate">{[views(n.views), ago(n.uploaded)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function YouTubeHome({ onOpenChannel }: { onOpenChannel: (c: YoutubeChannel) => void }) {
  const { isPlaying, toggle } = useMusic();
  const [subs, setSubs] = useState<YoutubeChannel[] | null>(null);
  const [feed, setFeed] = useState<Video[] | null>(null);
  const [watching, setWatching] = useState<Video | null>(null);
  const [error, setError] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const kept = JSON.parse(localStorage.getItem(KEY) || 'null') as { at: number; subs: YoutubeChannel[]; feed: Video[] } | null;
        if (!bump && kept && Date.now() - kept.at < TTL) { setSubs(kept.subs); setFeed(kept.feed); return; }
      } catch { /* nothing kept */ }
      try {
        setError(false);
        const s = await youtubeService.fetchSubscriptions(100);
        if (!live) return;
        setSubs(s);
        // The newest from the channels: what YouTube's Subscriptions page shows.
        const top = s.slice(0, 18);
        const lists = await Promise.all(top.map((c) => youtubeService.fetchChannelUploads(c.id, 6)
          .then((ts) => ts.map((t) => ({ ...t, channelId: c.id, channelTitle: c.title }) as Video))
          .catch(() => [] as Video[])));
        if (!live) return;
        const all = lists.flat().filter((v) => !v.duration || v.duration >= 60).sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0)).slice(0, 60);
        setFeed(all);
        try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), subs: s, feed: all })); } catch { /* storage full */ }
      } catch { if (live) setError(true); }
    })();
    return () => { live = false; };
  }, [bump]);

  const avatars = useMemo(() => new Map((subs || []).map((c) => [c.id, c.thumbnail])), [subs]);
  const open = (v: Video) => { if (isPlaying) toggle(); setWatching(v); };

  return (
    <div>
      {subs && subs.length > 0 && (
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 mb-4">
          {subs.slice(0, 30).map((c) => (
            <button key={c.id} onClick={() => onOpenChannel(c)} data-tv-focusable className="group shrink-0 w-[76px] text-center focus:outline-none">
              <span className="block w-16 h-16 mx-auto rounded-full overflow-hidden bg-zinc-700 ring-2 ring-transparent group-hover:ring-white/30 group-focus-visible:ring-amber-400 transition-shadow">
                {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </span>
              <span className="block mt-1.5 text-[11px] text-zinc-300 truncate">{c.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="lux-h text-xl md:text-2xl">Latest from your subscriptions</h2>
        <button onClick={() => setBump((b) => b + 1)} aria-label="Refresh" data-tv-focusable className="lux-arrow inline-flex"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {error ? (
        <p className="text-sm text-zinc-400 py-8">YouTube did not answer. Try Refresh in a moment.</p>
      ) : !feed ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}><div className="skeleton aspect-video rounded-xl" /><div className="skeleton h-3 rounded mt-3 w-4/5" /><div className="skeleton h-3 rounded mt-2 w-2/5" /></div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <p className="text-sm text-zinc-400 py-8">{subs?.length ? 'Your channels have not posted lately.' : 'Subscribe to channels on YouTube and their videos appear here.'}</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
          {feed.map((v) => <VideoCard key={v.id} v={v} avatar={avatars.get(v.channelId)} onOpen={() => open(v)} />)}
        </div>
      )}
      {!feed && !error && <div className="flex justify-center mt-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>}

      {watching && (
        <WatchPage v={watching} avatarOf={(id) => avatars.get(id)} next={(feed || []).filter((x) => x.id !== watching.id)}
          onPick={(v) => setWatching(v)} onClose={() => setWatching(null)} />
      )}
    </div>
  );
}
