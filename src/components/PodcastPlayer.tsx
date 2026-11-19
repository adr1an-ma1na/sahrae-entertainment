import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X, Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, Gauge, Moon, SlidersHorizontal, Heart, Headphones, Clapperboard, ListOrdered, FileText, ListMusic, BookOpen, Mic2 } from 'lucide-react';
import { useMusic } from '../hooks/useMusic';
import type { Track } from '../services/ytmusic';
import { fetchChapters } from '../services/podcastRss';
import { asVideoEpisode, audioEpisodeFor, couldHaveVideo, findEpisodeVideo } from '../services/episodeVideoFind';
import { chapterAt, parseNotes } from '../services/showNotes';
import { decodeEntities } from '../services/episodeVideo';
import { CoverArt } from './ui/CoverArt';
import { DynamicBackground } from './ui/DynamicBackground';

/**
 * Now Playing for podcasts and audiobooks (owner, 2026-11-19: "this podcast
 * player should not be the same as the music; curate one for podcasts").
 *
 * Built around the episode, not a song: its full title, the show, when it came
 * out and how long is left; skip back 15 and ahead 30; speed and a sleep timer
 * in reach; and beside it (below, on a phone) what an episode has instead of
 * lyrics: its notes, with times you can tap, its chapters, and what plays next.
 * A book shows its chapters.
 *
 * Listen or Watch: when the show posts the episode on YouTube (Diary of a CEO
 * and others, services/episodeVideoFind), Watch plays the show's own video from
 * the same second, and Listen goes back to the file where the video was. A
 * video-first episode (the Video podcasts shelf) simply shows or hides its
 * picture. No switch is shown when there is no video.
 */

const clock = (s: number) => {
  if (!s || !isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
};
const long = (s: number) => {
  if (!s || !isFinite(s)) return '';
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

type Tab = 'about' | 'chapters' | 'next';

export default function PodcastPlayer({ speed, cycleSpeed, sleepMin, cycleSleep, onEq, art }: {
  speed: number; cycleSpeed: () => void; sleepMin: number; cycleSleep: () => void; onEq: () => void; art?: string;
}) {
  const {
    current, isPlaying, buffering, position, duration, queue, index, queueSource, jumpTo, playQueue,
    toggle, stop, next, prev, seek, setExpanded, videoMode, setVideoMode, canShowVideo, setVideoSlot, toggleLike, isLiked,
  } = useMusic();
  const ep = current as Track;
  const isBook = queueSource.startsWith('Audiobook:') || ep.id.startsWith('ab:');

  // ── Listen ⇄ Watch ──
  const [video, setVideo] = useState<Track | null>(null);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    setVideo(null);
    if (!couldHaveVideo(ep, queueSource)) { setLooking(false); return; }
    let live = true;
    setLooking(true);
    findEpisodeVideo(ep).then((v) => { if (live) setVideo(v); }).finally(() => { if (live) setLooking(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep.id]);
  const hasVideo = canShowVideo || !!video;
  const watching = canShowVideo && videoMode;

  // A swap starts the other source, then goes to the second the first was at.
  // Only once the new one is really playing: just after the swap the player
  // still holds the old one's length, and a seek then is lost (it went back to
  // 0:05, 2026-11-19). It seeks, checks it landed, and tries again a few times.
  const pending = useRef<{ id: string; pos: number; tries: number; at: number } | null>(null);
  const swapTo = (t: Track, wantVideo: boolean) => {
    pending.current = { id: t.id, pos: position, tries: 0, at: Date.now() };
    playQueue(queue.map((q, i) => (i === index ? t : q)), index, queueSource);
    setVideoMode(wantVideo);
  };
  useEffect(() => {
    const p = pending.current;
    if (!p || ep.id !== p.id) return;
    if (p.pos <= 3) { pending.current = null; return; }
    if (!isPlaying || buffering || !(duration > 0)) return;
    if (p.tries > 0 && Math.abs(position - p.pos) < 8) { pending.current = null; return; } // there
    if (Date.now() - p.at < 900) return; // give the last seek (or the start) a moment
    if (p.tries >= 5) { pending.current = null; return; }
    p.tries++; p.at = Date.now();
    seek(Math.min(p.pos, duration - 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep.id, isPlaying, buffering, duration, position]);
  const watch = () => { if (canShowVideo) setVideoMode(true); else if (video) swapTo(asVideoEpisode(ep, video), true); };
  const listen = () => { const file = audioEpisodeFor(ep.id); if (file) swapTo(file, false); else setVideoMode(false); };

  // ── Chapters and notes ──
  const [chapters, setChapters] = useState<{ start: number; title: string }[]>([]);
  useEffect(() => {
    setChapters(ep.chapters || []);
    if (ep.chapters?.length || !ep.chaptersUrl) return;
    let live = true;
    fetchChapters(ep.chaptersUrl).then((c) => { if (live) setChapters(c); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep.id]);
  const total = duration || ep.duration || 0;
  const notes = useMemo(() => parseNotes(ep.description || '', total), [ep.id, Math.round(total / 60)]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapterNow = chapterAt(chapters, position);
  const upNext = queue.slice(index + 1);

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = isBook
    ? [{ id: 'chapters', label: 'Chapters', icon: ListOrdered }]
    : [
      { id: 'about', label: 'Episode', icon: FileText },
      ...(chapters.length ? [{ id: 'chapters' as Tab, label: `Chapters · ${chapters.length}`, icon: ListOrdered }] : []),
      { id: 'next', label: 'Up next', icon: ListMusic },
    ];
  const [tab, setTab] = useState<Tab>(isBook ? 'chapters' : 'about');
  useEffect(() => { if (!tabs.some((t) => t.id === tab)) setTab(tabs[0].id); }, [tabs.length, isBook]); // eslint-disable-line react-hooks/exhaustive-deps

  // A book chapter is titled "Stave 1"; its artist is "Book · Author".
  const [bookTitle, bookAuthor] = isBook ? ep.artist.split(' · ') : ['', ''];
  const title = decodeEntities(ep.title);
  const kicker = isBook ? 'Audiobook' : 'Podcast';
  const left = total > 0 ? Math.max(0, total - position) : 0;
  const cover = art || ep.artworkLarge || ep.artwork;

  const switcher = (hasVideo || looking) && !isBook ? (
    <div role="tablist" aria-label="Listen or watch" className="lux-seg">
      <button role="tab" aria-selected={!watching} aria-pressed={!watching} onClick={listen} tabIndex={0} data-tv-focusable><Headphones className="w-4 h-4" /> Listen</button>
      <button role="tab" aria-selected={watching} aria-pressed={watching} onClick={watch} disabled={!hasVideo} tabIndex={0} data-tv-focusable title={hasVideo ? 'Watch the video' : 'Looking for the video…'}>
        <Clapperboard className="w-4 h-4" /> {hasVideo ? 'Watch' : 'Looking…'}
      </button>
    </div>
  ) : null;

  const panel = (
    <div className="pod-panel-body">
      {tab === 'about' && (
        notes.length ? (
          <div className="pod-notes">
            {notes.map((b, i) => (
              <p key={i} className={b.bullet ? 'pod-bullet' : undefined}>
                {b.parts.map((p, k) => p.href
                  ? <a key={k} href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.text}</a>
                  : p.seek != null
                    ? <button key={k} type="button" className="pod-ts" onClick={() => seek(p.seek!)} data-tv-focusable>{p.text}</button>
                    : <span key={k}>{p.text}</span>)}
              </p>
            ))}
          </div>
        ) : <p className="text-sm text-zinc-400">This episode came without notes.</p>
      )}
      {tab === 'chapters' && (
        <ol className="pod-chapters">
          {isBook
            ? queue.map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <button type="button" onClick={() => jumpTo(i)} data-tv-focusable aria-current={i === index ? 'true' : undefined} className={i === index ? 'on' : ''}>
                  <span className="pod-ch-n">{i + 1}</span>
                  <span className="pod-ch-t">{decodeEntities(t.title)}</span>
                  <span className="pod-ch-d">{t.duration ? clock(t.duration) : ''}</span>
                </button>
              </li>
            ))
            : chapters.map((c, i) => (
              <li key={`${c.start}-${i}`}>
                <button type="button" onClick={() => seek(c.start)} data-tv-focusable aria-current={i === chapterNow ? 'true' : undefined} className={i === chapterNow ? 'on' : ''}>
                  <span className="pod-ch-n">{clock(c.start)}</span>
                  <span className="pod-ch-t">{c.title}</span>
                </button>
              </li>
            ))}
        </ol>
      )}
      {tab === 'next' && (
        upNext.length ? (
          <ul className="pod-next">
            {upNext.slice(0, 30).map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <button type="button" onClick={() => jumpTo(index + 1 + i)} data-tv-focusable>
                  <CoverArt imageUrl={t.artwork} dominantColor={t.dominantColor} className="w-12 h-12 shrink-0" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-white line-clamp-2">{decodeEntities(t.title)}</span>
                    <span className="block text-xs text-zinc-500 truncate">{[t.artist, t.date, long(t.duration)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-400">Nothing after this episode. Choose another from the show or your shows.</p>
      )}
    </div>
  );

  return (
    <div role="dialog" aria-label={`${kicker}: ${title}`} data-tv-layer className="lux-stage sauti pod-stage fixed inset-0 z-[120] overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
      <DynamicBackground color={ep.dominantColor} />
      {cover && (
        <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
          <img src={cover} alt="" className="np-bleed w-full h-full object-cover" decoding="async" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.7) 50%, #000 100%)' }} />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 45% at 15% 0%, rgb(var(--acc-rgb) / .22), transparent 70%), radial-gradient(55% 45% at 90% 100%, rgb(var(--acc2-rgb) / .24), transparent 70%)' }} />

      <div className="relative z-10 min-h-full flex flex-col px-5 md:px-8 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] max-w-xl lg:max-w-6xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between shrink-0">
          <button onClick={() => setExpanded(false)} data-tv-close tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Minimize">
            <ChevronDown className="w-6 h-6" />
          </button>
          <p className="overline truncate px-3 flex items-center gap-2">{isBook ? <BookOpen className="w-3.5 h-3.5" /> : <Mic2 className="w-3.5 h-3.5" />} {kicker}{!isBook && ep.artist ? ` · ${decodeEntities(ep.artist)}` : isBook ? ` · ${bookTitle}` : ''}</p>
          <div className="flex items-center gap-3 shrink-0">
            {switcher && <div className="hidden lg:block">{switcher}</div>}
            <button onClick={stop} tabIndex={0} data-tv-focusable className="w-11 h-11 rounded-full glass-liquid flex items-center justify-center text-white" aria-label="Stop">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="pod-grid flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 lg:gap-14 mt-6 lg:mt-4 lg:my-auto lg:py-2 items-start">
          {/* The episode */}
          <div className="min-w-0 flex flex-col">
            {/* Listen / Watch, only when there is a video (in the top bar on wide screens). */}
            {switcher && <div className="flex justify-center mb-4 lg:hidden">{switcher}</div>}

            {watching ? (
              /* The slot the live YouTube player is laid over (useMusic), 16:9, at least 200px tall as YouTube requires. */
              <div ref={setVideoSlot} className="pod-video w-full aspect-video min-h-[200px] rounded-3xl bg-black/70" aria-label="Episode video" />
            ) : (
              <div className="pod-art-wrap" style={{ transform: isPlaying ? 'scale(1)' : 'scale(.96)' }}>
                <div aria-hidden className="pod-art-glow" style={{ background: `radial-gradient(closest-side, ${ep.dominantColor || 'rgb(var(--acc-rgb))'}, transparent)` }} />
                <CoverArt imageUrl={cover} fallbackUrl={ep.artwork} dominantColor={ep.dominantColor} rounded="rounded-3xl" className="pod-art relative w-full aspect-square" />
              </div>
            )}

            {/* Title and show */}
            <div className="mt-6 lg:mt-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="pod-meta">{[isBook ? bookAuthor : ep.date, total ? long(total) : '', left > 60 && position > 30 ? `${long(left)} left` : ''].filter(Boolean).join(' · ')}</p>
                <h2 className="pod-title">{title}</h2>
                <p className="pod-show">{isBook ? bookTitle : decodeEntities(ep.artist)}</p>
              </div>
              {!isBook && (
                <button onClick={() => toggleLike(ep)} tabIndex={0} data-tv-focusable className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${isLiked(ep.id) ? 'text-sauti' : 'text-zinc-300 hover:text-white'}`} aria-label="Save episode">
                  <Heart className={`w-6 h-6 ${isLiked(ep.id) ? 'fill-current' : ''}`} />
                </button>
              )}
            </div>

            {/* Where we are */}
            <div className="mt-5 lg:mt-3">
              {chapterNow >= 0 && !isBook && (
                <button type="button" onClick={() => setTab('chapters')} className="pod-chapter-now" tabIndex={-1}>
                  <ListOrdered className="w-3.5 h-3.5" /> <span className="truncate">{chapters[chapterNow].title}</span>
                </button>
              )}
              <div className="relative">
                <input type="range" min={0} max={total || 0} value={Math.min(position, total || position)} step={1} onChange={(e) => seek(Number(e.target.value))} className="scrub w-full" aria-label="Seek" />
                {total > 0 && chapters.length > 1 && !isBook && (
                  <div aria-hidden className="pod-ticks">
                    {chapters.slice(1).map((c, i) => <span key={i} style={{ left: `${Math.min(100, (c.start / total) * 100)}%` }} />)}
                  </div>
                )}
              </div>
              <div className="flex justify-between text-[11px] text-zinc-400 tabular mt-2">
                <span>{clock(position)}</span>
                <span>{buffering ? 'Loading…' : total ? `-${clock(left)}` : ''}</span>
              </div>
            </div>

            {/* Transport */}
            <div className="mt-4 lg:mt-2 flex items-center justify-between max-w-md w-full mx-auto lg:mx-0">
              <button onClick={() => seek(Math.max(0, position - 15))} tabIndex={0} data-tv-focusable className="pod-skip" aria-label="Back 15 seconds"><RotateCcw className="w-7 h-7" /><span>15</span></button>
              <button onClick={prev} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label={isBook ? 'Previous chapter' : 'Previous'}><SkipBack className="w-6 h-6 fill-current" /></button>
              <button onClick={toggle} tabIndex={0} data-tv-focusable data-tv-autofocus className="lux-btn w-[76px] h-[76px]" aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
              </button>
              <button onClick={next} tabIndex={0} data-tv-focusable className="w-12 h-12 flex items-center justify-center text-white" aria-label={isBook ? 'Next chapter' : 'Next'}><SkipForward className="w-6 h-6 fill-current" /></button>
              <button onClick={() => seek(Math.min(total || position + 30, position + 30))} tabIndex={0} data-tv-focusable className="pod-skip" aria-label="Ahead 30 seconds"><RotateCw className="w-7 h-7" /><span>30</span></button>
            </div>

            {/* Speed, sleep, sound */}
            <div className="mt-6 lg:mt-4 flex items-center justify-center lg:justify-start gap-2 flex-wrap">
              <button onClick={cycleSpeed} tabIndex={0} data-tv-focusable className={`pod-pill ${speed !== 1 ? 'on' : ''}`} aria-label={`Speed ${speed}×`}><Gauge className="w-4 h-4" /> {speed}×</button>
              <button onClick={cycleSleep} tabIndex={0} data-tv-focusable className={`pod-pill ${sleepMin > 0 ? 'on' : ''}`} aria-label="Sleep timer"><Moon className="w-4 h-4" /> {sleepMin > 0 ? `${sleepMin} min` : 'Sleep'}</button>
              {!watching && <button onClick={onEq} tabIndex={0} data-tv-focusable className="pod-pill" aria-label="Equalizer"><SlidersHorizontal className="w-4 h-4" /> Sound</button>}
            </div>
          </div>

          {/* Notes, chapters, up next */}
          <section className="pod-panel min-w-0" aria-label="About this episode">
            {tabs.length > 1 ? (
              <div role="tablist" className="lux-seg mb-4">
                {tabs.map((t) => (
                  <button key={t.id} role="tab" aria-selected={tab === t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} tabIndex={0} data-tv-focusable>
                    <t.icon className="w-4 h-4" /> {t.label}
                  </button>
                ))}
              </div>
            ) : <p className="overline mb-4">{tabs[0].label}</p>}
            {panel}
          </section>
        </div>
      </div>
    </div>
  );
}
