/**
 * Speech input/output for the Sahrae assistant.
 *
 * Uses the Web Speech API, which is what actually exists on the platforms we
 * ship to — Chrome/Edge on desktop, Chrome and the Android WebView on phones and
 * TV boxes. There is no bundled speech model: recognition is performed by the
 * platform, so this needs a network connection and a secure origin (https, or
 * localhost). Both hold for the hosted PWA and the Capacitor app.
 *
 * KNOWN GAP, stated rather than hidden: iOS Safari does not implement
 * SpeechRecognition, so on iPhone/iPad the mic is unavailable and the UI says so
 * instead of showing a button that does nothing. Speech OUTPUT works everywhere.
 */

type Ctor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getCtor(): Ctor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const voiceSupported = (): boolean => typeof window !== 'undefined' && !!getCtor();

export interface ListenHandlers {
  /** Fires repeatedly with the best-guess text while the user is still talking. */
  onPartial?: (text: string) => void;
  /** Fires once with the final transcript. */
  onFinal: (text: string) => void;
  onError?: (kind: 'no-permission' | 'no-speech' | 'network' | 'unknown', message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

let active: SpeechRecognitionLike | null = null;

/** Begin one listening turn. Returns a stop() you can call to end it early. */
export function listen(handlers: ListenHandlers): () => void {
  const Ctor = getCtor();
  if (!Ctor) {
    handlers.onError?.('unknown', 'Voice input is not supported on this browser.');
    return () => {};
  }

  stopListening(); // never run two recognisers at once

  const rec = new Ctor();
  rec.lang = navigator.language || 'en-US';
  // Single-shot: we want one command per tap, not an always-on hot mic. That is
  // also why there is no wake word — a page cannot listen in the background
  // without holding the microphone open, which is a privacy problem, not a
  // feature.
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = '';

  rec.onstart = () => handlers.onStart?.();

  rec.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    if (interim) handlers.onPartial?.((finalText + interim).trim());
    else if (finalText) handlers.onPartial?.(finalText.trim());
  };

  rec.onerror = (e: any) => {
    const code = e?.error || 'unknown';
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      handlers.onError?.('no-permission', 'Microphone permission was denied.');
    } else if (code === 'no-speech') {
      handlers.onError?.('no-speech', "I didn't catch that.");
    } else if (code === 'network') {
      // Chrome does speech recognition IN THE CLOUD — audio goes to Google's
      // speech service. So "network" almost never means the user is offline
      // (they just loaded the app); it means that service was unreachable.
      // In practice that is a Chromium build without Google's speech API key
      // (Brave, Vivaldi, plain Chromium, many Linux packages), or a network that
      // blocks it. Saying "check your connection" sends people chasing the wrong
      // thing, so name the real cause and offer the typed fallback instead.
      handlers.onError?.(
        'network',
        navigator.onLine
          ? "This browser can't reach its speech service. Chrome sends audio to Google to transcribe it, and Brave/Vivaldi/Chromium builds ship without that key. Type your command below, or try Google Chrome."
          : "You're offline — speech recognition needs a connection. Type your command below instead.",
      );
    } else if (code !== 'aborted') {
      handlers.onError?.('unknown', `Voice error: ${code}`);
    }
  };

  rec.onend = () => {
    active = null;
    const said = finalText.trim();
    if (said) handlers.onFinal(said);
    handlers.onEnd?.();
  };

  active = rec;
  try {
    rec.start();
  } catch {
    // start() throws if called while already running; treat as a no-op.
  }

  return () => stopListening();
}

export function stopListening() {
  if (!active) return;
  try { active.stop(); } catch { /* ignore */ }
  active = null;
}

/** Speak a short confirmation. Silently no-ops where synthesis is unavailable. */
export function speak(text: string, enabled = true) {
  if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || 'en-US';
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch { /* speech output is a nicety, never a hard failure */ }
}

export function shutUp() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
