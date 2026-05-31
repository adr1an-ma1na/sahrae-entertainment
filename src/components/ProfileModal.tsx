import { useState, FormEvent } from 'react';
import { X, User, LogOut, Key, Camera, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { updateProfile, updatePassword } from '../firebase';

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
  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [name, setName] = useState(activeProfile?.name || user?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState(activeProfile?.avatar || user?.photoURL || AVATARS[0]);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
        <div className="p-8 flex-1">
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
                      <img src={avatar} alt={`Avatar ${i}`} className="w-full h-full rounded-full bg-zinc-800" />
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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
