/**
 * The Sahrae sound: the four seconds that open the app, made here with Web
 * Audio rather than shipped as a file (nothing to download, nothing to cache).
 *
 *   0.00  a breath of air rising (filtered noise sweeping up)
 *   0.42  three mbira notes climbing in open fifths, D, A, E: the thumb
 *         piano of East Africa, Sahrae's own accent, with a soft echo
 *   1.02  the arrival: a deep falling sub and a felt thump, as the S lights
 *         a wide D major add 9 chord blooming open, bells shimmering above it
 *   ~4.0  it rings out into a long hall
 *
 * Browsers only allow sound after the viewer has touched the page, so on the
 * website it plays when the intro follows a tap (choosing a profile), as
 * Netflix's does; the apps allow it at once. It never waits for permission:
 * if the browser says no, the intro runs silent. Off in Profile, "Intro sound".
 */

const PREF = 'sahrae.introSound.v1';

export function introSoundOn(): boolean {
  try { return localStorage.getItem(PREF) !== '0'; } catch { return true; }
}
export function setIntroSound(on: boolean): void {
  try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* applies this session */ }
}

type Ctx = AudioContext;

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A hall: stereo noise falling away over `seconds`, with a short pre-delay. */
function hall(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const pre = Math.ceil(ctx.sampleRate * 0.02);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

/** An envelope on a gain: from 0 to `peak` in `attack`, then down to silence over `decay`. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Play the Sahrae sound. Returns false when it cannot (switched off, no Web Audio, not allowed yet). */
export async function playSonicLogo(): Promise<boolean> {
  if (!introSoundOn()) return false;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  let ctx: Ctx;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
  if (ctx.state === 'suspended') {
    try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]); } catch { /* refused */ }
  }
  if (ctx.state !== 'running') { void ctx.close().catch(() => {}); return false; }

  const t0 = ctx.currentTime + 0.05;

  // ── Mix: a dry bus and a hall, through a gentle compressor ──
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.85, t0);
  master.gain.setValueAtTime(0.85, t0 + 3.5);
  master.gain.linearRampToValueAtTime(0, t0 + 4.2);
  master.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = hall(ctx, 3.2, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.34;
  verb.connect(wet).connect(master);
  const echo = ctx.createDelay(1); echo.delayTime.value = 0.19;
  const echoFb = ctx.createGain(); echoFb.gain.value = 0.28;
  const echoOut = ctx.createGain(); echoOut.gain.value = 0.22;
  echo.connect(echoFb).connect(echo);
  echo.connect(echoOut).connect(master);
  echoOut.connect(verb);

  const send = (node: AudioNode, dry = 1, toVerb = 0.4, pan = 0) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const d = ctx.createGain(); d.gain.value = dry;
    const v = ctx.createGain(); v.gain.value = toVerb;
    node.connect(p); p.connect(d).connect(master); p.connect(v).connect(verb);
    return p;
  };

  // ── 1. The breath ──
  const air = ctx.createBufferSource(); air.buffer = noiseBuffer(ctx, 1.2);
  const airBand = ctx.createBiquadFilter(); airBand.type = 'bandpass'; airBand.Q.value = 1.1;
  airBand.frequency.setValueAtTime(300, t0); airBand.frequency.exponentialRampToValueAtTime(2600, t0 + 1.0);
  const airGain = ctx.createGain();
  airGain.gain.setValueAtTime(0.0001, t0); airGain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.95); airGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  air.connect(airBand).connect(airGain); send(airGain, 1, 0.5);
  air.start(t0); air.stop(t0 + 1.2);

  // ── 2. Mbira: D5, A5, E6 ──
  const mbira = (f: number, t: number, pan: number) => {
    const out = ctx.createGain(); out.gain.value = 1;
    const partial = (ratio: number, type: OscillatorType, peak: number, decay: number) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * ratio * 1.006, t); o.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.025);
      const g = ctx.createGain(); env(g, t, peak, 0.002, decay);
      o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05);
    };
    partial(1, 'sine', 0.24, 1.7);
    partial(2, 'triangle', 0.035, 0.5);
    partial(5.43, 'sine', 0.05, 0.16); // the tine's metallic ping
    const p = send(out, 1, 0.45, pan);
    p.connect(echo);
  };
  mbira(587.33, t0 + 0.42, -0.35);
  mbira(880.0, t0 + 0.58, 0.05);
  mbira(1318.51, t0 + 0.74, 0.35);

  // ── 3. The arrival ──
  const hit = t0 + 1.02;
  const sub = ctx.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(62, hit); sub.frequency.exponentialRampToValueAtTime(34, hit + 0.9);
  const subG = ctx.createGain(); env(subG, hit, 0.95, 0.004, 2.2);
  sub.connect(subG); send(subG, 1, 0.12); sub.start(hit); sub.stop(hit + 2.4);
  const body = ctx.createOscillator(); body.type = 'sine';
  body.frequency.setValueAtTime(140, hit); body.frequency.exponentialRampToValueAtTime(58, hit + 0.25);
  const bodyG = ctx.createGain(); env(bodyG, hit, 0.32, 0.003, 0.45);
  body.connect(bodyG); send(bodyG, 1, 0.2); body.start(hit); body.stop(hit + 0.6);
  const thump = ctx.createBufferSource(); thump.buffer = noiseBuffer(ctx, 0.5);
  const thumpLp = ctx.createBiquadFilter(); thumpLp.type = 'lowpass';
  thumpLp.frequency.setValueAtTime(1000, hit); thumpLp.frequency.exponentialRampToValueAtTime(180, hit + 0.3);
  const thumpG = ctx.createGain(); env(thumpG, hit, 0.22, 0.002, 0.35);
  thump.connect(thumpLp).connect(thumpG); send(thumpG, 1, 0.25); thump.start(hit); thump.stop(hit + 0.5);

  // The chord: D2 D3 A3 F#4 E5, two detuned saws a note, opening like a curtain.
  const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.Q.value = 0.7;
  padLp.frequency.setValueAtTime(320, hit); padLp.frequency.exponentialRampToValueAtTime(3400, hit + 0.9); padLp.frequency.exponentialRampToValueAtTime(1300, hit + 3.0);
  const padG = ctx.createGain();
  padG.gain.setValueAtTime(0.0001, hit); padG.gain.exponentialRampToValueAtTime(0.13, hit + 0.09);
  padG.gain.exponentialRampToValueAtTime(0.09, hit + 1.4); padG.gain.exponentialRampToValueAtTime(0.0001, hit + 3.3);
  padLp.connect(padG); send(padG, 1, 0.55);
  [73.42, 146.83, 220.0, 369.99, 659.25].forEach((f, i) => {
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sine' : 'sawtooth';
      o.frequency.value = f; o.detune.value = cents;
      const pan = ctx.createStereoPanner(); pan.pan.value = (i % 2 ? 0.4 : -0.4) * (cents > 0 ? 1 : -1);
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.9 : 0.32 / (1 + i * 0.25);
      o.connect(g).connect(pan).connect(padLp); o.start(hit); o.stop(hit + 3.4);
    }
  });

  // Bells: E6, A6, D7, high and wide.
  [[1318.51, -0.5], [1760.0, 0.5], [2349.32, 0]].forEach(([f, pan], i) => {
    const t = hit + 0.08 + i * 0.06;
    const out = ctx.createGain();
    for (const [ratio, peak] of [[1, 0.05], [2.76, 0.012]] as const) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
      const g = ctx.createGain(); env(g, t, peak, 0.004, 2.6);
      o.connect(g).connect(out); o.start(t); o.stop(t + 2.7);
    }
    send(out, 0.8, 0.8, pan);
  });

  setTimeout(() => { void ctx.close().catch(() => {}); }, 4600);
  return true;
}
