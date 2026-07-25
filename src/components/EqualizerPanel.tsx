import { useEffect, useState } from 'react';
import { X, SlidersHorizontal, Sparkles, Waves, Moon, Timer } from 'lucide-react';
import { EqSettings, EQ_FREQS, EQ_PRESETS, PRESET_EXTRAS, loadEq, saveEq } from '../services/eq';
import { useMusic } from '../hooks/useMusic';

const fmtDb = (mb: number) => `${mb > 0 ? '+' : ''}${(mb / 100).toFixed(0)} dB`;

export default function EqualizerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [eq, setEq] = useState<EqSettings>(() => loadEq());
  const { crossfade, setCrossfade, sleepTimer, setSleepTimer } = useMusic();

  // Re-read on open so it reflects anything changed elsewhere.
  useEffect(() => { if (open) setEq(loadEq()); }, [open]);

  const commit = (next: EqSettings) => { setEq(next); saveEq(next); };

  const setBand = (i: number, v: number) => {
    const bands = eq.bands.slice(); bands[i] = v;
    commit({ ...eq, bands, preset: 'Custom', on: true });
  };
  const usePreset = (name: string) => {
    const bands = EQ_PRESETS[name] || EQ_PRESETS.Flat;
    const ex = PRESET_EXTRAS[name];
    commit({ ...eq, bands: bands.slice(), preset: name, on: true, ...(ex ? { bass: ex.bass, spatial: ex.spatial, loud: ex.loud } : {}) });
  };

  if (!open) return null;

  return (
    <div role="dialog" data-tv-layer className="dark fixed inset-0 z-[135] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
      <div className="relative w-full sm:max-w-lg glass rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-4 border-b border-white/10 glass">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-sauti flex items-center justify-center shrink-0"><SlidersHorizontal className="w-5 h-5 text-amber-950" /></span>
            <div className="min-w-0">
              <p className="text-white font-display font-bold text-lg leading-tight">Equalizer</p>
              <p className="text-[11px] text-zinc-400 truncate">{eq.preset} · shapes all audio</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* master switch */}
            <button onClick={() => commit({ ...eq, on: !eq.on })} tabIndex={0} data-tv-focusable aria-pressed={eq.on}
              className={`relative w-14 h-8 rounded-full transition-colors ${eq.on ? 'bg-sauti' : 'bg-white/15'}`}>
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${eq.on ? 'left-7' : 'left-1'}`} />
            </button>
            <button onClick={onClose} tabIndex={0} data-tv-focusable data-tv-close className="w-10 h-10 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className={`p-4 space-y-5 transition-opacity ${eq.on ? '' : 'opacity-50'}`}>
          {/* Presets */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {Object.keys(EQ_PRESETS).map((name) => (
              <button key={name} onClick={() => usePreset(name)} tabIndex={0} data-tv-focusable
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${eq.preset === name ? 'bg-sauti text-amber-950 border-transparent' : 'glass-liquid text-white border-transparent'}`}>
                {name}
              </button>
            ))}
          </div>

          {/* Band sliders */}
          <div className="space-y-3.5">
            {EQ_FREQS.map((freq, i) => (
              <div key={freq} className="flex items-center gap-3">
                <span className="w-12 text-[11px] font-bold text-zinc-400 tabular shrink-0">{freq}</span>
                <input type="range" min={-1500} max={1500} step={100} value={eq.bands[i] ?? 0}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                  tabIndex={0} data-tv-focusable
                  className="flex-1 h-1.5 cursor-pointer accent-amber-500" style={{ accentColor: '#f59e0b' }} aria-label={`${freq} gain`} />
                <span className="w-12 text-right text-[11px] font-semibold text-zinc-300 tabular shrink-0">{fmtDb(eq.bands[i] ?? 0)}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-white/10" />

          {/* Bass + Spatial */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <span className="w-24 flex items-center gap-1.5 text-xs font-bold text-zinc-300 shrink-0"><Waves className="w-3.5 h-3.5 text-sauti" /> Bass Boost</span>
              <input type="range" min={0} max={1000} step={20} value={eq.bass}
                onChange={(e) => commit({ ...eq, bass: Number(e.target.value), on: true })}
                tabIndex={0} data-tv-focusable className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#f59e0b' }} aria-label="Bass boost" />
              <span className="w-10 text-right text-[11px] font-semibold text-zinc-300 tabular shrink-0">{Math.round(eq.bass / 10)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 flex items-center gap-1.5 text-xs font-bold text-zinc-300 shrink-0"><Sparkles className="w-3.5 h-3.5 text-sauti" /> Spatial 3D</span>
              <input type="range" min={0} max={1000} step={20} value={eq.spatial}
                onChange={(e) => commit({ ...eq, spatial: Number(e.target.value), on: true })}
                tabIndex={0} data-tv-focusable className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#f59e0b' }} aria-label="Spatial audio" />
              <span className="w-10 text-right text-[11px] font-semibold text-zinc-300 tabular shrink-0">{Math.round(eq.spatial / 10)}%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 flex items-center gap-1.5 text-xs font-bold text-zinc-300 shrink-0"><Waves className="w-3.5 h-3.5 text-sauti" /> Loudness</span>
              <input type="range" min={0} max={2000} step={50} value={eq.loud ?? 0}
                onChange={(e) => commit({ ...eq, loud: Number(e.target.value), on: true })}
                tabIndex={0} data-tv-focusable className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#f59e0b' }} aria-label="Loudness" />
              <span className="w-10 text-right text-[11px] font-semibold text-zinc-300 tabular shrink-0">{Math.round((eq.loud ?? 0) / 20)}%</span>
            </div>
          </div>

          <div className="h-px bg-white/10" />

          {/* Spotify Features: Crossfade + Sleep Timer */}
          <div className="space-y-4">
            <p className="text-xs font-bold text-sauti uppercase tracking-wider">Spotify Pro Audio Tuning</p>
            
            {/* Crossfade */}
            <div className="flex items-center gap-3">
              <span className="w-24 flex items-center gap-1.5 text-xs font-bold text-zinc-300 shrink-0"><Timer className="w-3.5 h-3.5 text-sauti" /> Crossfade</span>
              <input type="range" min={0} max={12} step={1} value={crossfade}
                onChange={(e) => setCrossfade(Number(e.target.value))}
                tabIndex={0} data-tv-focusable className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: '#f59e0b' }} aria-label="Crossfade duration" />
              <span className="w-10 text-right text-[11px] font-semibold text-zinc-300 tabular shrink-0">{crossfade > 0 ? `${crossfade}s` : 'Off'}</span>
            </div>

            {/* Sleep Timer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-300"><Moon className="w-3.5 h-3.5 text-sauti" /> Sleep Timer</span>
                <span className="text-[11px] font-bold text-zinc-400 tabular bg-white/5 px-2 py-0.5 rounded-md">
                  {sleepTimer > 0 ? `${Math.floor(sleepTimer / 60)}:${(sleepTimer % 60).toString().padStart(2, '0')} left` : 'Inactive'}
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
                {([
                  { label: 'Off', val: 0 },
                  { label: '5m', val: 300 },
                  { label: '10m', val: 600 },
                  { label: '15m', val: 900 },
                  { label: '30m', val: 1800 },
                  { label: '45m', val: 2700 },
                  { label: '1h', val: 3600 }
                ]).map((t) => {
                  const isCurrent = (t.val === 0 && sleepTimer === 0) || (t.val > 0 && Math.abs(sleepTimer - t.val) < 15);
                  return (
                    <button key={t.label} onClick={() => setSleepTimer(t.val)} tabIndex={0} data-tv-focusable
                      className={`px-3 py-1 rounded-lg text-[10px] font-black whitespace-nowrap transition-colors ${isCurrent ? 'bg-sauti text-amber-950 font-bold' : 'glass-liquid text-zinc-300 hover:text-white'}`}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Tuned at the system level, so it shapes every track in Sauti. Crossfade provides seamless, gapless song transition. Sleep Timer pauses audio automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
