import { useEffect, useState } from 'react';
import { videoDownloads, VideoDownloadItem } from '../services/videoDownloads';

export function useVideoDownloads() {
  const [downloadedVideos, setDownloadedVideos] = useState<VideoDownloadItem[]>([]);
  const [totalUsedBytes, setTotalUsedBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const list = await videoDownloads.list();
    const bytes = await videoDownloads.totalBytesUsed();
    setDownloadedVideos(list);
    setTotalUsedBytes(bytes);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const unsubscribe = videoDownloads.subscribe(() => {
      refresh();
    });
    return unsubscribe;
  }, []);

  return {
    downloadedVideos,
    totalUsedBytes,
    loading,
    startDownload: videoDownloads.download,
    cancelDownload: videoDownloads.cancel,
    removeDownload: videoDownloads.remove,
    getLocalPlayableUrl: videoDownloads.localUrl,
    refresh
  };
}
