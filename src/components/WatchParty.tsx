import { useEffect, useRef, useState } from 'react';
import { Copy, LogOut, Play, Send, Share2, Users, X } from 'lucide-react';
import { joinRoom, leaveRoom, partyName, playingTitle, roomLink, sendChat, sendReaction, setPartyName, startCountdown, startRoom, useRoom } from '../services/room';
import { REACTIONS, normalizeCode } from '../services/linkCore';
import { linkAvailable } from '../services/link';
import { haptics } from '../services/haptics';

/**
 * Watch together: a side panel (start or join a party, who is here, chat,
 * reactions, "start together"), reactions floating over the screen, and the
 * shared countdown. Opened from the player's Together button, or by a
 * ?room=CODE link.
 */

export const OPEN_PARTY = 'sahrae:open-party';

function Countdown({ end, by }: { end: number; by: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const left = Math.ceil((end - now) / 1000);
  if (left < -1) return null;
  return (
    <div className="fixed inset-0 z-[118] pointer-events-none flex items-center justify-center" role="alert" aria-live="assertive">
      <div className="bg-black/75 rounded-3xl px-12 py-8 text-center backdrop-blur-sm">
        <p className="text-8xl font-black text-amber-300 tabular-nums">{left > 0 ? left : 'Play!'}</p>
        <p className="text-white font-semibold mt-2">{left > 0 ? 'Get ready to press play' : 'Press play now'}</p>
        {by && <p className="text-xs text-zinc-400 mt-1">Started by {by}</p>}
      </div>
    </div>
  );
}

export default function WatchParty() {
  const room = useRoom();
  const nowTitle = playingTitle();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(partyName());
  const [joinCode, setJoinCode] = useState('');
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const c = p.get('room');
      if (c && normalizeCode(c)) {
        joinRoom(c);
        setOpen(true);
        p.delete('room');
        const q = p.toString();
        window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
      }
    } catch { /* no URL */ }
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PARTY, onOpen);
    return () => window.removeEventListener(OPEN_PARTY, onOpen);
  }, []);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [room.chat.length, open]);

  const saveName = (n: string) => { setName(n); setPartyName(n); };
  const link = room.code ? roomLink(room.code) : '';
  const share = async () => {
    haptics.tap();
    const data = { title: 'Watch with me on Sahrae', text: room.now?.title ? `Join me watching ${room.now.title}` : 'Join my watch party', url: link };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch { /* cancelled or unsupported: copy instead */ }
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the code is on screen */ }
  };

  const here = room.peers.length + 1;

  return (
    <>
      {/* Reactions float up from the corner, from everyone in the room. */}
      <div className="fixed bottom-24 right-6 z-[116] pointer-events-none flex flex-col-reverse items-end gap-1">
        {room.floating.map((f) => (
          <div key={f.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700 flex items-center gap-1.5 bg-black/60 rounded-full pl-1.5 pr-3 py-1">
            <span className="text-2xl">{f.emoji}</span><span className="text-xs text-white font-semibold">{f.name}</span>
          </div>
        ))}
      </div>

      {room.countdownEnd && <Countdown key={room.countdownEnd} end={room.countdownEnd} by={room.countdownBy} />}

      {room.code && !open && (
        <button onClick={() => setOpen(true)} data-tv-focusable
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[115] px-4 py-2 rounded-full bg-amber-400 text-amber-950 font-bold text-sm shadow-xl flex items-center gap-2">
          <Users className="w-4 h-4" />Watch party · {here} here
        </button>
      )}

      {open && (
        <aside className="fixed top-0 right-0 bottom-0 z-[117] w-full sm:w-96 bg-zinc-950/97 border-l border-white/10 shadow-2xl flex flex-col" role="dialog" aria-label="Watch together">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users className="w-5 h-5 text-amber-400" />Watch together</h2>
            <button onClick={() => setOpen(false)} aria-label="Close" data-tv-focusable className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {!linkAvailable() ? (
            <p className="p-4 text-zinc-300 text-sm">Watch parties need an internet connection to Sahrae's link service, which is not available here.</p>
          ) : !room.code ? (
            <div className="p-4 flex flex-col gap-4">
              <label className="text-sm text-zinc-300">Your name in the party
                <input value={name} onChange={(e) => saveName(e.target.value)} maxLength={24} placeholder="e.g. Adrian"
                  className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400" />
              </label>
              {nowTitle ? (
                <button onClick={() => { haptics.tap(); startRoom(); }} className="py-3 rounded-full bg-amber-400 text-amber-950 font-bold">
                  Start a party for {nowTitle}
                </button>
              ) : (
                <p className="text-sm text-zinc-400">Open a film or an episode, then press <b>Together</b> in the player to start a party for it.</p>
              )}
              <div className="border-t border-white/10 pt-4">
                <p className="text-sm text-zinc-300 mb-2">Or join a friend's party</p>
                <div className="flex gap-2">
                  <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Code" maxLength={8} autoCapitalize="characters"
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest uppercase outline-none focus:border-amber-400" />
                  <button disabled={!normalizeCode(joinCode)} onClick={() => joinRoom(joinCode)} className="px-4 rounded-xl bg-white text-black font-bold disabled:opacity-40">Join</button>
                </div>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">Everyone opens the same title on the same server. Each phone plays its own stream, so use the countdown to press play together.</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="p-4 flex flex-col gap-3 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-400">{room.status === 'live' ? `${here} here` : room.status === 'down' ? 'Not connected' : 'Connecting…'}</span>
                  <span className="font-mono font-bold tracking-widest text-white">{room.code}</span>
                </div>
                {room.now?.title && <p className="text-sm text-white">Watching <b>{room.now.title}</b>{room.now.type === 'tv' ? ` · S${room.now.s} E${room.now.e}` : ''}</p>}
                {!room.host && !room.now && <p className="text-sm text-zinc-400">Waiting for the host to play something…</p>}
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-xs font-semibold">{name || 'Guest'} (you)</span>
                  {room.peers.map((p) => <span key={p.id} className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 text-xs font-semibold">{p.name || 'Guest'}{p.role === 'host' ? ' · host' : ''}</span>)}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => void share()} className="flex-1 py-2 rounded-full bg-white text-black text-sm font-bold flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" />Invite</button>
                  <button onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }} className="px-3 rounded-full bg-zinc-800 text-white text-sm font-semibold flex items-center gap-1.5"><Copy className="w-4 h-4" />{copied ? 'Copied' : 'Link'}</button>
                  <button onClick={() => { haptics.tap(); startCountdown(5); }} className="px-3 rounded-full bg-amber-400 text-amber-950 text-sm font-bold flex items-center gap-1.5" title="Everyone sees a 5-second countdown to press play"><Play className="w-4 h-4 fill-current" />Start together</button>
                </div>
              </div>

              <div className="flex gap-1 justify-around px-4 py-2 border-b border-white/10">
                {REACTIONS.map((e) => <button key={e} onClick={() => sendReaction(e)} className="text-2xl active:scale-90 transition-transform" aria-label={`Send ${e}`}>{e}</button>)}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2">
                {room.chat.length === 0 && <p className="text-xs text-zinc-500">Messages stay on everyone's screen for this party only. Nothing is saved.</p>}
                {room.chat.map((m, i) => (
                  <p key={i} className="text-sm text-zinc-200 break-words"><b className="text-amber-300">{m.name}</b> {m.text}</p>
                ))}
                <div ref={chatEnd} />
              </div>

              <form className="p-3 border-t border-white/10 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { sendChat(text); setText(''); } }}>
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Say something" enterKeyHint="send"
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-2 text-white outline-none focus:border-amber-400" />
                <button type="submit" aria-label="Send" className="w-10 h-10 grid place-items-center rounded-full bg-amber-400 text-amber-950"><Send className="w-4 h-4" /></button>
              </form>
              <button onClick={() => { leaveRoom(); setOpen(false); }} className="m-3 mt-0 py-2 rounded-full border border-white/15 text-zinc-300 text-sm flex items-center justify-center gap-1.5"><LogOut className="w-4 h-4" />Leave the party</button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
