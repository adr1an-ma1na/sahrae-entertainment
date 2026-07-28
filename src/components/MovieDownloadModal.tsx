import { X, Download, ExternalLink, Info } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

/**
 * Real download screen (VidVault).
 *
 * There is no way to fabricate a movie file, and the AI-Studio export's attempt
 * to — a canvas "SAHRAE OFFLINE PLAYER" placeholder saved to IndexedDB — is what
 * this replaces. Instead we load VidVault, the actual download provider, and let
 * the real file come down:
 *
 *  • Android app: some VidVault buttons download straight from the WebView,
 *    which the native DownloadListener catches → DownloadStore → the app's own
 *    private storage (Android/data/<pkg>/files/Download), listed in Downloads.
 *    Others fire the file via a popup/blob that the app blocks as an ad defense,
 *    so "Open in app storage" hands the page to the hardened /__openext bridge
 *    (VidVault-only) which the native layer captures.
 *
 *  • Web PWA: the browser cannot capture a cross-origin file, so "Open to
 *    download" opens VidVault in a new tab where the browser's own download
 *    handles it (the file lands in the device's Downloads, not in-app — that is
 *    a hard browser limit, surfaced honestly below).
 */
export default function MovieDownloadModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const native = Capacitor.isNativePlatform();

  const openExternally = () => {
    if (native) {
      // Hardened bridge: the native side only honours an allow-listed download
      // host (vidvault.ru). Failure is silent — the iframe below still works.
      try { fetch(`https://localhost/__openext?url=${encodeURIComponent(url)}`, { cache: 'no-store' }).catch(() => {}); } catch { /* ignore */ }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[140] bg-black flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2.5 glass">
        <span className="w-9 h-9 rounded-xl bg-sauti flex items-center justify-center shrink-0"><Download className="w-5 h-5 text-amber-950" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-white font-bold text-sm truncate">Download · {title}</p>
          <p className="text-[11px] text-zinc-400 leading-tight">
            Tap a download button on the page below.{' '}
            {native
              ? <>If it doesn't start, use <span className="text-sauti font-semibold">Open in app storage</span>.</>
              : <>If it doesn't start, use <span className="text-sauti font-semibold">Open to download</span>.</>}
          </p>
        </div>
        <button onClick={openExternally} tabIndex={0} data-tv-focusable className="btn-sauti px-3.5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0" aria-label={native ? 'Open in app storage' : 'Open to download'}>
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">{native ? 'Open in app storage' : 'Open to download'}</span>
          <span className="sm:hidden">Open</span>
        </button>
        <button onClick={onClose} data-tv-close tabIndex={0} data-tv-focusable className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      {!native && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-[11px] leading-snug">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>On the web the file saves to <b>this device's Downloads</b>, not inside the app. For downloads that live inside the app, use the Sahrae Android app.</span>
        </div>
      )}

      <iframe
        src={url}
        title="Download"
        className="flex-1 w-full bg-black border-0"
        allow="encrypted-media; autoplay"
      />
    </div>
  );
}
