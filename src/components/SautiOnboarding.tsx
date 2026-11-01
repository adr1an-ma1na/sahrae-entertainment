import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, Sparkles, X, ChevronLeft } from 'lucide-react';
import { deezer } from '../services/deezer';
import { artistNamed } from '../services/sautiMixes';
import { GENRES, GENRE_GROUPS, searchGenres } from '../services/genres';
import type { CArtist } from '../services/curate';

/**
 * Sauti's first run, the way Spotify's works.
 *
 *   1. Artists. Real photos; search reaches the whole catalogue (Deezer), not
 *      a fixed list; picking an artist brings their related artists in right
 *      beside it, so one choice leads to the next.
 *   2. Genres. Every genre Sauti has, searchable (services/genres.ts).
 *
 * The picks are the seeds of the Daily Mixes and genre mixes (sautiMixes.ts),
 * which keep growing with what is played.
 */
// Where suggestions start: well-known artists by region, looked up for photos.
const GROUPS: { id: string; name: string; artists: string[] }[] = [
  { id: 'ke', name: 'Kenya', artists: ['Sauti Sol', 'Bien', 'Nyashinski', 'Otile Brown', 'Nviiri the Storyteller', 'Bensoul', 'Khaligraph Jones', 'Wakadinali', 'Nikita Kering', 'Mejja', 'Bahati', 'Willy Paul', 'Arrow Bwoy', 'Fena Gitu', 'Wanavokali', 'Ssaru', 'Iyanii', 'Okello Max', 'Charisma', 'Kaskazini'] },
  { id: 'eastafrica', name: 'Tanzania & Uganda', artists: ['Diamond Platnumz', 'Harmonize', 'Rayvanny', 'Zuchu', 'Ali Kiba', 'Marioo', 'Jux', 'Nandy', 'Mbosso', 'Eddy Kenzo', 'Azawi', 'Sheebah', 'Bebe Cool', 'Joshua Baraka'] },
  { id: 'westafrica', name: 'Nigeria & Ghana', artists: ['Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Asake', 'Ayra Starr', 'Tems', 'Omah Lay', 'Fireboy DML', 'Olamide', 'Kizz Daniel', 'Seyi Vibez', 'Shallipopi', 'Tiwa Savage', 'Yemi Alade', 'CKay', 'Black Sherif', 'Sarkodie', 'Stonebwoy', 'King Promise', 'Shatta Wale'] },
  { id: 'southafrica', name: 'South Africa & Amapiano', artists: ['Tyla', 'Kabza De Small', 'Uncle Waffles', 'DJ Maphorisa', 'Focalistic', 'Kelvin Momo', 'Young Stunna', 'Master KG', 'Nasty C', 'Cassper Nyovest', 'Makhadzi', 'Black Coffee'] },
  { id: 'congo', name: 'Congo & Francophone', artists: ['Fally Ipupa', 'Koffi Olomide', "Innoss'B", 'Ferre Gola', 'Aya Nakamura', 'Gims', 'Dadju', 'Tayc'] },
  { id: 'gospel', name: 'Gospel & Worship', artists: ['Mercy Chinwo', 'Moses Bliss', 'Guardian Angel', 'Christina Shusho', 'Size 8', 'Israel Mbonyi', 'Maverick City Music', 'CeCe Winans', 'Kirk Franklin', 'Hillsong Worship'] },
  { id: 'hiphop', name: 'Hip-hop & R&B', artists: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Future', '21 Savage', 'J. Cole', 'Metro Boomin', 'SZA', 'The Weeknd', 'Chris Brown', 'Usher', 'Summer Walker', 'Brent Faiyaz', 'Beyoncé', 'Rihanna', 'Doja Cat', 'Cardi B', 'Nicki Minaj'] },
  { id: 'pop', name: 'Pop', artists: ['Taylor Swift', 'Billie Eilish', 'Sabrina Carpenter', 'Olivia Rodrigo', 'Dua Lipa', 'Bruno Mars', 'Ariana Grande', 'Ed Sheeran', 'Justin Bieber', 'Miley Cyrus', 'Chappell Roan', 'Lady Gaga'] },
  { id: 'uk', name: 'UK', artists: ['Adele', 'Dave', 'Central Cee', 'Stormzy', 'Little Simz', 'Raye', 'Sam Smith', 'Coldplay', 'Harry Styles'] },
  { id: 'latin', name: 'Latin', artists: ['Bad Bunny', 'Karol G', 'Peso Pluma', 'Shakira', 'Rosalía', 'J Balvin', 'Anitta'] },
  { id: 'reggae', name: 'Reggae & Dancehall', artists: ['Bob Marley & The Wailers', 'Damian Marley', 'Chronixx', 'Popcaan', 'Vybz Kartel', 'Shenseea'] },
  { id: 'rock', name: 'Rock & Alternative', artists: ['Imagine Dragons', 'Linkin Park', 'Arctic Monkeys', 'Twenty One Pilots', 'Queen'] },
  { id: 'classics', name: 'Classics', artists: ['Michael Jackson', 'Whitney Houston', 'Lucky Dube', 'Brenda Fassie', 'Fela Kuti', 'Franco & le T.P OK Jazz'] },
];

const ROWS = [{ id: 'charts', name: 'Global charts', artists: [] as string[] }, ...GROUPS];
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const monogram = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function ArtistBubble({ a, on, from, onToggle }: { a: CArtist; on: boolean; from?: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-pressed={on} aria-label={a.name}
      className={`group text-center focus:outline-none transition-transform duration-300 ${on ? 'scale-[1.04]' : 'hover:scale-[1.04]'} ${from ? 'lux-enter' : ''}`}>
      <span className={`relative block aspect-square rounded-full overflow-hidden bg-zinc-800 shadow-lg transition-shadow ${on ? 'ring-[3px] ring-amber-400 shadow-[0_12px_32px_-10px_rgb(var(--acc-rgb)/0.85)]' : 'ring-1 ring-white/10 group-focus-visible:ring-2 group-focus-visible:ring-amber-400'}`}>
        {a.picture
          ? <img src={a.picture} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center font-display font-black text-[#fff]/90 text-2xl bg-gradient-to-br from-zinc-700 to-zinc-900">{monogram(a.name)}</span>}
        <span className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}>
          <span className="w-9 h-9 rounded-full bg-sauti flex items-center justify-center shadow-lg"><Check className="w-5 h-5 text-amber-950" strokeWidth={3} /></span>
        </span>
      </span>
      <span className={`block mt-2 text-xs font-semibold truncate ${on ? 'text-sauti' : 'text-white'}`}>{a.name}</span>
      {from && <span className="block text-[10px] text-zinc-500 truncate">Like {from}</span>}
    </button>
  );
}

export interface OnboardingResult { artists: CArtist[]; genres: string[] }

export default function SautiOnboarding({ onComplete, onSkip }: { onComplete: (r: OnboardingResult) => Promise<void> | void; onSkip: () => void }) {
  const [step, setStep] = useState<'artists' | 'genres'>('artists');
  const [picked, setPicked] = useState<CArtist[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [row, setRow] = useState<string>(GROUPS[0].id);
  const [shown, setShown] = useState<CArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CArtist[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [gQuery, setGQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // Related artists brought in beside a pick: artist id -> the pick's name.
  const [suggested, setSuggested] = useState<Record<number, string>>({});
  const tRef = useRef<number | undefined>(undefined);

  // A row's artists, with their photos, as they come.
  useEffect(() => {
    let live = true;
    setLoading(true); setShown([]); setSuggested({});
    (async () => {
      if (row === 'charts') {
        const a = await deezer.chartArtists(48).catch(() => [] as CArtist[]);
        if (live) setShown(a);
      } else {
        const names = GROUPS.find((x) => x.id === row)?.artists || [];
        // Placeholders first, photos as each lookup lands.
        if (live) setShown(names.map((n, i) => ({ id: -1 - i, name: n })));
        await Promise.all(names.map(async (n, i) => {
          const a = await artistNamed(n).catch(() => null);
          if (live && a) setShown((cur) => cur.map((x) => (x.id === -1 - i ? a : x)));
        }));
      }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [row]);

  // Search the whole catalogue as you type.
  useEffect(() => {
    window.clearTimeout(tRef.current);
    const q = query.trim();
    if (q.length < 2) { setFound(null); setSearching(false); return; }
    setSearching(true);
    tRef.current = window.setTimeout(async () => {
      const r = await deezer.searchArtists(q, 30, true).catch(() => [] as CArtist[]);
      setFound(r); setSearching(false);
    }, 350);
  }, [query]);

  const isOn = (a: CArtist) => picked.some((p) => p.id === a.id || fold(p.name) === fold(a.name));
  const toggle = async (a: CArtist) => {
    if (a.id < 0) return; // still looking it up
    if (isOn(a)) { setPicked((p) => p.filter((x) => x.id !== a.id)); return; }
    setPicked((p) => [...p, a]);
    // Spotify's way: the artists related to a pick appear right after it.
    const rel = (await deezer.related(a.id, 6, true).catch(() => [] as CArtist[])).filter((r) => !isOn(r));
    const put = (list: CArtist[]) => {
      const have = new Set(list.map((x) => x.id));
      const add = rel.filter((r) => !have.has(r.id));
      if (!add.length) return list;
      const at = list.findIndex((x) => x.id === a.id);
      if (at < 0) return list;
      return [...list.slice(0, at + 1), ...add, ...list.slice(at + 1)];
    };
    setSuggested((s) => ({ ...s, ...Object.fromEntries(rel.map((r) => [r.id, a.name])) }));
    if (found) setFound((f) => (f ? put(f) : f)); else setShown(put);
  };

  const genreList = useMemo(() => searchGenres(gQuery), [gQuery]);
  const toggleGenre = (id: string) => setGenres((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try { await onComplete({ artists: picked, genres }); } catch { /* the parent still closes */ }
  };

  const list = found ?? shown;
  const enough = picked.length >= 3;

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up Sauti" className="fixed inset-0 z-[120] bg-[#09090b] overflow-y-auto">
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 right-0 h-96 opacity-80"
        style={{ background: 'radial-gradient(55% 70% at 15% 0%, rgb(var(--acc-rgb) / 0.26), transparent 70%), radial-gradient(50% 60% at 85% 6%, rgb(var(--acc2-rgb) / 0.22), transparent 72%)', filter: 'blur(10px)' }} />

      <div className="relative max-w-5xl mx-auto px-5 pt-[calc(env(safe-area-inset-top)+2.25rem)] pb-48">
        <div className="flex items-center justify-between mb-4">
          <p className="lux-kicker"><Sparkles className="w-3.5 h-3.5" />Welcome to Sauti · step {step === 'artists' ? 1 : 2} of 2</p>
          {step === 'genres' && <button onClick={() => setStep('artists')} className="text-sm text-zinc-400 hover:text-white flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Artists</button>}
        </div>

        {step === 'artists' ? (
          <>
            <h1 className="lux-title text-4xl md:text-6xl pb-1 mb-2">Choose artists you like.</h1>
            <p className="text-zinc-400 text-sm md:text-base mb-6 max-w-2xl">Pick three or more. Search for anyone; each pick brings artists like them alongside. Your Daily Mixes are built from these and grow with every song you play.</p>

            <div className="sticky top-0 z-10 -mx-5 px-5 py-3 bg-[#09090b]/90 backdrop-blur-xl">
              <div className="relative">
                <Search className="absolute z-10 left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any artist" aria-label="Search any artist"
                  className="w-full lux-field pl-12 pr-11 py-3.5 text-base" />
                {searching ? <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 animate-spin" />
                  : query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>}
              </div>
              {!found && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 pb-1">
                  {ROWS.map((r) => (
                    <button key={r.id} onClick={() => setRow(r.id)} aria-pressed={row === r.id} data-tv-focusable className="lux-chip">{r.name}</button>
                  ))}
                </div>
              )}
            </div>

            {found && found.length === 0 && <p className="mt-8 text-sm text-zinc-400">No artist by that name. Check the spelling, or try their stage name.</p>}
            <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-4 gap-y-6">
              {list.map((a) => <ArtistBubble key={a.id} a={a} on={isOn(a)} from={suggested[a.id]} onToggle={() => void toggle(a)} />)}
            </div>
            {loading && !list.length && <div className="mt-10 flex justify-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>}
          </>
        ) : (
          <>
            <h1 className="lux-title text-4xl md:text-6xl pb-1 mb-2">And the sounds you love?</h1>
            <p className="text-zinc-400 text-sm md:text-base mb-6 max-w-2xl">Optional. Each genre you pick becomes a mix of its real artists, from Rumba and Bongo Flava to Amapiano, Gospel and Jazz.</p>
            <div className="sticky top-0 z-10 -mx-5 px-5 py-3 bg-[#09090b]/90 backdrop-blur-xl">
              <div className="relative">
                <Search className="absolute z-10 left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input value={gQuery} onChange={(e) => setGQuery(e.target.value)} placeholder="Search genres or artists" aria-label="Search genres"
                  className="w-full lux-field pl-12 pr-4 py-3.5 text-base" />
              </div>
            </div>
            {GENRE_GROUPS.map((group) => {
              const items = genreList.filter((x) => x.group === group);
              if (!items.length) return null;
              return (
                <section key={group} className="mt-7">
                  <h2 className="lux-h text-lg mb-3">{group}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {items.map((x) => {
                      const on = genres.includes(x.id);
                      return (
                        <button key={x.id} onClick={() => toggleGenre(x.id)} aria-pressed={on} data-tv-focusable
                          className={`relative h-20 rounded-2xl overflow-hidden text-left p-3 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${on ? 'scale-[1.02] ring-[3px] ring-amber-400' : 'hover:scale-[1.02]'}`}
                          style={{ background: `linear-gradient(135deg, ${x.tint}, ${x.tint}99)` }}>
                          <span className="relative font-display font-bold text-[15px] leading-tight text-[#fff]">{x.name}</span>
                          {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#fff] flex items-center justify-center"><Check className="w-4 h-4 text-black" strokeWidth={3} /></span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {!genreList.length && <p className="mt-8 text-sm text-zinc-400">No genre by that name yet.</p>}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[121] glass border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="max-w-5xl mx-auto px-5">
          {step === 'artists' && picked.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2.5">
              {picked.map((a) => (
                <button key={a.id} onClick={() => void toggle(a)} aria-label={`Remove ${a.name}`} className="shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-white">
                  {a.picture ? <img src={a.picture} alt="" className="w-6 h-6 rounded-full object-cover" /> : null}{a.name}<X className="w-3 h-3 text-zinc-400" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={onSkip} disabled={busy} className="text-sm font-semibold text-zinc-400 hover:text-white px-3 py-2.5 disabled:opacity-40">Maybe later</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 tabular hidden sm:block">
                {step === 'artists' ? `${picked.length} picked${!enough ? ` · ${3 - picked.length} more` : ''}` : `${genres.length} genres`}
              </span>
              {step === 'artists' ? (
                <button onClick={() => setStep('genres')} disabled={!enough} data-tv-focusable className="lux-btn px-7 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
              ) : (
                <button onClick={() => void finish()} disabled={busy} data-tv-focusable className="lux-btn px-7 py-2.5 text-sm">
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Building your mixes…</> : <><Sparkles className="w-4 h-4" /> {genres.length ? 'Done' : 'Skip and finish'}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
