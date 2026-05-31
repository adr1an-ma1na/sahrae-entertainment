import { useState, useEffect } from 'react';
import { Mic, ExternalLink, Plus, Trash2, Play } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

interface Podcast {
  id: string;
  title: string;
  url: string;
  category: string;
  custom?: boolean;
}

const DEFAULT_PODCASTS: Podcast[] = [
  { id: 'p1', title: 'The Joe Rogan Experience', url: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk', category: 'Comedy' },
  { id: 'p2', title: 'Crime Junkie', url: 'https://crimejunkiepodcast.com/', category: 'True Crime' },
  { id: 'p3', title: 'The Daily', url: 'https://www.nytimes.com/column/the-daily', category: 'News' },
  { id: 'p4', title: 'This American Life', url: 'https://www.thisamericanlife.org/', category: 'Society' },
  { id: 'p5', title: 'Huberman Lab', url: 'https://hubermanlab.com/', category: 'Science' },
  { id: 'p6', title: 'SmartLess', url: 'https://www.smartless.com/', category: 'Comedy' },
  { id: 'p7', title: 'Stuff You Should Know', url: 'https://stuffyoushouldknow.com/', category: 'Education' },
  { id: 'p8', title: 'Lex Fridman Podcast', url: 'https://lexfridman.com/podcast/', category: 'Technology' },
];

export default function PodcastsView() {
  const [podcasts, setPodcasts] = useState<Podcast[]>(DEFAULT_PODCASTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/podcasts`), (snapshot) => {
        const customPodcasts = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          custom: true
        })) as Podcast[];
        setPodcasts([...DEFAULT_PODCASTS, ...customPodcasts]);
      });
      return () => unsubscribe();
    } else {
      setPodcasts(DEFAULT_PODCASTS);
    }
  }, [user]);

  const handleAddPodcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to add custom podcasts.");
      return;
    }
    if (!newTitle || !newUrl) return;

    const newId = `custom_${Date.now()}`;
    const docRef = doc(db, `users/${user.uid}/podcasts`, newId);
    await setDoc(docRef, {
      id: newId,
      title: newTitle,
      url: newUrl,
      category: 'Custom'
    });

    setNewTitle('');
    setNewUrl('');
    setIsAdding(false);
  };

  const handleDeletePodcast = async (id: string) => {
    if (!user) return;
    const docRef = doc(db, `users/${user.uid}/podcasts`, id);
    await deleteDoc(docRef);
  };

  const categories = ['All', ...Array.from(new Set(podcasts.map(p => p.category)))].sort();
  const filteredPodcasts = selectedCategory === 'All' 
    ? podcasts 
    : podcasts.filter(p => p.category === selectedCategory);

  return (
    <div className="pt-24 px-4 md:px-12 max-w-7xl mx-auto min-h-screen pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Mic className="w-8 h-8 text-amber-500" />
          <h2 className="text-3xl font-bold text-white">Podcasts</h2>
        </div>
        
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category 
                  ? 'bg-amber-500 text-amber-950' 
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {category}
            </button>
          ))}
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Custom
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddPodcast} className="bg-zinc-900 border border-white/10 rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-xl font-bold text-white mb-4">Add Custom Podcast</h3>
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Podcast Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
              required
            />
            <input
              type="url"
              placeholder="Podcast URL (e.g., Spotify, Apple Podcasts, RSS)"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
              required
            />
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold px-6 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {filteredPodcasts.map((podcast) => (
          <div 
            key={podcast.id}
            className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 hover:bg-zinc-800/50 transition-colors group relative overflow-hidden flex flex-col"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="flex-grow">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-bold text-white leading-tight pr-6">{podcast.title}</h3>
                {podcast.custom && (
                  <button 
                    onClick={() => handleDeletePodcast(podcast.id)}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-red-500 transition-colors"
                    title="Delete custom podcast"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="px-2 py-1 bg-white/5 rounded text-xs text-zinc-400">{podcast.category}</span>
              </div>
            </div>
            
            <a
              href={podcast.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold bg-white/10 text-white hover:bg-amber-500 hover:text-amber-950 transition-all mt-auto"
            >
              <Play className="w-4 h-4" />
              Listen Now
              <ExternalLink className="w-4 h-4 ml-1" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
