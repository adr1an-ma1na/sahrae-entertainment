/**
 * The opening's sound (owner, 2026-11-19: "add a sound … like time travel …
 * going the same speed as Netflix's, and the animation moving at the same
 * time"). This replaces the earlier wish for a silent launch.
 *
 * Original and made here, on the device, with the Web Audio API: no recording,
 * nothing borrowed. Three parts, each on the scene's own clock:
 *  - the warp (0 → HIT): a rising swirl of air and two detuned voices
 *    climbing two octaves, faster and faster, panning around the listener;
 *  - the arrival (HIT, when SAHRAE lands): a deep fall, a soft strike and a
 *    warm open chord that rings out in a long room;
 *  - the dive (when the camera dives into the sun): air rushing past.
 * Scheduled on the audio clock, which keeps time even when the page is busy.
 *
 * A browser plays sound only after the viewer has touched the page (choosing a
 * profile counts); when it will not, the opening is silent rather than late.
 * Off in Settings → Intro sound.
 */

const KEY = 'sahrae.introSound.v1';
export const introSoundOn = (): boolean => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
export const setIntroSound = (on: boolean) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not kept */ } };

/** Seconds into the opening when the name lands (SplashIntro's CSS: .hz-word starts then). */
export const HIT = 1.25;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let master: GainNode | null = null;

function noise(c: Ctx, seconds: number): AudioBuffer {
  const b = c.createBuffer(2, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return b;
}

/** A large, dark room: decaying noise, a little longer on the right. */
function room(c: Ctx, seconds = 2.6): AudioBuffer {
  const n = Math.ceil(c.sampleRate * seconds);
  const b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((Math.random() * 2 - 1) - lp) * 0.35; // darker than white noise
      d[i] = lp * Math.pow(1 - t, ch ? 2.6 : 3);
    }
  }
  return b;
}

const ramp = (p: AudioParam, at: number, v: number, kind: 'lin' | 'exp' = 'exp') => (kind === 'exp' ? p.exponentialRampToValueAtTime(Math.max(v, 0.0001), at) : p.linearRampToValueAtTime(v, at));

/**
 * Starts the opening's sound, in time with a scene that started at `startedAt`
 * (performance.now()). The device's sound may take a moment to wake; up to
 * 0.4 s late it still starts, placed on the scene's clock; later than that,
 * or with no touch yet, the opening stays silent rather than out of step.
 */
export function playIntro(startedAt = performance.now()): void {
  if (!introSoundOn()) return;
  const AC: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  let c: Ctx;
  try { c = new AC({ latencyHint: 'interactive' }); } catch { return; }
  ctx = c;
  const go = () => {
    if (ctx !== c) return; // skipped meanwhile
    const late = (performance.now() - startedAt) / 1000;
    if (late > 0.4) { stopIntro(0); return; }
    schedule(c, c.currentTime + 0.01 - late);
  };
  if (c.state === 'running') { go(); return; }
  const giveUp = window.setTimeout(() => { if (ctx === c && c.state !== 'running') stopIntro(0); }, 400);
  c.resume().then(() => { clearTimeout(giveUp); if (c.state === 'running') go(); }).catch(() => {});
}

function schedule(c: Ctx, t0: number): void {
  // The audio clock starts at 0: a sound placed a little back to meet the scene would be
  // scheduled before it, which the browser refuses; those moments start at once instead.
  const at = (x: number) => Math.max(0, x);
  try {
    const hit = t0 + HIT;

    master = c.createGain();
    master.gain.value = 0.7;
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -14; glue.ratio.value = 3; glue.attack.value = 0.004; glue.release.value = 0.25;
    master.connect(glue).connect(c.destination);
    const verb = c.createConvolver();
    verb.buffer = room(c);
    const wet = c.createGain(); wet.gain.value = 0.42;
    verb.connect(wet).connect(master);
    const send = (n: AudioNode, dry = 1) => { const g = c.createGain(); g.gain.value = dry; n.connect(g).connect(master!); n.connect(verb); };

    // ── The warp: air swirling upward, circling the listener ──
    const air = c.createBufferSource(); air.buffer = noise(c, HIT + 0.1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(260, at(t0)); ramp(bp.frequency, hit, 7000);
    const airG = c.createGain(); airG.gain.setValueAtTime(0.0001, at(t0)); ramp(airG.gain, hit - 0.04, 0.5); ramp(airG.gain, hit + 0.03, 0.0001);
    const pan = c.createStereoPanner();
    const swirl = c.createOscillator(); swirl.frequency.setValueAtTime(0.8, at(t0)); ramp(swirl.frequency, hit, 9);
    const swirlDepth = c.createGain(); swirlDepth.gain.value = 0.7;
    swirl.connect(swirlDepth).connect(pan.pan);
    air.connect(bp).connect(airG).connect(pan); send(pan, 0.9);
    air.start(at(t0)); air.stop(hit + 0.1); swirl.start(at(t0)); swirl.stop(hit + 0.1);

    // Two voices a little apart, climbing two octaves with a quickening flutter.
    const climbG = c.createGain(); climbG.gain.setValueAtTime(0.0001, at(t0)); ramp(climbG.gain, hit - 0.05, 0.11); ramp(climbG.gain, hit + 0.02, 0.0001);
    const climbLp = c.createBiquadFilter(); climbLp.type = 'lowpass'; climbLp.Q.value = 7;
    climbLp.frequency.setValueAtTime(500, at(t0)); ramp(climbLp.frequency, hit, 5200);
    climbLp.connect(climbG); send(climbG, 0.8);
    const flutter = c.createOscillator(); flutter.frequency.setValueAtTime(4, at(t0)); ramp(flutter.frequency, hit, 22);
    const flutterDepth = c.createGain(); flutterDepth.gain.value = 18; // cents-ish wobble, in Hz on detune below
    flutter.connect(flutterDepth);
    for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(110, at(t0)); ramp(o.frequency, hit, 440);
      flutterDepth.connect(o.detune);
      o.connect(climbLp); o.start(at(t0)); o.stop(hit + 0.05);
    }
    flutter.start(at(t0)); flutter.stop(hit + 0.05);

    // ── The arrival ──
    // A deep fall…
    const sub = c.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(96, at(hit)); ramp(sub.frequency, hit + 0.9, 36);
    const subG = c.createGain(); subG.gain.setValueAtTime(0.0001, at(hit)); ramp(subG.gain, hit + 0.012, 0.95, 'lin'); ramp(subG.gain, hit + 1.7, 0.0001);
    sub.connect(subG).connect(master); sub.start(at(hit)); sub.stop(hit + 1.8);
    // …a soft strike…
    const strike = c.createBufferSource(); strike.buffer = noise(c, 0.4);
    const strikeLp = c.createBiquadFilter(); strikeLp.type = 'lowpass'; strikeLp.frequency.setValueAtTime(3200, at(hit)); ramp(strikeLp.frequency, hit + 0.3, 300);
    const strikeG = c.createGain(); strikeG.gain.setValueAtTime(0.5, at(hit)); ramp(strikeG.gain, hit + 0.35, 0.0001);
    strike.connect(strikeLp).connect(strikeG); send(strikeG, 0.7); strike.start(at(hit)); strike.stop(hit + 0.4);
    // …and a warm open chord (A, E, A, C#, E), swelling and ringing out.
    const chord = c.createGain(); chord.gain.setValueAtTime(0.0001, at(hit)); ramp(chord.gain, hit + 0.08, 0.16, 'lin'); ramp(chord.gain, hit + 2.6, 0.0001);
    const chordLp = c.createBiquadFilter(); chordLp.type = 'lowpass'; chordLp.frequency.setValueAtTime(4800, at(hit)); ramp(chordLp.frequency, hit + 2.4, 900);
    chordLp.connect(chord); send(chord, 0.75);
    for (const [f, a] of [[110, 1], [164.81, 0.8], [220, 0.75], [277.18, 0.55], [329.63, 0.5], [659.25, 0.18]] as const) {
      for (const det of [-5, 5]) {
        const o = c.createOscillator(); o.type = f > 300 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det;
        const g = c.createGain(); g.gain.value = a / 2;
        o.connect(g).connect(chordLp); o.start(at(hit)); o.stop(hit + 2.7);
      }
    }
  } catch {
    stopIntro(0);
  }
}

/** The dive into the sun: air rushing past, falling. Called as the camera dives. */
export function diveSound(): void {
  const c = ctx;
  if (!c || !master || c.state !== 'running') return;
  try {
    const t = c.currentTime + 0.01, len = 0.85;
    const s = c.createBufferSource(); s.buffer = noise(c, len + 0.1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(5200, t); ramp(bp.frequency, t + len, 420);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); ramp(g.gain, t + 0.22, 0.32); ramp(g.gain, t + len, 0.0001);
    const pan = c.createStereoPanner(); pan.pan.setValueAtTime(-0.5, t); ramp(pan.pan, t + len, 0.5, 'lin');
    s.connect(bp).connect(g).connect(pan).connect(master);
    s.start(t); s.stop(t + len + 0.1);
  } catch { /* silent */ }
}

/** Fades the sound out (a tap that skips the opening) and lets the device go. */
export function stopIntro(fade = 0.3): void {
  const c = ctx, m = master;
  ctx = null; master = null;
  if (!c) return;
  try { if (m) { m.gain.cancelScheduledValues(c.currentTime); m.gain.setValueAtTime(m.gain.value, c.currentTime); m.gain.linearRampToValueAtTime(0, c.currentTime + fade); } } catch { /* closing anyway */ }
  window.setTimeout(() => { void c.close().catch(() => {}); }, fade * 1000 + 80);
}

/** Lets the sound ring out, then lets the device go (the opening has ended). */
export function releaseIntro(after = 2.8): void {
  const c = ctx;
  if (!c) return;
  window.setTimeout(() => { if (ctx === c) { ctx = null; master = null; } void c.close().catch(() => {}); }, after * 1000);
}
