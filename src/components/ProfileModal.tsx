import { useState, useEffect, FormEvent } from 'react';
import { X, User, LogOut, Key, Check, Database, Trash2, ShieldAlert, Languages, Sun, Moon, Palette, Tv, ShieldCheck, Download, Scale, Volume2, VolumeX, Music } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { loadConsent, saveConsent, openLegal, CONSENT_CHANGE } from '../services/consent';
import { exportMyData, deleteAccount } from '../services/accountData';
import { introSoundOn, setIntroSound } from '../services/sonicLogo';
import { isTvBuild, tvZoom, setTvZoom, TV_ZOOMS, TV_ZOOM_EVENT } from '../tv/tvViewport';
import { currentLang, setLang } from '../i18n';
import { useTheme } from '../hooks/useTheme';
import ThemePicker from './ui/ThemePicker';
import { THEMES } from '../hooks/useTheme';

const THEME_NAMES = Object.fromEntries(THEMES.map((t) => [t.id, t.name])) as Record<string, string>;
import { useAuth } from '../hooks/useAuth';
import { updateProfile, updatePassword } from '../firebase';
import { getCacheStats, clearMediaCache, CacheStats } from '../services/cacheManager';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mimi',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Lily',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=George',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, logout, reloadUser, activeProfile, updateProfileData, setActiveProfile } = useAuth();
  const { theme, pick } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [zoom, setZoom] = useState(() => tvZoom());
  // A size chosen from the phone remote shows here too.
  useEffect(() => {
    const sync = () => setZoom(tvZoom());
    window.addEventListener(TV_ZOOM_EVENT, sync);
    return () => window.removeEventListener(TV_ZOOM_EVENT, sync);
  }, []);
  const [tab, setTab] = useState<'profile' | 'security' | 'cache' | 'privacy'>('profile');
  // Privacy & data: the optional server reports, a copy of my data, deleting the account.
  const [reports, setReports] = useState(() => !!loadConsent()?.serverReports);
  const [confirmDelete, setConfirmDelete] = useState('');
  // The Sahrae sound at launch (services/sonicLogo.ts).
  const [introSound, setIntroSoundState] = useState(() => introSoundOn());
  useEffect(() => {
    const sync = () => setReports(!!loadConsent()?.serverReports);
    window.addEventListener(CONSENT_CHANGE, sync);
    return () => window.removeEventListener(CONSENT_CHANGE, sync);
  }, []);
  const [name, setName] = useState(activeProfile?.name || user?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState(activeProfile?.avatar || user?.photoURL || AVATARS[0]);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cacheStats, setCacheStats] = useState<CacheStats>(() => getCacheStats());

  if (!isOpen || !user) return null;

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      if (activeProfile) {
        await updateProfileData(activeProfile.id, name, selectedAvatar);
      } else {
        await updateProfile(user, { displayName: name, photoURL: selectedAvatar });
        await reloadUser();
      }
      setMessage('Profile updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    try {
      await updatePassword(user, newPassword);
      setMessage('Password updated successfully!');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password. You may need to sign in again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    setLoading(true);
    setMessage('');
    setError('');
    try {
      clearMediaCache();
      const updated = getCacheStats();
      setCacheStats(updated);
      setMessage('App cache cleared successfully! Stale metadata removed, user watch progress and playlists preserved.');
    } catch (err: any) {
      setError(err.message || 'Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col md:flex-row">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Sidebar */}
        <div className="bg-zinc-950 p-6 md:w-64 flex flex-col gap-2">
          <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
          <button 
            onClick={() => { setTab('profile'); setMessage(''); setError(''); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'profile' ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
          >
            <User className="w-5 h-5" /> Profile
          </button>
          <button 
            onClick={() => { setTab('security'); setMessage(''); setError(''); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'security' ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Key className="w-5 h-5" /> Security
          </button>
          <button 
            onClick={() => { setTab('cache'); setMessage(''); setError(''); setCacheStats(getCacheStats()); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'cache' ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Database className="w-5 h-5" /> App Cache
          </button>
          <button
            onClick={() => { setTab('privacy'); setMessage(''); setError(''); setConfirmDelete(''); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'privacy' ? 'bg-amber-500/10 text-amber-500' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
          >
            <ShieldCheck className="w-5 h-5" /> Privacy &amp; data
          </button>
          {/* Also in the top bar on wider screens; on a phone they live here. */}
          <button
            onClick={() => setLang(currentLang() === 'sw' ? 'en' : 'sw')}
            className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <Languages className="w-5 h-5" /> Language
            <span className="ml-auto text-xs font-bold text-zinc-300">{currentLang() === 'sw' ? 'Kiswahili' : 'English'}</span>
          </button>
          <button
            onClick={() => { const next = !introSound; setIntroSound(next); setIntroSoundState(next); }}
            role="switch" aria-checked={introSound} data-tv-focusable
            className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            {introSound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />} Intro sound
            <span className="ml-auto text-xs font-bold text-zinc-300">{introSound ? 'On' : 'Off'}</span>
          </button>
          <button
            onClick={() => setThemeOpen((v) => !v)}
            aria-expanded={themeOpen}
            className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            {theme === 'light' ? <Sun className="w-5 h-5" /> : theme === 'dark' ? <Moon className="w-5 h-5" /> : <Palette className="w-5 h-5" />} Theme
            <span className="ml-auto text-xs font-bold text-zinc-300">{THEME_NAMES[theme]}</span>
          </button>
          {themeOpen && <div className="px-2 pb-2"><ThemePicker theme={theme} onPick={pick} compact /></div>}
          {/* Phone app: what happened to music while Sahrae was in the background,
              to share if a song stops in another app. */}
          {Capacitor.isNativePlatform() && !isTvBuild() && (
            <button
              onClick={() => { fetch('https://localhost/__bglog?share=1').catch(() => {}); }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Music className="w-5 h-5" /> Music report
              <span className="ml-auto text-xs font-bold text-zinc-300">Share</span>
            </button>
          )}
          {/* TV only: a television has no zoom, so the app offers its own sizes. */}
          {isTvBuild() && (
            <div className="px-4 py-3">
              <p className="flex items-center gap-3 font-medium text-zinc-400"><Tv className="w-5 h-5" /> Screen size</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Screen size">
                {TV_ZOOMS.map((z) => (
                  <button key={z} type="button" data-tv-focusable aria-pressed={zoom === z} className="lux-chip"
                    onClick={() => { setZoom(z); setTvZoom(z); }}>
                    {z}%{z === 100 ? ' (standard)' : ''}
                  </button>
                ))}
              </div>
              {/* What the TV lets apps draw at; the app is as sharp as this allows. */}
              <p className="mt-2 text-xs text-zinc-500">
                Your TV gives apps a {Math.round(window.screen.width * (window.devicePixelRatio || 1))} × {Math.round(window.screen.height * (window.devicePixelRatio || 1))} picture.
              </p>
            </div>
          )}
          <div className="mt-auto pt-6 flex flex-col gap-2">
            <button 
              onClick={() => { setActiveProfile(null); onClose(); }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors w-full"
            >
              <User className="w-5 h-5" /> Switch Profile
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-red-500 hover:bg-red-500/10 transition-colors w-full"
            >
              <LogOut className="w-5 h-5" /> Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto max-h-[85vh] md:max-h-none">
          {message && (
            <div className="bg-green-500/10 border border-green-500/50 text-green-500 p-3 rounded-lg mb-6 text-sm flex items-center gap-2">
              <Check className="w-4 h-4" /> {message}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {tab === 'profile' ? (
            <form onSubmit={handleUpdateProfile}>
              <h3 className="text-2xl font-bold text-white mb-6">Edit Profile</h3>
              
              <div className="mb-8">
                <label className="block text-sm font-medium text-zinc-400 mb-4">Choose Avatar</label>
                <div className="grid grid-cols-4 gap-4">
                  {AVATARS.map((avatar, i) => (
                    <div 
                      key={i}
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`cursor-pointer rounded-full p-1 transition-all ${selectedAvatar === avatar ? 'bg-amber-500 scale-110' : 'hover:bg-white/10'}`}
                    >
                      <img loading="lazy" decoding="async" src={avatar} alt={`Avatar ${i}`} className="w-full h-full rounded-full bg-zinc-800" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">Display Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder="Your Name"
                />
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          ) : tab === 'privacy' ? (
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Privacy &amp; data</h3>
              <p className="text-sm text-zinc-400 mb-6">Sahrae uses no advertising or analytics cookies of its own and does not sell your information.</p>

              <div className="rounded-xl bg-zinc-950 border border-white/10 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">Share anonymous server reports</p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Which server played a film or episode, without your name or account, so other viewers start on one that works.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={reports} data-tv-focusable
                    onClick={() => { const next = !reports; setReports(next); saveConsent(next); setMessage(next ? 'Server reports are on.' : 'Server reports are off.'); setError(''); }}
                    className={`relative w-12 h-7 shrink-0 rounded-full transition-colors ${reports ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${reports ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
              </div>

              <button type="button" data-tv-focusable disabled={loading}
                onClick={async () => { setLoading(true); setError(''); try { setMessage(await exportMyData()); } catch (e: any) { setError(e?.message || 'The copy could not be saved.'); } finally { setLoading(false); } }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-left text-white hover:bg-white/5 mb-3 disabled:opacity-60">
                <Download className="w-5 h-5 text-amber-400" />
                <span className="flex-1"><span className="block font-semibold">Download my data</span><span className="block text-xs text-zinc-400">A copy of your account details, lists, history and settings (JSON).</span></span>
              </button>

              <button type="button" data-tv-focusable onClick={() => openLegal('privacy')}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-left text-white hover:bg-white/5 mb-6">
                <Scale className="w-5 h-5 text-amber-400" />
                <span className="flex-1"><span className="block font-semibold">Terms, Privacy, Cookies &amp; Copyright</span><span className="block text-xs text-zinc-400">Read Sahrae's legal pages.</span></span>
              </button>

              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <p className="font-semibold text-red-400">Delete my account</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Removes your account, your lists, likes, history and settings, on every device. This cannot be undone. Type DELETE to confirm.</p>
                <div className="flex gap-2 mt-3">
                  <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm"
                    className="flex-1 min-w-0 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500/60" />
                  <button type="button" data-tv-focusable disabled={confirmDelete.trim() !== 'DELETE' || loading}
                    onClick={async () => {
                      setLoading(true); setError(''); setMessage('');
                      const r = await deleteAccount().catch(() => ({ ok: false as const, partial: false, message: 'Something went wrong. Please try again.' }));
                      setLoading(false);
                      if (r.ok) { onClose(); return; }
                      setError('message' in r ? r.message : '');
                    }}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold disabled:opacity-40">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ) : tab === 'security' ? (
            <form onSubmit={handleUpdatePassword}>
              <h3 className="text-2xl font-bold text-white mb-6">Security</h3>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-400 mb-2">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder="Enter new password"
                  minLength={6}
                />
                <p className="text-xs text-zinc-500 mt-2">Must be at least 6 characters long.</p>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          ) : (
            <div className="flex flex-col h-full">
              <h3 className="text-2xl font-bold text-white mb-2">App Performance & Cache</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Optimize app speed and free up storage by clearing temporary media metadata.
              </p>

              {/* Cache Size Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-zinc-950 p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Movie/TV Metadata</p>
                  <p className="text-xl font-bold text-amber-500">
                    {cacheStats.tmdbCount > 0 ? `${cacheStats.tmdbCount} items` : 'No items'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">({cacheStats.tmdbSizeKb} KB cached)</p>
                </div>
                <div className="bg-zinc-950 p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-1">Sports & HD Art</p>
                  <p className="text-xl font-bold text-amber-500">
                    {cacheStats.sportsFeedCached ? 'Active Cache' : 'Idle'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">({cacheStats.sportsFeedSizeKb} KB cached)</p>
                </div>
              </div>

              {/* Preserve & Clear lists */}
              <div className="space-y-4 mb-8">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-500" /> Preserved User Data
                  </h4>
                  <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                    <li>Saved Playlists & Liked songs</li>
                    <li>Movie, TV and Live TV watch progress</li>
                    <li>Bookmarks, Watchlist and Favorite Channels</li>
                    <li>Followed podcasts & Episode listening states</li>
                    <li>Acount profile, avatars and theme choices</li>
                  </ul>
                </div>

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-amber-500" /> Selective Clear Items
                  </h4>
                  <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                    <li>Temporary TMDb movie and series metadata</li>
                    <li>Edge-cached sports matches & broadcast feeds</li>
                    <li>HD album covers in-memory search lists</li>
                    <li>Stale YouTube Music server instances map</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5 mt-auto">
                <div className="text-xs text-zinc-500 flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4 text-amber-500/70" /> Total metadata cache: {cacheStats.totalSizeKb} KB
                </div>
                <button 
                  onClick={handleClearCache}
                  disabled={loading}
                  className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  {loading ? 'Clearing...' : 'Clear Media Cache'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
