import { Home, Search, Music2, Radio, Film, Tv2, Clapperboard, Trophy, Heart, Clock, Download, Library, type LucideIcon } from 'lucide-react';

/**
 * Desktop left sidebar (Spotify-style). Visible on lg+; the BottomTabBar takes
 * over on smaller screens. Drives the same activeTab routing as before — it only
 * replaces the navigation chrome. Fixed to the left; the app shell pads main
 * content by its width on lg+.
 */
const PRIMARY = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
];
const BROWSE = [
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: Tv2 },
  { id: 'tv', label: 'Live TV', icon: Radio },
  { id: 'sports', label: 'Live Sports', icon: Trophy },
  { id: 'channels', label: 'Flow Channels', icon: Clapperboard },
];
const LIBRARY = [
  { id: 'music', label: 'Sauti', icon: Music2 },
  { id: 'audio', label: 'Radio', icon: Radio },
  { id: 'mylist', label: 'My List', icon: Heart },
  { id: 'continue', label: 'Continue Watching', icon: Clock },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

function NavItem({ id, label, Icon, active, onClick }: { id: string; label: string; Icon: LucideIcon; active: boolean; onClick: (id: string) => void }) {
  return (
    <button onClick={() => onClick(id)} tabIndex={0} data-tv-focusable
      className={`w-full flex items-center gap-3.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none ${
        active ? 'text-white bg-white/10' : 'text-zinc-400 hover:text-white'
      }`}>
      <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-sauti' : ''}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function Sidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) {
  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 glass border-r border-white/10 pt-[env(safe-area-inset-top)]">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-2xl font-black tracking-tighter cursor-pointer whitespace-nowrap" onClick={() => setActiveTab('home')}>
          <span className="text-gold">SAHRAE</span>
        </h1>
      </div>

      <nav className="px-3 space-y-1">
        {PRIMARY.map((t) => <NavItem key={t.id} id={t.id} label={t.label} Icon={t.icon} active={activeTab === t.id} onClick={setActiveTab} />)}
      </nav>

      <div className="mt-6 px-3 flex-1 overflow-y-auto custom-scrollbar pb-4">
        <div className="overline px-3 mb-1.5">Browse</div>
        <nav className="space-y-1 mb-5">
          {BROWSE.map((t) => <NavItem key={t.id} id={t.id} label={t.label} Icon={t.icon} active={activeTab === t.id} onClick={setActiveTab} />)}
        </nav>
        <div className="overline px-3 mb-1.5 flex items-center gap-2"><Library className="w-3.5 h-3.5" /> Your Library</div>
        <nav className="space-y-1">
          {LIBRARY.map((t) => <NavItem key={t.id} id={t.id} label={t.label} Icon={t.icon} active={activeTab === t.id} onClick={setActiveTab} />)}
        </nav>
      </div>
    </aside>
  );
}
