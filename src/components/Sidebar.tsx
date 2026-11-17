import { t as tr } from '../i18n';
import { Home, Search, Headphones, Radio, Film, Tv2, Clapperboard, Trophy, Heart, Clock, Download, PanelLeftClose, PanelLeftOpen, Music2, Mic2, Settings } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useMusic } from '../hooks/useMusic';
import { isTelevision } from '../tv/spatialNavigation';
import { CoverArt } from './ui/CoverArt';
import { useLayoutEffect, useRef } from 'react';
import SideArt, { SunMark } from './ui/SideArt';
import { Glyph } from './ui/Glyphs';

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
  const { unreadCount } = useNotifications();
  const { current, active: musicOn, setExpanded } = useMusic();
  const SETTINGS: NavItem[] = [{ id: 'settings', label: 'Settings', icon: Settings }];
  // The gold edge's light rests beside the selected item (SideArt).
  const fullRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const aside = fullRef.current;
    if (!aside) return;
    const place = () => {
      const on = aside.querySelector<HTMLElement>('.nav-on');
      if (!on) { aside.style.setProperty('--glow-y', '-400px'); return; }
      const a = aside.getBoundingClientRect(), r = on.getBoundingClientRect();
      aside.style.setProperty('--glow-y', `${Math.round(r.top - a.top + r.height / 2)}px`);
    };
    place();
    const list = aside.querySelector('.side-scroll');
    list?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { list?.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [activeTab, collapsed, musicOn]);
  const renderNav = (items: NavItem[]) =>
    items.map((t) => {
      const Icon = t.icon;
      // Each Listen destination is its own row now, so each matches only itself.
      // (It used to light "Listen" for any audio tab, because there was only one.)
      const active = activeTab === t.id;
      return (
        <button key={t.id} onClick={() => setActiveTab(t.id)} tabIndex={0} data-tv-focusable
          className={`side-item w-full flex items-center gap-3 px-4 py-3 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
            active
              ? 'nav-on'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]'
          }`}>
          {/* Material 3 navigation drawer: inactive destinations have no
              container at all, and the active one sits in a full-round
              primary-container pill. The previous neumorphic raised/pressed
              shadows put a box around EVERY item, which is the opposite of how
              a Material drawer separates the selected row from the rest. */}
          <Icon className="w-5 h-5 shrink-0" />
          <span className="truncate">{tr(t.label)}</span>
        </button>
      );
    });

  // Compact icon button for the tablet rail (label as a hover/focus tooltip).
  const railBtn = (t: NavItem) => {
    const Icon = t.icon;
    const active = activeTab === t.id;
    return (
      <button key={t.id} onClick={() => setActiveTab(t.id)} tabIndex={0} data-tv-focusable title={tr(t.label)} aria-label={tr(t.label)}
        className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
          active
            ? 'nav-on'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]'
        }`}>
        <Icon className="w-5 h-5" />
      </button>
    );
  };
  const railDivider = <div className="w-6 h-px bg-white/10 my-1.5 shrink-0" />;

  return (
    <>
      {/* Tablet icon rail (md–lg) */}
      <aside className="tv-rail side-shell hidden md:flex lg:hidden flex-col items-center fixed left-0 top-0 bottom-0 w-16 z-40 glass sidebar-glass border-r border-white/12 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 overflow-y-auto scrollbar-hide">
        <SideArt dunes={false} />
        <button onClick={() => setActiveTab('home')} aria-label="Sahrae home"
          className="w-10 h-10 mb-2 rounded-xl shrink-0 overflow-hidden"><SunMark className="w-10 h-10" /></button>
        <div className="flex flex-col items-center gap-1">{PRIMARY.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{WATCH.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{LISTEN.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{LIBRARY.map(railBtn)}</div>
        {railDivider}
        <div className="flex flex-col items-center gap-1">{SETTINGS.map(railBtn)}</div>
      </aside>

      {/* Reveal button — only on lg+ and only while the full sidebar is hidden. */}
      {collapsed && (
        <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-label="Show sidebar"
          className="hidden lg:flex fixed top-[calc(env(safe-area-inset-top)+0.6rem)] left-3 z-50 w-10 h-10 items-center justify-center rounded-full glass border border-white/10 text-white hover:text-sauti shadow-lg">
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Full labelled sidebar (lg+) */}
      <aside ref={fullRef} className={`tv-full side-shell hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-64 z-40 glass sidebar-glass border-r border-white/10 pt-[env(safe-area-inset-top)] transition-transform duration-300 ${collapsed ? '-translate-x-full' : 'translate-x-0'}`}>
        <SideArt />
        <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-2">
          {/* The name in a cartouche, the frame that held a ruler's name. */}
          <h1 className="cartouche flex items-center gap-2.5 cursor-pointer whitespace-nowrap" onClick={() => setActiveTab('home')}>
            <SunMark className="w-9 h-9 shrink-0 side-mark" />
            <span className="flex flex-col">
              <span className="text-gold text-2xl font-black tracking-tighter leading-none">SAHRAE</span>
              <span className="side-tag">Entertainment</span>
            </span>
          </h1>
          <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-label="Hide sidebar"
            className="w-9 h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <PanelLeftClose className="w-5 h-5" />
          </button>
        </div>

        {/* TV: what is playing, one press from anywhere (the remote can always go left). */}
        {isTelevision() && musicOn && current && (
          <div className="px-3 pb-3">
            <button onClick={() => setExpanded(true)} tabIndex={0} data-tv-focusable aria-label={`Open the player: ${current.title}`}
              className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/[0.07] text-left focus:outline-none">
              <CoverArt imageUrl={current.artwork} dominantColor={current.dominantColor} className="w-11 h-11 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300">Now playing</span>
                <span className="block text-sm font-semibold text-white truncate">{current.title}</span>
              </span>
            </button>
          </div>
        )}

        <nav className="px-3 space-y-1">{renderNav(PRIMARY)}</nav>

        <div className="side-scroll mt-6 px-3 flex-1 overflow-y-auto custom-scrollbar pb-4">
          <div className="overline side-label px-3 mb-1.5"><Glyph name="eye" className="side-glyph" /> Watch</div>
          <nav className="space-y-1 mb-5">{renderNav(WATCH)}</nav>
          <div className="overline side-label px-3 mb-1.5"><Glyph name="waves" className="side-glyph" /> Listen</div>
          <nav className="space-y-1 mb-5">{renderNav(LISTEN)}</nav>
          <div className="overline side-label px-3 mb-1.5"><Glyph name="door" className="side-glyph" /> Your Library</div>
          <nav className="space-y-1">{renderNav(LIBRARY)}</nav>
        </div>

        {/* Always in reach at the foot, whatever the list above is scrolled to. */}
        <div className="relative px-3 py-3 border-t border-white/10">
          {renderNav(SETTINGS)}
          {unreadCount > 0 && <span aria-label={`${unreadCount} new notifications`} className="absolute right-7 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-red-500 pointer-events-none" />}
        </div>
      </aside>
    </>
  );
}
