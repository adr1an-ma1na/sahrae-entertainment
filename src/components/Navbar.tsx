import { useState, useEffect, FormEvent, useRef } from 'react';
import { Search, Bell, User, Sun, Moon, LogIn, LogOut, Palette } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { getImageUrl } from '../services/tmdb';
import { useAuth } from '../hooks/useAuth';
import AuthModal from './AuthModal';
import ProfileModal from './ProfileModal';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onSearch: (query: string) => void;
  onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void;
}

export default function Navbar({ activeTab, setActiveTab, onSearch, onPlay }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications, checkUpdates } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { user, activeProfile } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    checkUpdates();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery);
    }
  };

  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'movies', label: 'Movies' },
    { id: 'series', label: 'Series' },
    { id: 'channels', label: 'Flow Channels' },
    { id: 'mylist', label: 'My List' },
    { id: 'continue', label: 'Continue Watching' },
    { id: 'tv', label: 'Live TV' },
    { id: 'sports', label: 'Live Sports' },
    { id: 'music', label: 'Sauti' },
    { id: 'audio', label: 'Audio Hub' },
    { id: 'downloads', label: 'Downloads' },
  ];

  return (
    <>
    <nav className={`fixed top-0 w-full z-40 transition-all duration-500 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${isScrolled ? 'glass border-b border-white/15' : 'bg-gradient-to-b from-black/55 via-black/20 to-transparent backdrop-blur-sm'}`}>
      <div className="px-4 md:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8 md:gap-12">
          <h1
            className="text-2xl md:text-3xl font-black tracking-tighter cursor-pointer whitespace-nowrap"
            onClick={() => setActiveTab('home')}
          >
            <span className="text-gold drop-shadow-[0_1px_8px_rgba(245,158,11,0.25)]">SAHRAE</span> <span className="text-white font-light text-xl md:text-2xl tracking-normal hidden sm:inline-block">ENTERTAINMENT</span>
          </h1>

          <div className="nav-sections hidden md:flex items-center gap-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative text-sm font-medium transition-colors after:content-[''] after:absolute after:-bottom-1.5 after:left-0 after:h-[2px] after:rounded-full after:bg-amber-500 after:transition-all after:duration-300 ${
                  activeTab === tab.id ? 'text-white after:w-full' : 'text-zinc-300 hover:text-white after:w-0'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <form 
            onSubmit={handleSearchSubmit}
            className={`flex items-center transition-all duration-300 ${isSearchOpen ? 'glass rounded-full px-3 py-1.5' : ''}`}
          >
            <button 
              type="button"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="text-white p-1 hover:text-amber-500 transition-colors"
              title="Standard Search"
            >
              <Search className="w-5 h-5" />
            </button>
            <input
              type="text"
              placeholder="Titles, people, genres"
              className={`bg-transparent text-white text-sm focus:outline-none transition-all duration-300 ${
                isSearchOpen ? 'w-48 md:w-64 ml-2 opacity-100' : 'w-0 opacity-0'
              }`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
          
          <div className="relative" ref={notificationsRef}>
            <button 
              className="text-white p-1 hover:bg-white/10 rounded-full transition-colors relative"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-zinc-950"></span>
              )}
            </button>
            
            {isNotificationsOpen && (
              <div className="absolute right-0 mt-4 w-80 md:w-96 glass rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/50">
                  <h3 className="font-bold text-white">Notifications</h3>
                  <div className="flex gap-2">
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs text-amber-500 hover:text-amber-400 font-medium">
                        Mark all read
                      </button>
                    )}
                    {notifications.length > 0 && (
                      <button onClick={clearNotifications} className="text-xs text-zinc-400 hover:text-white font-medium">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="max-h-[60vh] overflow-y-auto scrollbar-hide">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                      No new notifications
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div 
                        key={notif.id} 
                        className={`p-4 border-b border-white/5 flex gap-4 transition-colors hover:bg-white/5 cursor-pointer ${notif.read ? 'opacity-70' : 'bg-amber-500/5'}`}
                        onClick={() => {
                          markAsRead(notif.id);
                          if (notif.mediaId > 0) {
                            onPlay(notif.mediaId, notif.mediaType, true);
                          }
                          setIsNotificationsOpen(false);
                        }}
                      >
                        {notif.posterPath ? (
                          <img src={getImageUrl(notif.posterPath, 'w500')} alt="" className="w-12 h-16 object-cover rounded bg-zinc-800 shrink-0" />
                        ) : (
                          <div className="w-12 h-16 bg-zinc-800 rounded shrink-0 flex items-center justify-center">
                            <Bell className="w-5 h-5 text-zinc-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold truncate ${notif.read ? 'text-zinc-300' : 'text-white'}`}>{notif.title}</h4>
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{notif.message}</p>
                          <p className="text-[10px] text-zinc-500 mt-2">
                            {new Date(notif.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        {!notif.read && (
                          <div className="w-2 h-2 bg-amber-500 rounded-full shrink-0 mt-1"></div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={toggleTheme}
            className="text-white p-1 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Sun className="w-5 h-5" /> : theme === 'dark' ? <Moon className="w-5 h-5" /> : <Palette className="w-5 h-5" />}
          </button>
          
          {user ? (
            <div className="flex items-center gap-2">
              {activeProfile && (
                <span className="text-sm font-medium text-zinc-300 hidden sm:block">
                  {activeProfile.name}
                </span>
              )}
              <div 
                className="w-8 h-8 rounded bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center cursor-pointer overflow-hidden"
                onClick={() => setIsProfileModalOpen(true)}
                title="Profile Settings"
              >
                {activeProfile?.avatar ? (
                  <img src={activeProfile.avatar} alt="User" className="w-full h-full object-cover" />
                ) : user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="btn-gold flex items-center gap-2 px-4 py-1.5 rounded-full font-semibold text-sm"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Mobile Tabs */}
      <div className="nav-sections-mobile md:hidden flex overflow-x-auto px-4 pb-3 gap-4 scrollbar-hide bg-zinc-950/95">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'text-white font-bold border-b-2 border-amber-500 pb-1' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>

    {/* Modals live OUTSIDE <nav>: the nav's backdrop-blur creates a containing
        block that would otherwise trap these fixed overlays in the top strip. */}
    <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </>
  );
}
