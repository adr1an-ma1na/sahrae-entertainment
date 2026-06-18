import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { setDownloadTitle } from '../services/videoDownloads';

/**
 * In-app download browser. Loads the download provider page in an iframe so the
 * WebView's native DownloadListener captures the file into the app's private
 * Downloads (not the device file manager). The user taps the page's download
 * button; the file then appears under Downloads → Movies & Series, playable
 * offline in-app.
 */
export default function MovieDownloadModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => { setDownloadTitle(title); }, [url, title]);

  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
        <span className="w-9 h-9 rounded-xl bg-sauti flex items-center justify-center shrink-0"><Download className="w-5 h-5 text-amber-950" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm truncate">Download · {title}</p>
          <p className="text-[11px] text-zinc-400 leading-tight">Tap the page's download button — it saves into your in-app Downloads.</p>
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
