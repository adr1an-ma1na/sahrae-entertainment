import { useCallback, useEffect, useRef, useState } from 'react';
import {
  videoDownloads, VideoDownloadItem, DownloadStats, isNativeDownloadSupported,
} from '../services/videoDownloads';

const IDLE: DownloadStats = { used: 0, free: 0, done: 0, active: 0, failed: 0, wifiOnly: false };

/**
 * Polling rates.
 *
 * DownloadManager runs outside the WebView and cannot push, so progress has to
 * be pulled. Two rates rather than one: a download in flight needs a bar that
 * visibly moves, while a shelf of finished films changes only when the viewer
 * does something — and polling that every second would burn battery to redraw
 * identical pixels.
 */
const ACTIVE_MS = 1200;
const IDLE_MS = 8000;

export function useVideoDownloads() {
  const [downloadedVideos, setDownloadedVideos] = useState<VideoDownloadItem[]>([]);
  const [stats, setStats] = useState<DownloadStats>(IDLE);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const [list, s] = await Promise.all([videoDownloads.list(), videoDownloads.stats()]);
    if (!alive.current) return;
    setDownloadedVideos(list);
    setStats(s);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => {
    alive.current = true;

    /**
     * Reschedules itself at a rate matching what is happening, and only while
     * the screen is actually visible — a phone in a pocket has no use for a
     * progress bar, and DownloadManager keeps working whether or not anyone is
     * asking it questions.
     */
    const tick = async () => {
      if (!alive.current) return;
      const list = document.hidden ? downloadedVideos : await refresh();
      if (!alive.current) return;
      const busy = (list || []).some((i) => i.state === 'running' || i.state === 'queued' || i.state === 'paused');
      if (!isNativeDownloadSupported()) return; // nothing to poll on the web
      timer.current = setTimeout(tick, busy && !document.hidden ? ACTIVE_MS : IDLE_MS);
    };

    void tick();
    const unsubscribe = videoDownloads.subscribe(() => { void refresh(); });
    // Coming back to the app should show the truth immediately, not after a tick.
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive.current = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const act = useCallback(async (fn: (id: string) => Promise<void>, id: string) => {
    await fn(id);
    await refresh();
  }, [refresh]);

  return {
    downloadedVideos,
    stats,
    loading,
    supported: isNativeDownloadSupported(),
    removeDownload: (id: string) => act(videoDownloads.remove, id),
    retryDownload: (id: string) => act(videoDownloads.retry, id),
    setWifiOnly: async (on: boolean) => { await videoDownloads.setWifiOnly(on); await refresh(); },
    localSrc: videoDownloads.localSrc,
    refresh,
  };
}
