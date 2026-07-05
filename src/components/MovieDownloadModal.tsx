import { X, Download, ExternalLink } from 'lucide-react';

/**
 * In-app download screen. Loads the download provider page in an iframe. Some
 * providers download straight from the WebView (caught by the native
 * DownloadListener → Android DownloadManager → device Downloads). Others trigger
 * the file via a popup/blob, which the app blocks app-wide as an ad defense — so
 * the prominent "Open in browser" action hands the page to Chrome, where every
 * download mechanism works and the file lands in the device's Downloads.
 */
export default function MovieDownloadModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const openInBrowser = () => {
    try { fetch(`https://localhost/__openext?url=${encodeURIComponent(url)}`, { cache: 'no-store' }).catch(() => {}); } catch { /* ignore */ }
  };
  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
        <span className="w-9 h-9 rounded-xl bg-sauti flex items-center justify-center shrink-0"><Download className="w-5 h-5 text-amber-950" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm truncate">Download · {title}</p>
          <p className="text-[11px] text-zinc-400 leading-tight">Tap a download button below. If it doesn't start, use <span className="text-sauti font-semibold">Open in browser</span>.</p>
        </div>
        <button onClick={openInBrowser} tabIndex={0} data-tv-focusable className="btn-sauti px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0" aria-label="Open in browser to download">
          <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Open in browser</span><span className="sm:hidden">Browser</span>
        </button>
        <button onClick={onClose} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>
      <iframe
        src={url}
        title="Download"
        className="flex-1 w-full bg-black border-0"
        allow="encrypted-media; autoplay"
      />
    </div>
  );
}
