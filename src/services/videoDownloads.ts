import { Capacitor } from '@capacitor/core';

/**
 * Movie / series downloads.
 *
 * WHAT THIS USED TO DO, AND WHY IT IS GONE: the original implementation never
 * downloaded a movie at all. It fetched a Big Buck Bunny sample or, when that
 * failed, drew a 2-second "SAHRAE · OFFLINE PLAYER" animation on a canvas with
 * MediaRecorder, stored that in IndexedDB, and reported "Downloaded". Every
 * download therefore played a placeholder clip instead of the film.
 *
 * HOW A REAL FILE ARRIVES
 * The provider's page is opened in the app, the viewer taps its download button,
 * and the WebView's DownloadListener hands the resulting file to DownloadStore →
 * the app's own directory (Android/data/<pkg>/files/Download) → listed here
 * through the /__dl* bridge.
 *
 * WHY THAT TAP CANNOT BE AUTOMATED
 * VidVault gates its downloads behind Cloudflare Turnstile — a bot check. Making
 * the app solve or slip past it would be circumventing an access control, which
 * the project's own constraints rule out. So the tap stays manual and honest;
 * everything after it is native. That single interaction is the entire
 * difference between this and Netflix's flow, and it is not a gap that can be
 * closed with cleverness.
 *
 * ON THE WEB there is no capture path at all — a browser cannot intercept a
 * cross-origin download into app storage — so the list is empty there and the UI
 * says why. That is a real platform limit, not something to paper over.
 */

/**
 * Every state a download can actually be in.
 *
 * `paused` is not a button the viewer pressed — DownloadManager parks a job
 * itself when the network drops or when Wi-Fi-only is on and the device is on
 * mobile data, and resumes it unaided. Saying "Waiting for Wi-Fi" is therefore
 * a status, not a prompt, and the UI must not offer a resume control that would
 * do nothing.
 */
export type DownloadState = 'queued' | 'running' | 'paused' | 'done' | 'failed';

export interface VideoDownloadItem {
  /** DownloadManager id, as a string. */
  id: string;
  title: string;
  /** Absolute path of the saved file inside the app's own storage. */
  file: string;
  mime: string;
  /** Epoch ms when the download was queued. */
  timestamp: number;
  state: DownloadState;
  /** Human-readable explanation, present when paused or failed. */
  reason?: string;
  /** Bytes fetched so far. */
  bytes: number;
  /** Total size, or 0 while the server has not declared one. */
  total: number;
  /** True only when the file is on disk and playable. */
  done: boolean;

  /** Content identity, when the download was started from a title in the app. */
  tmdbId?: number;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  /** TMDB poster path, for artwork on the Downloads shelf. */
  poster?: string;
  /** Series name, so episodes can be grouped under the show. */
  show?: string;
}

export interface DownloadStats {
  /** Bytes on disk, measured from the filesystem rather than recorded sizes. */
  used: number;
  /** Space left on the volume the downloads live on. */
  free: number;
  done: number;
  active: number;
  failed: number;
  wifiOnly: boolean;
}

/** What the app stages before a download starts, so the file arrives identified. */
export interface PendingMeta {
  title: string;
  tmdbId?: number;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  poster?: string;
  show?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((l) => {
    try { l(); } catch (e) { console.error(e); }
  });
}

export const isNativeDownloadSupported = () => Capacitor.isNativePlatform();

/** Fraction complete, 0..1. Returns 0 rather than NaN before a size is known. */
export function progressOf(item: VideoDownloadItem): number {
  if (item.state === 'done') return 1;
  if (!item.total || item.total <= 0) return 0;
  return Math.max(0, Math.min(1, item.bytes / item.total));
}

/** Bytes as something a person reads, not a number they decode. */
export function formatBytes(b: number): string {
  if (!b || b < 0) return '0 MB';
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}

/**
 * One line describing where a download has got to.
 *
 * The status line is the only thing most viewers will read, so it carries the
 * reason when there is one. "Downloading" on a job that has been stalled for an
 * hour because the phone is on mobile data is a lie by omission.
 */
export function statusLabel(item: VideoDownloadItem): string {
  switch (item.state) {
    case 'done': return item.total ? `Saved · ${formatBytes(item.total)}` : 'Saved in the app';
    case 'failed': return item.reason || 'Download failed';
    case 'paused': return item.reason || 'Paused';
    case 'queued': return 'Waiting to start';
    case 'running': {
      const pct = Math.round(progressOf(item) * 100);
      if (!item.total) return 'Starting…';
      return `${pct}% · ${formatBytes(item.bytes)} of ${formatBytes(item.total)}`;
    }
    default: return '';
  }
}

/** Episodes belong under their show; films stand alone. */
export function groupKey(item: VideoDownloadItem): string {
  if (item.type === 'tv' && (item.show || item.tmdbId)) return `tv:${item.tmdbId || item.show}`;
  return `one:${item.id}`;
}

async function bridge(path: string): Promise<Response | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await fetch(`https://localhost${path}`, { cache: 'no-store' });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

function parseItem(o: any): VideoDownloadItem {
  const state: DownloadState =
    ['queued', 'running', 'paused', 'done', 'failed'].includes(o?.state)
      ? o.state
      // An older native build predates `state` and only sent `done`.
      : (o?.done ? 'done' : 'queued');
  return {
    id: String(o?.id ?? ''),
    title: o?.title || 'Download',
    file: o?.file || '',
    mime: o?.mime || 'video/mp4',
    timestamp: Number(o?.ts) || 0,
    state,
    reason: o?.reason || undefined,
    bytes: Number(o?.bytes) || 0,
    total: Number(o?.total) || 0,
    done: state === 'done',
    tmdbId: Number.isFinite(Number(o?.tmdbId)) && Number(o?.tmdbId) > 0 ? Number(o.tmdbId) : undefined,
    type: o?.type === 'tv' || o?.type === 'movie' ? o.type : undefined,
    season: Number(o?.season) > 0 ? Number(o.season) : undefined,
    episode: Number(o?.episode) > 0 ? Number(o.episode) : undefined,
    poster: o?.poster || undefined,
    show: o?.show || undefined,
  };
}

export const videoDownloads = {
  subscribe: (fn: Listener) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Real downloads captured by the Android shell. Empty array on the web. */
  list: async (): Promise<VideoDownloadItem[]> => {
    const r = await bridge('/__dllist');
    if (!r) return [];
    try {
      const rows = await r.json();
      if (!Array.isArray(rows)) return [];
      return rows
        .map(parseItem)
        .filter((i) => i.id)
        // Active work first — it is the only thing that changes while you watch.
        .sort((a, b) => {
          const rank = (x: VideoDownloadItem) => (x.state === 'running' || x.state === 'paused' || x.state === 'queued' ? 0 : x.state === 'failed' ? 1 : 2);
          return rank(a) - rank(b) || b.timestamp - a.timestamp;
        });
    } catch {
      return [];
    }
  },

  stats: async (): Promise<DownloadStats> => {
    const empty: DownloadStats = { used: 0, free: 0, done: 0, active: 0, failed: 0, wifiOnly: false };
    const r = await bridge('/__dlstats');
    if (!r) return empty;
    try {
      const o = await r.json();
      return {
        used: Number(o?.used) || 0,
        free: Number(o?.free) || 0,
        done: Number(o?.done) || 0,
        active: Number(o?.active) || 0,
        failed: Number(o?.failed) || 0,
        wifiOnly: !!o?.wifiOnly,
      };
    } catch {
      return empty;
    }
  },

  /**
   * Playable source for a saved file. Capacitor maps the app's own files onto an
   * https://localhost/_capacitor_file_ origin the WebView is allowed to read.
   */
  localSrc: (item: VideoDownloadItem): string | null => {
    if (item.state !== 'done' || !item.file) return null;
    try {
      return Capacitor.convertFileSrc(item.file);
    } catch {
      return null;
    }
  },

  /**
   * Stage what the next captured download is, immediately before starting it.
   *
   * Native side expires this after five minutes: without that, opening a title,
   * tapping Download, then backing out without downloading left the name sitting
   * there to attach itself to whatever downloaded next — labelling one film with
   * another's title.
   */
  setPendingMeta: async (meta: PendingMeta): Promise<void> => {
    if (!Capacitor.isNativePlatform() || !meta?.title) return;
    await bridge(`/__dlmeta?m=${encodeURIComponent(JSON.stringify(meta))}`);
  },

  /** Kept for callers that only have a title. */
  setPendingTitle: async (title: string): Promise<void> => {
    if (!title) return;
    await videoDownloads.setPendingMeta({ title });
  },

  retry: async (id: string): Promise<void> => {
    await bridge(`/__dlretry?id=${encodeURIComponent(id)}`);
    emitChange();
  },

  remove: async (id: string): Promise<void> => {
    await bridge(`/__dlremove?id=${encodeURIComponent(id)}`);
    emitChange();
  },

  setWifiOnly: async (on: boolean): Promise<void> => {
    await bridge(`/__dlwifi?on=${on ? '1' : '0'}`);
    emitChange();
  },

  totalBytesUsed: async (): Promise<number> => (await videoDownloads.stats()).used,
};
