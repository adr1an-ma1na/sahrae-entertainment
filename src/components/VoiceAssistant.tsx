import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, X, Volume2, VolumeX, Loader2, AlertCircle, CornerDownLeft } from 'lucide-react';
import { listen, speak, shutUp, stopListening, voiceSupported } from '../services/voice';
import { parseVoiceCommand, VoiceIntent, VoiceCatalog } from '../services/voiceIntents';
import { haptics } from '../services/haptics';

export interface VoiceAssistantProps {
  catalog: VoiceCatalog;
  /** Run the parsed command. Returns a line to show/speak back to the user. */
  onCommand: (intent: VoiceIntent) => Promise<string> | string;
}

type Phase = 'idle' | 'listening' | 'thinking' | 'done' | 'error';

const SPEAK_KEY = 'sahrae.voice.speakBack';

/**
 * Sahrae's voice assistant: tap the mic, say what you want, it does it.
 *
 * Push-to-talk rather than an always-listening wake word. A web page cannot
 * listen for "hey Sahrae" without holding the microphone open indefinitely,
 * which drains battery and means the mic is live the whole time the app is
 * open — a real privacy cost for a convenience most people would not expect.
 * One tap, one command, mic closes.
 */
export default function VoiceAssistant({ catalog, onCommand }: VoiceAssistantProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [speakBack, setSpeakBack] = useState<boolean>(() => {
    try { return localStorage.getItem(SPEAK_KEY) !== '0'; } catch { return true; }
  });
  const [typed, setTyped] = useState('');
  const supported = voiceSupported();
  const stopRef = useRef<(() => void) | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };

  const finish = useCallback(async (said: string) => {
    setPhase('thinking');
    setHeard(said);
    const intent = parseVoiceCommand(said, catalog);
    let line = intent.say;
    try {
      const res = await onCommand(intent);
      if (res) line = res;
    } catch {
      line = "Sorry — I couldn't do that.";
    }
    setReply(line);
    setPhase('done');
    speak(line, speakBack);
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 2600);
  }, [catalog, onCommand, speakBack]);

  const begin = useCallback(() => {
    if (!supported) return;
    clearCloseTimer();
    shutUp();
    setHeard(''); setReply(''); setPhase('listening');
    stopRef.current = listen({
      onPartial: setHeard,
      onFinal: finish,
      onStart: () => setPhase('listening'),
      onError: (_kind, message) => { setReply(message); setPhase('error'); },
      onEnd: () => setPhase((p) => (p === 'listening' ? 'idle' : p)),
    });
  }, [supported, finish]);

  const openAndListen = () => {
    haptics.press();
    setOpen(true);
    begin();
  };

  const close = () => {
    clearCloseTimer();
    stopListening();
    shutUp();
    setOpen(false);
    setPhase('idle');
  };

  // Escape closes; cleanup kills any live mic/timer if the app unmounts.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => { clearCloseTimer(); stopListening(); shutUp(); }, []);

  const toggleSpeak = () => {
    setSpeakBack((v) => {
      const n = !v;
      try { localStorage.setItem(SPEAK_KEY, n ? '1' : '0'); } catch { /* ignore */ }
      if (!n) shutUp();
      return n;
    });
  };

  return (
    <>
      {/* Floating mic. Sits above the mini-player and the bottom tab bar. */}
      <button
        onClick={openAndListen}
        data-tv-focusable
        tabIndex={0}
        aria-label="Ask Sahrae"
        title={supported ? 'Ask Sahrae' : 'Voice input is not supported on this browser'}
        className="fixed z-[130] right-4 bottom-[calc(env(safe-area-inset-bottom)+7.5rem)] md:bottom-8 w-14 h-14 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 text-amber-950 shadow-lg shadow-amber-500/30 flex items-center justify-center border border-amber-300/40 transition-transform active:scale-95 hover:scale-105"
      >
        <Mic className="w-6 h-6" />
      </button>

      {open && (
        <div role="dialog" aria-label="Sahrae voice assistant" data-tv-layer
          className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-white/10 shadow-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-400">Sahrae Assistant</p>
              <div className="flex items-center gap-1">
                <button onClick={toggleSpeak} aria-label={speakBack ? 'Mute replies' : 'Unmute replies'}
                  title={speakBack ? 'Spoken replies on' : 'Spoken replies off'}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                  {speakBack ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button onClick={close} aria-label="Close"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!supported ? (
              <div className="text-center py-2">
                <AlertCircle className="w-9 h-9 text-amber-500/70 mx-auto mb-3" />
                <p className="text-white font-bold mb-1">Voice isn't available in this browser</p>
                <p className="text-sm text-zinc-400">
                  Speech recognition isn't supported here — that includes Safari on iPhone and iPad.
                  You can still type your command below, or use Chrome for voice.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center py-2">
                  <div className={`relative w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                    phase === 'listening' ? 'bg-amber-500/20' : 'bg-white/5'
                  }`}>
                    {phase === 'listening' && (
                      <span className="absolute inset-0 rounded-full bg-amber-500/30 animate-ping" />
                    )}
                    {phase === 'thinking'
                      ? <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                      : <Mic className={`w-8 h-8 ${phase === 'listening' ? 'text-amber-400' : 'text-zinc-400'}`} />}
                  </div>

                  <p className="text-white text-lg font-semibold text-center min-h-[1.75rem] leading-snug">
                    {heard || (phase === 'listening' ? 'Listening…' : '')}
                  </p>

                  {reply && (
                    <p className={`mt-2 text-sm text-center ${phase === 'error' ? 'text-red-400' : 'text-amber-300'}`}>
                      {reply}
                    </p>
                  )}
                </div>

                {phase !== 'listening' && (
                  <button onClick={begin}
                    className="w-full mt-4 py-3 rounded-xl bg-amber-500 text-amber-950 font-bold text-sm hover:bg-amber-400 transition-colors">
                    {phase === 'idle' ? 'Tap to speak' : 'Ask again'}
                  </button>
                )}

              </>
            )}

            {/* Typed fallback. The parser and the executor are the same either
                way — the microphone is only one way of getting words in. This
                keeps the assistant fully usable when the speech service is
                unreachable (Brave/Chromium/blocked networks) or absent
                entirely (Safari on iOS), rather than leaving a dead end. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = typed.trim();
                if (!q) return;
                setTyped('');
                stopListening();
                finish(q);
              }}
              className="mt-4 flex items-center gap-2"
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={supported ? '…or type a command' : 'Type a command'}
                aria-label="Type a command"
                data-tv-focusable
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-amber-500/60"
              />
              <button type="submit" aria-label="Run command"
                className="shrink-0 w-11 h-11 rounded-xl bg-amber-500 text-amber-950 font-bold flex items-center justify-center hover:bg-amber-400 transition-colors">
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </form>

            {!heard && phase !== 'done' && (
              <p className="mt-3 text-[11px] text-zinc-500 text-center leading-relaxed">
                Try “play Inception” · “open live sports” · “play Capital FM” · “watch Sky News” · “search for comedies” · “stop”
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
