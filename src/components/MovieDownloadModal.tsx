import { X, Download } from 'lucide-react';

/**
 * In-app download browser. Loads the download provider page in an iframe; when the
 * user taps the page's own download button, the WebView hands the file to the
 * Android system DownloadManager, which saves it to the device's public Downloads
 * (file manager), exactly like a normal browser download.
 */
export default function MovieDownloadModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
        <span className="w-9 h-9 rounded-xl bg-sauti flex items-center justify-center shrink-0"><Download className="w-5 h-5 text-amber-950" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm truncate">Download · {title}</p>
          <p className="text-[11px] text-zinc-400 leading-tight">Tap the page's download button — it saves to your device's Downloads.</p>
        </div>
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
