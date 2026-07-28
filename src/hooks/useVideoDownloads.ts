import { useEffect, useState } from 'react';
import { videoDownloads, VideoDownloadItem, isNativeDownloadSupported } from '../services/videoDownloads';

export function useVideoDownloads() {
  const [downloadedVideos, setDownloadedVideos] = useState<VideoDownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setDownloadedVideos(await videoDownloads.list());
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) refresh(); };
    run();
    const unsubscribe = videoDownloads.subscribe(run);
    // DownloadManager progresses outside the WebView, so poll while the screen is
    // open to move items from "downloading" to "ready" without a manual refresh.
    const timer = isNativeDownloadSupported() ? setInterval(run, 4000) : null;
    return () => {
      alive = false;
      unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, []);

  return {
    downloadedVideos,
    loading,
    supported: isNativeDownloadSupported(),
    removeDownload: videoDownloads.remove,
    localSrc: videoDownloads.localSrc,
    refresh,
  };
}
