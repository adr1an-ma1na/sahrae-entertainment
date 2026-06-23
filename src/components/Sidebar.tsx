import { Home, Search, Music2, Radio, Film, Tv2, Clapperboard, Trophy, Heart, Clock, Download, Library, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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

export default function Sidebar({ activeTab, setActiveTab, collapsed = false, onToggle }: { activeTab: string; setActiveTab: (t: string) => void; collapsed?: boolean; onToggle?: () => void }) {
  const renderNav = (items: { id: string; label: string; icon: typeof Home }[]) =>
    items.map((t) => {
      const Icon = t.icon;
      const active = activeTab === t.id;
      return (
        <button key={t.id} onClick={() => setActiveTab(t.id)} tabIndex={0} data-tv-focusable
          className={`w-full flex items-center gap-3.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none ${
            active ? 'text-white bg-white/10' : 'text-zinc-400 hover:text-white'
          }`}>
          <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-sauti' : ''}`} />
          <span className="truncate">{t.label}</span>
        </button>
      );
    });

  return (
    <>
      {/* Reveal button — only on lg+ and only while the sidebar is hidden. */}
      {collapsed && (
        <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-label="Show sidebar"
          className="hidden lg:flex fixed top-[calc(env(safe-area-inset-top)+0.6rem)] left-3 z-50 w-10 h-10 items-center justify-center rounded-full glass border border-white/10 text-white hover:text-sauti shadow-lg">
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 glass border-r border-white/10 pt-[env(safe-area-inset-top)] transition-transform duration-300 ${collapsed ? '-translate-x-full' : 'translate-x-0'}`}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter cursor-pointer whitespace-nowrap" onClick={() => setActiveTab('home')}>
            <span className="text-gold">SAHRAE</span>
          </h1>
          <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-label="Hide sidebar"
            className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 space-y-1">{renderNav(PRIMARY)}</nav>

        <div className="mt-6 px-3 flex-1 overflow-y-auto custom-scrollbar pb-4">
          <div className="overline px-3 mb-1.5">Browse</div>
          <nav className="space-y-1 mb-5">{renderNav(BROWSE)}</nav>
          <div className="overline px-3 mb-1.5 flex items-center gap-2"><Library className="w-3.5 h-3.5" /> Your Library</div>
          <nav className="space-y-1">{renderNav(LIBRARY)}</nav>
        </div>
      </aside>
    </>
  );
}
