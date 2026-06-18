import { useState } from 'react';
import { X, Plus, Check, ListMusic, Music2, Play, ListPlus, Download, Loader2 } from 'lucide-react';
import { useMusic } from '../hooks/useMusic';
import { haptics } from '../services/haptics';
import { downloads } from '../services/downloads';

export default function AddToPlaylistSheet() {
  const { addSheetTrack, closeAddSheet, playlists, createPlaylist, addToPlaylist, addToQueue, playNext } = useMusic();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dlErr, setDlErr] = useState(false);

  if (!addSheetTrack) return null;
  const track = addSheetTrack;

  // Save with a clear, satisfying confirmation: a firm haptic + an "Added"
  // banner, then auto-close — so it always feels like it persisted.
  const confirmSave = (playlistName: string) => {
    haptics.press();
    setSaved(playlistName);
    setTimeout(() => closeAddSheet(), 850);
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    const id = createPlaylist(name);
    addToPlaylist(id, track);
    const nm = name.trim();
    setName('');
    setCreating(false);
    confirmSave(nm);
  };

  const addToExisting = (id: string, nm: string, has: boolean) => {
    if (!has) addToPlaylist(id, track);
    confirmSave(nm);
  };

  const handleDownload = async () => {
    if (downloads.has(track.id)) { downloads.remove(track.id); closeAddSheet(); return; }
    haptics.press(); setDlErr(false); setDownloading(true);
    const ok = await downloads.download(track);
    setDownloading(false);
    if (ok) confirmSave('Downloads'); else setDlErr(true);
  };

  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) closeAddSheet(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-md glass rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        {saved && (
          <div className="absolute inset-0 z-20 rounded-t-3xl sm:rounded-3xl bg-black/70 backdrop-blur-md flex flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
            <span className="w-16 h-16 rounded-full bg-sauti flex items-center justify-center animate-in zoom-in duration-300"><Check className="w-8 h-8 text-amber-950" strokeWidth={3} /></span>
            <p className="text-white font-bold text-lg">Saved</p>
            <p className="text-zinc-300 text-sm">Added to <span className="text-sauti font-semibold">{saved}</span></p>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-white/10">
          <div className="w-11 h-11 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
            {track.artwork ? <img src={track.artwork} alt="" className="w-full h-full object-cover" /> : <Music2 className="w-5 h-5 text-zinc-600 m-auto" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-sauti font-semibold uppercase tracking-wide">Add to playlist</p>
            <p className="text-sm font-semibold text-white truncate">{track.title}</p>
          </div>
          <button onClick={closeAddSheet} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Queue actions */}
        <div className="grid grid-cols-3 gap-2 p-4 border-b border-white/5">
          <button onClick={() => { playNext(track); closeAddSheet(); }} className="btn-glass flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold"><Play className="w-4 h-4 fill-current" /> Play next</button>
          <button onClick={() => { addToQueue(track); closeAddSheet(); }} className="btn-glass flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold"><ListPlus className="w-4 h-4" /> Queue</button>
          <button onClick={handleDownload} disabled={downloading} className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold ${downloads.has(track.id) ? 'bg-sauti text-amber-950' : dlErr ? 'bg-red-500/20 text-red-300' : 'btn-glass'}`}>
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? 'Saving…' : downloads.has(track.id) ? 'Downloaded' : dlErr ? 'Retry' : 'Download'}
          </button>
        </div>

        {/* New playlist */}
        <div className="p-4 border-b border-white/5">
          {creating ? (
            <div className="flex items-center gap-2">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} placeholder="Playlist name"
                className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/60" />
              <button onClick={handleCreate} className="btn-sauti px-4 py-2.5 rounded-xl text-sm font-bold">Create</button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="flex items-center gap-3 w-full text-left text-white">
              <span className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Plus className="w-5 h-5 text-sauti" /></span>
              <span className="font-semibold">New playlist</span>
            </button>
          )}
        </div>

        {/* Existing playlists */}
        <div className="overflow-y-auto custom-scrollbar p-2">
          {playlists.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">No playlists yet — create one above.</p>
          ) : (
            playlists.map((p) => {
              const has = p.tracks.some((t) => t.id === track.id);
              return (
                <button key={p.id} onClick={() => addToExisting(p.id, p.name, has)}
                  className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-white/5 text-left">
                  <span className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0"><ListMusic className="w-5 h-5 text-zinc-400" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white truncate">{p.name}</span>
                    <span className="block text-xs text-zinc-500 tabular">{p.tracks.length} songs</span>
                  </span>
                  {has && <Check className="w-5 h-5 text-sauti shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
