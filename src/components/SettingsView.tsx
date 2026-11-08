import { Bell, MonitorSmartphone, Settings, User, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { currentLang, setLang } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import { getImageUrl } from '../services/tmdb';
import { isTelevision } from '../tv/spatialNavigation';
import { OPEN_PROFILE } from './Navbar';
import { OPEN_REMOTE } from './RemotePanel';
import ThemePicker from './ui/ThemePicker';
import { LuxHeader } from './ui/Lux';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lux-card p-5 md:p-6" style={{ transform: 'none' }}>
      <h2 className="text-lg font-display font-bold text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Everything that used to sit in the top right corner, in one place on the
 * sidebar (owner, 2026-11-08): notifications, language, the phone remote, the
 * theme and profiles. A page rather than small menus, so a TV remote moves
 * through it like any other.
 */
export default function SettingsView({ onPlay }: { onPlay: (id: number, type: 'movie' | 'tv', startInInfo?: boolean) => void }) {
  const { user, activeProfile, setActiveProfile } = useAuth();
  const { theme, pick } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const lang = currentLang();
  const avatar = activeProfile?.avatar || user?.photoURL;
  const tv = isTelevision();
  const button = 'lux-chip inline-flex items-center gap-2';

  return (
    <div className="pt-[calc(env(safe-area-inset-top)+6rem)] md:pt-12 px-4 md:px-12 pb-16 max-w-4xl mx-auto min-h-screen relative">
      <LuxHeader kicker={<><Settings className="w-3.5 h-3.5" /> Sahrae</>} title="Settings" />

      <div className="space-y-5">
        <Section title="Profile">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shrink-0">
              {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-7 h-7 text-[#fff]" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-white truncate">{activeProfile?.name || user?.displayName || 'Your profile'}</p>
              {user?.email && <p className="text-sm text-zinc-400 truncate">{user.email}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => window.dispatchEvent(new Event(OPEN_PROFILE))} data-tv-focusable className={button}><User className="w-4 h-4" /> Account</button>
              <button onClick={() => setActiveProfile(null)} data-tv-focusable className={button}><Users className="w-4 h-4" /> Switch profile</button>
            </div>
          </div>
        </Section>

        <Section title="Language">
          <div className="flex gap-2" role="group" aria-label="Language">
            <button onClick={() => { if (lang !== 'en') setLang('en'); }} aria-pressed={lang !== 'sw'} data-tv-focusable className="lux-chip">English</button>
            <button onClick={() => { if (lang !== 'sw') setLang('sw'); }} aria-pressed={lang === 'sw'} data-tv-focusable className="lux-chip">Kiswahili</button>
          </div>
        </Section>

        <Section title="Phone remote">
          <p className="text-sm text-zinc-400 mb-3">{tv ? 'Pair a phone and use it as the remote for this TV.' : 'Use this phone as the remote for a TV.'}</p>
          <button onClick={() => window.dispatchEvent(new Event(OPEN_REMOTE))} data-tv-focusable className={button}>
            <MonitorSmartphone className="w-4 h-4" /> {tv ? 'Pair a phone' : 'Open the remote'}
          </button>
        </Section>

        <Section title="Theme">
          <ThemePicker theme={theme} onPick={pick} />
        </Section>

        <Section title={unreadCount ? `Notifications (${unreadCount} new)` : 'Notifications'}>
          {notifications.length === 0 ? (
            <p className="text-sm text-zinc-400 flex items-center gap-2"><Bell className="w-4 h-4" /> Nothing new.</p>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {unreadCount > 0 && <button onClick={markAllAsRead} data-tv-focusable className="lux-chip">Mark all as read</button>}
                <button onClick={clearNotifications} data-tv-focusable className="lux-chip">Clear</button>
              </div>
              <div className="divide-y divide-white/5">
                {notifications.map((n) => (
                  <div key={n.id} role="button" tabIndex={0} data-tv-focusable
                    onClick={() => { markAsRead(n.id); if (n.mediaId > 0) onPlay(n.mediaId, n.mediaType, true); }}
                    className={`flex gap-4 p-3 rounded-lg cursor-pointer hover:bg-white/5 focus:outline-none ${n.read ? 'opacity-70' : ''}`}>
                    {n.posterPath
                      ? <img loading="lazy" decoding="async" src={getImageUrl(n.posterPath, 'w500')} alt="" className="w-12 h-16 object-cover rounded bg-zinc-800 shrink-0" />
                      : <span className="w-12 h-16 bg-zinc-800 rounded shrink-0 flex items-center justify-center"><Bell className="w-5 h-5 text-zinc-500" /></span>}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold truncate ${n.read ? 'text-zinc-300' : 'text-white'}`}>{n.title}</p>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{n.message}</p>
                      <p className="text-[11px] text-zinc-500 mt-1.5">{new Date(n.timestamp).toLocaleDateString()}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 bg-amber-500 rounded-full shrink-0 mt-1" />}
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
