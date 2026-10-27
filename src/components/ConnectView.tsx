import { Youtube } from 'lucide-react';
import ListenTabs from './ListenTabs';
import { LuxHeader, LuxGlow } from './ui/Lux';
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
      <LuxGlow />
      <LuxHeader kicker={<><Youtube className="w-3.5 h-3.5" /> Sahrae · Listen</>} title="Connect"
        meta={<span>Your YouTube library, inside Sahrae</span>} />
      <ListenTabs active="connect" onNav={onNav ?? (() => {})} />
      <YouTubeConnect />
    </div>
  );
}
