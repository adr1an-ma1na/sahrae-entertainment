import { ExternalLink, Search } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { openOfficial, termsLabel, type OfficialOption } from '../services/animeProviders';
import { isTelevision } from '../tv/spatialNavigation';

/**
 * Anime only: the official services that carry this title in the viewer's
 * country (services/animeProviders.ts), above Sahrae's own servers. They open
 * outside Sahrae; none of them lets another app play its titles.
 *
 * A TV gets the same list as plain facts ("On Crunchyroll · Free with ads"):
 * many TVs have no browser to open a page in, and a button that may do
 * nothing is worse than none.
 */
export default function OfficialAnime({ options, compact = false }: { options: OfficialOption[]; compact?: boolean }) {
  if (!options.length) return null;
  const tv = isTelevision();
  const native = Capacitor.isNativePlatform();
  return (
    <section aria-label="Anime on official services" className={compact ? 'px-1 py-1' : 'mt-3'}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300/90">Anime · official services</p>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {options.map((o) => {
          const body = (
            <>
              {o.terms === 'search' ? <Search className="w-3.5 h-3.5" /> : !tv && <ExternalLink className="w-3.5 h-3.5" />}
              <span className="font-bold">{o.terms === 'search' ? `Search ${o.name}` : `${tv ? 'On' : 'Watch on'} ${o.name}`}</span>
              <span className="text-zinc-400 font-medium">· {termsLabel(o.terms)}</span>
            </>
          );
          const cls = 'h-9 px-3.5 rounded-full text-xs md:text-sm flex items-center gap-1.5 border whitespace-nowrap '
            + (o.terms === 'search' ? 'border-white/10 bg-zinc-900/70 text-zinc-300' : 'border-amber-400/40 bg-zinc-900/90 text-white');
          if (tv) {
            if (o.terms === 'search') return null;
            return <span key={o.key} className={cls}>{body}</span>;
          }
          return (
            <button key={o.key} type="button" onClick={() => openOfficial(o.url, native)} className={`${cls} hover:bg-white/10 hover:border-white active:scale-95`}
              title={`Opens ${o.name} outside Sahrae`}>
              {body}
            </button>
          );
        })}
      </div>
      {!tv && (
        <p className="text-[11px] text-zinc-500 mt-1.5">Opens outside Sahrae. Dub, Japanese audio and subtitles are chosen on the service; what each offers varies by title.</p>
      )}
    </section>
  );
}
