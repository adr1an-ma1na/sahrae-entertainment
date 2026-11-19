import { Pause, Play, Radio, X } from 'lucide-react';
import { useMusic } from '../../hooks/useMusic';
import { useRadio } from '../../hooks/useRadio';
import { t as tr } from '../../i18n';
import { CoverArt } from './CoverArt';

/**
 * What is playing, in the sidebar (owner, 2026-11-19: "if something is playing
 * we can have a snippet on the sidebar … blend well onto the UI, feel
 * expensive"). Music, a podcast, an audiobook or a live station: its art with
 * its own colour glowing softly behind, what it is (a book, a podcast), level
 * bars that move while it plays, play and pause (skipping is in the player), and a thin line of how far along it is. A tap anywhere else
 * on it opens the full player. Everything that moves only moves (the bars and
 * the line), so it costs nothing while the page is busy.
 */

/** Three small level bars, moving while sound plays, still when paused. */
export function LevelBars({ on, className = '' }: { on: boolean; className?: string }) {
  return (
    <span className={`np-bars ${on ? 'np-on' : ''} ${className}`} aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

const kindOf = (source: string, isPodcast?: boolean) => (source.startsWith('Audiobook:') ? 'Audiobook' : isPodcast ? 'Podcast' : 'Music');

export function SideNowPlaying({ tv = false }: { tv?: boolean }) {
  const { current, active, isPlaying, buffering, position, duration, toggle, setExpanded, queueSource } = useMusic();
  const radio = useRadio();

  // A live station takes the card while it plays (music pauses for it).
  if (radio.playingUrl) {
    const live = radio.status === 'live';
    return (
      <div className="side-np" role="group" aria-label={`${tr('Now playing')}: ${radio.playingName || 'Live radio'}`}>
        <div className="side-np-glow side-np-glow-radio" aria-hidden="true" />
        <div className="relative flex items-center gap-3 p-2.5">
          <div className="side-np-art grid place-items-center bg-gradient-to-br from-amber-400/25 to-amber-700/20">
            <Radio className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="side-np-kicker">{live ? <span className="np-live" aria-hidden="true" /> : null}{live ? 'Live radio' : 'Tuning in…'}</span>
            <span className="block text-[13px] font-semibold text-white truncate">{radio.playingName || 'Live radio'}</span>
          </div>
          <button onClick={() => radio.togglePlay(radio.playingUrl!, radio.playingName || '')} tabIndex={0} data-tv-focusable aria-label="Stop radio" className="side-np-play">
            <Pause className="w-4 h-4 fill-current" />
          </button>
          {!tv && (
            <button onClick={radio.stop} tabIndex={0} data-tv-focusable aria-label="Close radio" className="side-np-ghost">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!active || !current) return null;
  const kind = kindOf(queueSource || '', current.isPodcast);
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  const open = () => setExpanded(true);
  const art = current.artworkLarge || current.artwork;

  return (
    <div className="side-np" role="group" aria-label={`${tr('Now playing')}: ${current.title}`}>
      {art && <img src={art} alt="" aria-hidden="true" className="side-np-glow" loading="lazy" decoding="async" />}
      <div className="relative flex items-center gap-3 p-2.5">
        <button onClick={open} tabIndex={tv ? -1 : 0} aria-label={`Open the player: ${current.title}`} className="side-np-art shrink-0 focus:outline-none">
          <CoverArt imageUrl={current.artwork} dominantColor={current.dominantColor} className="w-full h-full" />
        </button>
        <button onClick={open} tabIndex={0} data-tv-focusable={tv || undefined} className="min-w-0 flex-1 text-left focus:outline-none" aria-label={`Open the player: ${current.title}`}>
          <span className="side-np-kicker"><LevelBars on={isPlaying && !buffering} />{tr(kind === 'Music' ? 'Now playing' : kind)}</span>
          <span className="block text-[13px] font-semibold text-white truncate leading-snug">{current.title}</span>
          <span className="block text-[11px] text-zinc-400 truncate">{current.artist}</span>
        </button>
        <button onClick={toggle} tabIndex={0} data-tv-focusable aria-label={isPlaying ? 'Pause' : 'Play'} className="side-np-play">
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-[1px]" />}
        </button>
      </div>
      <div className="side-np-track" aria-hidden="true"><div className="side-np-fill" style={{ transform: `scaleX(${pct.toFixed(4)})` }} /></div>
    </div>
  );
}

/** The icon rail's (tablets) version: the art, with the level bars over it. */
export function RailNowPlaying() {
  const { current, active, isPlaying, buffering, setExpanded } = useMusic();
  const radio = useRadio();
  if (radio.playingUrl) {
    return (
      <button onClick={() => radio.togglePlay(radio.playingUrl!, radio.playingName || '')} data-tv-focusable title={radio.playingName || 'Live radio'} aria-label="Stop radio"
        className="rail-np grid place-items-center bg-gradient-to-br from-amber-400/25 to-amber-700/20">
        <Radio className="w-5 h-5 text-amber-300" />
      </button>
    );
  }
  if (!active || !current) return null;
  return (
    <button onClick={() => setExpanded(true)} data-tv-focusable title={`${current.title} · ${current.artist}`} aria-label={`Open the player: ${current.title}`} className="rail-np">
      <CoverArt imageUrl={current.artwork} dominantColor={current.dominantColor} className="w-full h-full" />
      <span className="rail-np-veil"><LevelBars on={isPlaying && !buffering} /></span>
    </button>
  );
}
