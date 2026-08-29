import { Youtube } from 'lucide-react';
import ListenTabs from './ListenTabs';
import YouTubeConnect from './YouTubeConnect';

/**
 * The Listen hub's Connect destination.
 *
 * Page chrome plus the shared audio-type switcher, wrapping the YouTube
 * connection. Sits inside Listen rather than in Settings because what it
 * produces is a library you listen to, and that is where someone looks for it.
 */
export default function ConnectView({ onNav }: { onNav?: (tab: string) => void }) {
  return (
    <div className="pt-[calc(env(safe-area-inset-top)+7.5rem)] md:pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-40 relative">
      <div aria-hidden className="pointer-events-none absolute -top-10 left-0 right-0 h-64 -z-10 opacity-70"
        style={{ background: 'radial-gradient(60% 70% at 12% 0%, rgba(239,68,68,0.18), transparent 70%), radial-gradient(50% 60% at 80% 10%, rgba(245,158,11,0.12), transparent 72%)', filter: 'blur(8px)' }} />
      <div className="overline mb-1.5">Sahrae · Listen</div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-500 via-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-600/25">
          <Youtube className="w-6 h-6 text-white fill-current" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-bold text-white leading-tight tracking-tight">Connect</h2>
          <p className="text-sm text-zinc-400">Your YouTube library, inside Sahrae</p>
        </div>
      </div>
      <ListenTabs active="connect" onNav={onNav ?? (() => {})} />
      <YouTubeConnect />
    </div>
  );
}
