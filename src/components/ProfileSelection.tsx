import { useState } from 'react';
import { Plus, Edit2, Check } from 'lucide-react';
import { useAuth, Profile } from '../hooks/useAuth';

const AVATARS = [
  'https://api.dicebear.com/8.x/micah/svg?seed=Picasso&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/micah/svg?seed=Vandeburg&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/micah/svg?seed=Luna&backgroundColor=c0aede',
  'https://api.dicebear.com/8.x/micah/svg?seed=Felix&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/bottts-neutral/svg?seed=Robot1&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/adventurer/svg?seed=Mia&backgroundColor=c0aede',
  'https://api.dicebear.com/8.x/micah/svg?seed=George&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/micah/svg?seed=Oliver&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/bottts/svg?seed=C3PO&backgroundColor=ffd5dc',
  'https://api.dicebear.com/8.x/bottts/svg?seed=R2D2&backgroundColor=d1d4f9',
  'https://api.dicebear.com/8.x/fun-emoji/svg?seed=Star&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/fun-emoji/svg?seed=Cool&backgroundColor=c0aede',
  'https://api.dicebear.com/8.x/lorelei/svg?seed=Cleo&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/lorelei/svg?seed=Sasha&backgroundColor=ffd5dc',
  'https://api.dicebear.com/8.x/big-ears/svg?seed=Doggo&backgroundColor=d1d4f9',
  'https://api.dicebear.com/8.x/big-ears/svg?seed=Kitty&backgroundColor=c0aede',
  'https://api.dicebear.com/8.x/pixel-art/svg?seed=Invader&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/pixel-art/svg?seed=Hero&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/adventurer/svg?seed=Jack&backgroundColor=ffd5dc',
  'https://api.dicebear.com/8.x/adventurer-neutral/svg?seed=Zoe&backgroundColor=d1d4f9',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=Leo&backgroundColor=c0aede',
  'https://api.dicebear.com/8.x/avataaars/svg?seed=Nala&backgroundColor=ffdfbf',
  'https://api.dicebear.com/8.x/miniavs/svg?seed=Batman&backgroundColor=b6e3f4',
  'https://api.dicebear.com/8.x/miniavs/svg?seed=Spidey&backgroundColor=ffd5dc',
];

export default function ProfileSelection() {
  const { profiles, setActiveProfile, addProfile, updateProfileData, deleteProfile, logout } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);

  const handleEditClick = (profile: Profile) => {
    setEditingProfile(profile);
    setName(profile.name);
    setSelectedAvatar(profile.avatar);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      if (editingProfile) {
        await updateProfileData(editingProfile.id, name, selectedAvatar);
      } else {
        await addProfile(name, selectedAvatar);
      }
      setIsAdding(false);
      setEditingProfile(null);
      setName('');
      setSelectedAvatar(AVATARS[0]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this profile?')) {
      await deleteProfile(id);
      setIsAdding(false);
      setEditingProfile(null);
    }
  };

  if (isAdding || editingProfile) {
    return (
      <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
        <div className="max-w-2xl w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-8 text-center">
            {editingProfile ? 'Edit Profile' : 'Add Profile'}
          </h1>
          
          <form onSubmit={handleAdd} className="bg-zinc-900 border border-white/10 rounded-2xl p-8">
            <div className="mb-8">
              <label className="block text-sm font-medium text-zinc-400 mb-4 text-center">Choose Avatar</label>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4 justify-center max-h-[40vh] overflow-y-auto p-2 custom-scrollbar">
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

            <div className="mb-8">
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-4 text-xl text-center focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="Name"
                autoFocus
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button 
                type="submit"
                disabled={loading || !name.trim()}
                className="bg-white text-black hover:bg-zinc-200 font-bold px-8 py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button 
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingProfile(null);
                }}
                className="bg-transparent border border-zinc-600 text-white hover:border-white font-bold px-8 py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {editingProfile && (
                <button 
                  type="button"
                  onClick={() => handleDelete(editingProfile.id)}
                  className="bg-transparent border border-red-500/50 text-red-500 hover:bg-red-500/10 font-bold px-8 py-3 rounded-lg transition-colors sm:ml-auto"
                >
                  Delete Profile
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-12 text-center">Who's watching?</h1>
      
      <div className="flex flex-wrap justify-center gap-6 md:gap-10 max-w-4xl">
        {profiles.map(profile => (
          <div key={profile.id} className="flex flex-col items-center group relative">
            <button 
              onClick={() => isEditing ? handleEditClick(profile) : setActiveProfile(profile)}
              className="relative rounded-xl overflow-hidden mb-4 transition-transform duration-300 group-hover:scale-105"
            >
              <div className={`w-24 h-24 md:w-32 md:h-32 rounded-xl border-2 transition-colors ${isEditing ? 'border-zinc-500 group-hover:border-white' : 'border-transparent group-hover:border-white'}`}>
                <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover bg-zinc-800" />
                {isEditing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Edit2 className="w-8 h-8 text-white" />
                  </div>
                )}
              </div>
            </button>
            <span className="text-zinc-400 group-hover:text-white transition-colors">{profile.name}</span>
          </div>
        ))}

        {profiles.length < 5 && !isEditing && (
          <div className="flex flex-col items-center group">
            <button 
              onClick={() => {
                setName('');
                setSelectedAvatar(AVATARS[0]);
                setIsAdding(true);
              }}
              className="w-24 h-24 md:w-32 md:h-32 rounded-xl border-2 border-zinc-800 hover:border-white hover:bg-white/10 flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-105"
            >
              <Plus className="w-12 h-12 text-zinc-500 group-hover:text-white transition-colors" />
            </button>
            <span className="text-zinc-400 group-hover:text-white transition-colors">Add Profile</span>
          </div>
        )}
      </div>

      {profiles.length > 0 && (
        <button 
          onClick={() => setIsEditing(!isEditing)}
          className="mt-16 px-6 py-2 border border-zinc-500 text-zinc-400 hover:border-white hover:text-white uppercase tracking-widest text-sm transition-colors rounded"
        >
          {isEditing ? 'Done' : 'Manage Profiles'}
        </button>
      )}

      <button 
        onClick={logout}
        className="absolute top-8 right-8 text-zinc-400 hover:text-white transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
