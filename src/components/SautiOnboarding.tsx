import { useMemo, useState } from 'react';
import { Check, Loader2, Search, Sparkles, X } from 'lucide-react';
import { ytmusic, type Artist } from '../services/ytmusic';

/**
 * First-run Sauti taste onboarding (cold-start fix). A brand-new listener has no
 * history, so the recommender has nothing to work with. This picker captures
 * the artists they love up front; the parent turns them into taste seeds, so
 * Made for you, the Daily Mixes and Release Radar are built around them from
 * the first open and keep growing with what they play and like.
 *
 * A wide catalogue (owner, 2026-10-28: "so many musicians that they can select
 * and search"), grouped by where the music comes from, filtered as you type,
 * and a YouTube search for anyone not listed. The YouTube search is only run
 * on a press: each one spends a share of the day's API allowance.
 */
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
  { id: 'classics', name: 'Classics', artists: ['Michael Jackson', 'Whitney Houston', 'Lucky Dube', 'Brenda Fassie', 'Fela Kuti', 'Franco & TPOK Jazz'] },
];
export const ONBOARDING_ARTIST_COUNT = GROUPS.reduce((n, g) => n + g.artists.length, 0);

const GRADS = [
  'from-rose-500 to-orange-600', 'from-emerald-500 to-teal-700', 'from-sky-500 to-indigo-700',
  'from-violet-500 to-fuchsia-700', 'from-fuchsia-500 to-rose-700', 'from-cyan-500 to-blue-700',
  'from-lime-500 to-emerald-700', 'from-indigo-500 to-purple-800', 'from-amber-400 to-orange-700',
  'from-teal-400 to-cyan-700',
];
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const gradFor = (n: string) => GRADS[hashStr(n) % GRADS.length];
const monogram = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function ArtistTile({ name, sub, image, on, onToggle }: { name: string; sub?: string; image?: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} tabIndex={0} data-tv-focusable aria-pressed={on} aria-label={name}
      className={`group text-center focus:outline-none transition-transform ${on ? 'scale-[1.03]' : 'hover:scale-[1.03]'}`}>
      <span className={`relative block aspect-square rounded-full overflow-hidden bg-gradient-to-br ${gradFor(name)} shadow-lg ${on ? 'ring-[3px] ring-amber-400 shadow-[0_10px_30px_-10px_rgb(var(--acc-rgb)/0.8)]' : 'ring-1 ring-white/10 group-focus-visible:ring-2 group-focus-visible:ring-amber-400'}`}>
        {image
          ? <img src={image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
          : <span className="absolute inset-0 flex items-center justify-center font-display font-black text-[#fff]/95 text-2xl md:text-3xl tracking-tight drop-shadow">{monogram(name)}</span>}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/25" />
        <span className={`absolute inset-0 bg-black/45 flex items-center justify-center transition-opacity ${on ? 'opacity-100' : 'opacity-0'}`}>
          <span className="w-9 h-9 rounded-full bg-sauti flex items-center justify-center shadow-lg"><Check className="w-5 h-5 text-amber-950" strokeWidth={3} /></span>
        </span>
      </span>
      <span className={`block mt-2 text-xs font-semibold truncate ${on ? 'text-sauti' : 'text-white'}`}>{name}</span>
      {sub && <span className="block text-[10px] text-zinc-500 truncate">{sub}</span>}
    </button>
  );
}

export default function SautiOnboarding({ onComplete, onSkip }: { onComplete: (names: string[]) => Promise<void> | void; onSkip: () => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Artist[] | null>(null);
  const [finding, setFinding] = useState(false);

  const toggle = (n: string) => setSel((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  const enough = sel.length >= 3;

  // The catalogue, narrowed by group and by what is typed.
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return GROUPS
      .filter((g) => group === 'all' || g.id === group)
      .map((g) => ({ ...g, artists: q ? g.artists.filter((a) => fold(a).includes(q)) : g.artists }))
      .filter((g) => g.artists.length);
  }, [group, query]);

  const findOnYouTube = async () => {
    const q = query.trim();
    if (q.length < 2 || finding) return;
    setFinding(true);
    try { setFound((await ytmusic.searchArtists(q)).slice(0, 12)); } catch { setFound([]); }
    finally { setFinding(false); }
  };

  const start = async () => {
    if (!enough || busy) return;
    setBusy(true);
    try { await onComplete(sel); } catch { /* parent still completes */ }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up Sauti" className="fixed inset-0 z-[120] bg-[#09090b] overflow-y-auto">
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 right-0 h-80 opacity-80"
        style={{ background: 'radial-gradient(55% 70% at 15% 0%, rgba(251,191,36,0.24), transparent 70%), radial-gradient(50% 60% at 85% 6%, rgba(236,72,153,0.16), transparent 72%)', filter: 'blur(10px)' }} />

      <div className="relative max-w-5xl mx-auto px-5 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-48">
        <p className="lux-kicker mb-3"><Sparkles className="w-3.5 h-3.5" />Welcome to Sauti</p>
        <h1 className="lux-title text-4xl md:text-6xl pb-1 mb-3">Who do you love?</h1>
        <p className="text-zinc-400 text-sm md:text-base mb-6 max-w-2xl">
          Pick <span className="text-sauti font-semibold">3 or more</span> from {ONBOARDING_ARTIST_COUNT} artists, or search for anyone.
          Your Daily Mixes, Release Radar and Made for you start from them and grow with every song you play and like.
        </p>

        {/* Search: the catalogue narrows as you type; anyone else is one press away on YouTube. */}
        <div className="sticky top-0 z-10 -mx-5 px-5 py-3 bg-[#09090b]/90 backdrop-blur-xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute z-10 left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setFound(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void findOnYouTube(); }}
                placeholder="Search for an artist…" aria-label="Search for an artist" className="w-full lux-field pl-10 pr-10 py-3 text-sm" />
              {query && (
                <button onClick={() => { setQuery(''); setFound(null); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
              )}
            </div>
            {query.trim().length >= 2 && (
              <button onClick={() => void findOnYouTube()} disabled={finding} data-tv-focusable className="lux-btn px-4 py-2.5 text-sm shrink-0">
                {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} <span className="hidden sm:inline">Find on YouTube</span>
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 pb-1">
            <button onClick={() => setGroup('all')} aria-pressed={group === 'all'} data-tv-focusable className="lux-chip">All</button>
            {GROUPS.map((g) => (
              <button key={g.id} onClick={() => setGroup(g.id)} aria-pressed={group === g.id} data-tv-focusable className="lux-chip">{g.name}</button>
            ))}
          </div>
        </div>

        {found && (
          <section className="mt-6">
            <h2 className="lux-h text-lg mb-4">On YouTube</h2>
            {found.length === 0
              ? <p className="text-sm text-zinc-400">No artist by that name. Check the spelling, or try their stage name.</p>
              : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                  {found.map((a) => <ArtistTile key={a.id} name={a.name} image={a.thumbnail} on={sel.includes(a.name)} onToggle={() => toggle(a.name)} />)}
                </div>
              )}
          </section>
        )}

        {shown.map((g) => (
          <section key={g.id} className="mt-8">
            <h2 className="lux-h text-lg mb-4">{g.name}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {g.artists.map((a) => <ArtistTile key={a} name={a} on={sel.includes(a)} onToggle={() => toggle(a)} />)}
            </div>
          </section>
        ))}
        {!shown.length && !found && (
          <p className="mt-8 text-sm text-zinc-400">Not in the list. Press <span className="text-white font-semibold">Find on YouTube</span> to search for them.</p>
        )}
      </div>

      {/* Your picks, and the way in. */}
      <div className="fixed bottom-0 left-0 right-0 z-[121] glass border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <div className="max-w-5xl mx-auto px-5">
          {sel.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-2.5">
              {sel.map((n) => (
                <button key={n} onClick={() => toggle(n)} aria-label={`Remove ${n}`} className="lux-chip" aria-pressed>
                  {n} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={onSkip} disabled={busy} className="text-sm font-semibold text-zinc-400 hover:text-white px-3 py-2.5 disabled:opacity-40">Maybe later</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 tabular hidden sm:block">{sel.length} picked{!enough ? ` · ${3 - sel.length} more` : ''}</span>
              <button onClick={start} disabled={!enough || busy} data-tv-focusable className="lux-btn px-6 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Tuning Sauti…</> : <><Sparkles className="w-4 h-4" /> Start listening</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
