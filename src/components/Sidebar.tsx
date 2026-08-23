import { Home, Search, Headphones, Radio, Film, Tv2, Clapperboard, Trophy, Heart, Clock, Download, Library, PanelLeftClose, PanelLeftOpen, Music2, Mic2 } from 'lucide-react';

/**
 * Left navigation, grouped Watch / Listen / Library.
 * - Phone (<md): hidden; the BottomTabBar takes over.
 * - Tablet (md–lg): a compact icon rail (w-16), so the big canvas isn't wasted on
 *   a phone-style bottom bar.
 * - Laptop / TV (lg+): the full labelled sidebar, collapsible to reveal button.
 * The app shell pads main content by the sidebar/rail width at each breakpoint.
 */
const PRIMARY = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
];
const WATCH = [
  { id: 'movies', label: 'Movies', icon: Film },
  { id: 'series', label: 'Series', icon: Tv2 },
  { id: 'tv', label: 'Live TV', icon: Radio },
  { id: 'sports', label: 'Live Sports', icon: Trophy },
  { id: 'channels', label: 'Flow Channels', icon: Clapperboard },
];
const LISTEN = [
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'podcasts', label: 'Podcasts', icon: Mic2 },
  { id: 'audio', label: 'Radio', icon: Headphones },
];
const LIBRARY = [
  { id: 'mylist', label: 'My List', icon: Heart },
  { id: 'continue', label: 'Continue Watching', icon: Clock },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

type NavItem = { id: string; label: string; icon: typeof Home };

export default function Sidebar({ activeTab, setActiveTab, collapsed = false, onToggle }: { activeTab: string; setActiveTab: (t: string) => void; collapsed?: boolean; onToggle?: () => void }) {
  const renderNav = (items: NavItem[]) =>
    items.map((t) => {
      const Icon = t.icon;
      // Each Listen destination is its own row now, so each matches only itself.
      // (It used to light "Listen" for any audio tab, because there was only one.)
      const active = activeTab === t.id;
      return (
        <button key={t.id} onClick={() => setActiveTab(t.id)} tabIndex={0} data-tv-focusable
          className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all focus:outline-none ${
            active
              ? 'text-white shadow-[inset_-3px_-3px_7px_rgba(255,255,255,0.04),inset_4px_4px_10px_rgba(0,0,0,0.5)]'
              : 'text-zinc-400 hover:text-white shadow-[-3px_-3px_6px_rgba(255,255,255,0.03),3px_3px_8px_rgba(0,0,0,0.4)] hover:shadow-[-2px_-2px_5px_rgba(255,255,255,0.05),3px_3px_9px_rgba(0,0,0,0.5)]'
          }`}>
          {/* Active state is shown by the inset "pressed" shadow and white text
              only. The icon used to flip to gold (text-sauti) on selection,
              which read as the sidebar changing colour every time you clicked
              it. The affordance stays; the hue shift does not. */}
          <Icon className="w-5 h-5 shrink-0" />
          <span className="truncate">{t.label}</span>
        </button>
      );
    });

  // Compact icon button for the tablet rail (label as a hover/focus tooltip).
  const railBtn = (t: NavItem) => {
    const Icon = t.icon;
    const active = activeTab === t.id;
    return (
      <button key={t.id} onClick={() => setActiveTab(t.id)} tabIndex={0} data-tv-focusable title={t.label} aria-label={t.label}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all focus:outline-none ${
          active
            ? 'text-white shadow-[inset_-3px_-3px_7px_rgba(255,255,255,0.04),inset_4px_4px_10px_rgba(0,0,0,0.5)]'
            : 'text-zinc-400 hover:text-white shadow-[-3px_-3px_6px_rgba(255,255,255,0.03),3px_3px_8px_rgba(0,0,0,0.4)]'
        }`}>
        <Icon className="w-5 h-5" />
      </button>
    );
  };
  const railDivider = <div className="w-6 h-px bg-white/10 my-1.5 shrink-0" />;

  return (
    <>
      {/* Tablet icon rail (md–lg) */}
      <aside className="tv-rail hidden md:flex lg:hidden flex-col items-center fixed left-0 top-0 bottom-0 w-16 z-40 glass sidebar-glass border-r border-white/12 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 overflow-y-auto scrollbar-hide">
        <button onClick={() => setActiveTab('home')} aria-label="Sahrae home"
          className="w-10 h-10 mb-2 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center font-black text-white text-lg shrink-0">S</button>
        <div className="flex flex-col items-center gap-1">{PRIMARY.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{WATCH.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{LISTEN.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{LIBRARY.map(railBtn)}</div>
      </aside>

      {/* Reveal button — only on lg+ and only while the full sidebar is hidden. */}
      {collapsed && (
        <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-label="Show sidebar"
          className="hidden lg:flex fixed top-[calc(env(safe-area-inset-top)+0.6rem)] left-3 z-50 w-10 h-10 items-center justify-center rounded-full glass border border-white/10 text-white hover:text-sauti shadow-lg">
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Full labelled sidebar (lg+) */}
      <aside className={`tv-full hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 glass sidebar-glass border-r border-white/15 shadow-[inset_-1px_0_0_rgba(255,255,255,0.12),12px_0_48px_rgba(0,0,0,0.45)] pt-[env(safe-area-inset-top)] transition-transform duration-300 ${collapsed ? '-translate-x-full' : 'translate-x-0'}`}>
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
          <div className="overline px-3 mb-1.5">Watch</div>
          <nav className="space-y-1 mb-5">{renderNav(WATCH)}</nav>
          <div className="overline px-3 mb-1.5">Listen</div>
          <nav className="space-y-1 mb-5">{renderNav(LISTEN)}</nav>
          <div className="overline px-3 mb-1.5 flex items-center gap-2"><Library className="w-3.5 h-3.5" /> Your Library</div>
          <nav className="space-y-1">{renderNav(LIBRARY)}</nav>
        </div>
      </aside>
    </>
  );
}
