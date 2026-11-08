/**
 * The Sahrae sound: the opening of the app (over the desert dawn,
 * SplashIntro.tsx), scored like a film's cold open.
 * Made here with Web Audio, no file to download.
 *
 *   0.00  tension: a low D drone opening up, a tone that keeps rising, a clock
 *         ticking faster, a reversed cymbal drawing breath
 *   1.50  the arrival: a wall of low brass on a dark D minor, a great drum,
 *         the floor dropping away
 *   1.86  a talking drum answers, three bent notes, Sahrae's African voice
 *   1.55  voices: a held "ah" that turns the minor to major, strings above
 *   3.40  stepping through: a rush of air, the brass again in D major, the
 *         sub falling, bells
 *   ~5.6  it rings out in a large hall
 *
 * Original: the language of the modern film score, nobody's theme.
 * Browsers only allow sound after the viewer has touched the page, so on the
 * website it plays when the intro follows a tap; the apps allow it at once.
 * It never waits for permission: refused, the intro runs silent. Off in
 * Profile, "Intro sound".
 */

const PREF = 'sahrae.introSound.v1';

export function introSoundOn(): boolean {
  try { return localStorage.getItem(PREF) !== '0'; } catch { return true; }
}
export function setIntroSound(on: boolean): void {
  try { localStorage.setItem(PREF, on ? '1' : '0'); } catch { /* applies this session */ }
}

/** The moment of the arrival and of stepping through, in seconds from the start. */
export const SONIC_HIT_S = 1.5;
export const SONIC_THROUGH_S = 3.4;

type Ctx = AudioContext;

function noise(ctx: Ctx, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function hall(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const pre = Math.ceil(ctx.sampleRate * 0.03);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  // Built while the dawn is starting, so the decay curve is worked out once
  // for both ears rather than twice (a TV's processor is slow at this).
  const l = b.getChannelData(0), r = b.getChannelData(1);
  for (let i = pre; i < len; i++) {
    const env = Math.pow(1 - i / len, decay);
    l[i] = (Math.random() * 2 - 1) * env;
    r[i] = (Math.random() * 2 - 1) * env;
  }
  return b;
}

/** A soft saturation curve: the growl of brass pushed hard. */
function drive(amount: number): Float32Array {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(amount * x) / Math.tanh(amount); }
  return c;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** The sound, built and ready. start() begins it and says how many seconds until it is heard. */
export interface SonicLogo { start: () => number; cancel: () => void }

const NOISE_BED_S = 4;

/**
 * Everything slow is done here, before the dawn begins: the hall's reverb and
 * the noise bed took long enough to freeze the first moments of the animation
 * on a phone or a TV, and the sound then started late, out of step with the
 * picture. (The website rarely hit this: browsers refuse sound until a tap.)
 */
export async function prepareSonicLogo(): Promise<SonicLogo | null> {
  if (!introSoundOn()) return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  let ctx: Ctx;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
  if (ctx.state === 'suspended') {
    try { await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 150))]); } catch { /* refused */ }
  }
  if (ctx.state !== 'running') { void ctx.close().catch(() => {}); return null; }

  const verb = ctx.createConvolver();
  verb.buffer = hall(ctx, 4.2, 2.4);
  const bed = noise(ctx, NOISE_BED_S);

  const start = (): number => {
  const t0 = ctx.currentTime + 0.05;
  const HIT = t0 + SONIC_HIT_S;
  const THROUGH = t0 + SONIC_THROUGH_S;

  // ── Mix: a compressor and a ceiling, a long hall ──
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.knee.value = 14; glue.ratio.value = 3; glue.attack.value = 0.004; glue.release.value = 0.3;
  const ceiling = ctx.createDynamicsCompressor();
  ceiling.threshold.value = -3; ceiling.knee.value = 0; ceiling.ratio.value = 20; ceiling.attack.value = 0.001; ceiling.release.value = 0.1;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.9, t0);
  master.gain.setValueAtTime(0.9, t0 + 5.0);
  master.gain.linearRampToValueAtTime(0, t0 + 5.7);
  master.connect(glue).connect(ceiling).connect(ctx.destination);
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  verb.connect(wet).connect(master);

  const out = (node: AudioNode, toVerb = 0.35, pan = 0, dry = 1) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const d = ctx.createGain(); d.gain.value = dry;
    const v = ctx.createGain(); v.gain.value = toVerb;
    node.connect(p); p.connect(d).connect(master); p.connect(v).connect(verb);
  };
  const osc = (type: OscillatorType, f: number, start: number, stop: number) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(start); o.stop(stop); return o;
  };
  const noiseAt = (start: number, seconds: number) => {
    const s = ctx.createBufferSource(); s.buffer = bed; s.start(start, Math.random() * (NOISE_BED_S - seconds), seconds); return s;
  };

  // ── 1. Tension (0 to the arrival) ──
  // The drone: low D, a filter slowly letting it in.
  const droneLp = ctx.createBiquadFilter(); droneLp.type = 'lowpass'; droneLp.Q.value = 2;
  droneLp.frequency.setValueAtTime(110, t0); droneLp.frequency.exponentialRampToValueAtTime(760, HIT - 0.02);
  const droneG = ctx.createGain();
  droneG.gain.setValueAtTime(0.0001, t0); droneG.gain.exponentialRampToValueAtTime(0.14, HIT - 0.05); droneG.gain.exponentialRampToValueAtTime(0.0001, HIT + 0.6);
  droneLp.connect(droneG); out(droneG, 0.25);
  for (const [f, det] of [[36.71, -6], [36.71, 6], [73.42, 0]] as const) {
    const o = osc('sawtooth', f, t0, HIT + 0.7); o.detune.value = det; o.connect(droneLp);
  }
  // The tone that keeps rising: four octaves of D gliding up together.
  [146.83, 293.66, 587.33, 1174.66].forEach((f, i) => {
    const o = osc('sine', f, t0 + 0.2, HIT);
    o.frequency.setValueAtTime(f, t0 + 0.2); o.frequency.exponentialRampToValueAtTime(f * 1.9, HIT - 0.01);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.045 / (1 + i * 0.6), HIT - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, HIT);
    o.connect(g); out(g, 0.5, (i - 1.5) * 0.25);
  });
  // The clock: ticks closing in on the arrival.
  let tick = t0 + 0.3, gap = 0.3, side = -1;
  while (tick < HIT - 0.06) {
    const s = noiseAt(tick, 0.04);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800;
    const g = ctx.createGain(); env(g, tick, 0.16, 0.001, 0.03);
    s.connect(hp).connect(g); out(g, 0.3, side * 0.45);
    side = -side; tick += gap; gap = Math.max(0.07, gap * 0.8);
  }
  // A reversed cymbal: air drawn in up to the hit.
  const swell = noiseAt(t0 + 0.6, HIT - t0 - 0.6);
  const swellHp = ctx.createBiquadFilter(); swellHp.type = 'highpass'; swellHp.frequency.value = 3500;
  const swellG = ctx.createGain();
  swellG.gain.setValueAtTime(0.0001, t0 + 0.6); swellG.gain.exponentialRampToValueAtTime(0.2, HIT - 0.01); swellG.gain.linearRampToValueAtTime(0, HIT);
  swell.connect(swellHp).connect(swellG); out(swellG, 0.6);

  // ── 2. The arrival ──
  // Low brass, D minor, driven: the wall of sound.
  const brass = (at: number, notes: number[], peak: number, decay: number, open: number) => {
    const shaper = ctx.createWaveShaper(); shaper.curve = drive(2.6); shaper.oversample = '2x';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(160, at); lp.frequency.exponentialRampToValueAtTime(open, at + 0.14); lp.frequency.exponentialRampToValueAtTime(380, at + decay);
    const g = ctx.createGain(); env(g, at, peak, 0.05, decay);
    shaper.connect(lp).connect(g); out(g, 0.35);
    const pre = ctx.createGain(); pre.gain.value = 0.22; pre.connect(shaper);
    notes.forEach((f) => { for (const det of [-12, 0, 12]) { const o = osc('sawtooth', f, at, at + decay + 0.3); o.detune.value = det; o.connect(pre); } });
  };
  brass(HIT, [36.71, 73.42, 110.0, 146.83, 174.61], 0.32, 3.0, 1900);
  // The great drum, and the floor falling away.
  const drum = osc('sine', 92, HIT, HIT + 1.4);
  drum.frequency.setValueAtTime(92, HIT); drum.frequency.exponentialRampToValueAtTime(41, HIT + 0.35);
  const drumG = ctx.createGain(); env(drumG, HIT, 0.9, 0.003, 1.2); drum.connect(drumG); out(drumG, 0.4);
  const skin = noiseAt(HIT, 0.4);
  const skinLp = ctx.createBiquadFilter(); skinLp.type = 'lowpass'; skinLp.frequency.value = 420;
  const skinG = ctx.createGain(); env(skinG, HIT, 0.35, 0.002, 0.3); skin.connect(skinLp).connect(skinG); out(skinG, 0.4);
  const sub = osc('sine', 55, HIT, HIT + 2.6);
  sub.frequency.setValueAtTime(55, HIT); sub.frequency.exponentialRampToValueAtTime(28, HIT + 1.6);
  const subG = ctx.createGain(); env(subG, HIT, 0.75, 0.006, 2.4); sub.connect(subG); out(subG, 0.08);

  // ── 3. The talking drum: three bent notes, da-da-DUM ──
  [[0.36, 175, 250, 0.22, -0.3], [0.52, 160, 232, 0.22, 0.2], [0.62, 138, 300, 0.55, 0]].forEach(([dt, f0, f1, dec, pan]) => {
    const at = HIT + dt;
    const o = osc('sine', f0, at, at + dec + 0.1);
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dec * 0.6);
    const g = ctx.createGain(); env(g, at, 0.42, 0.003, dec); o.connect(g); out(g, 0.35, pan);
    const click = noiseAt(at, 0.03);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
    const cg = ctx.createGain(); env(cg, at, 0.12, 0.001, 0.025); click.connect(bp).connect(cg); out(cg, 0.2, pan);
  });

  // ── 4. Voices: "ah", minor turning major; strings above ──
  const formants = [[800, 6], [1150, 7], [2600, 9]].map(([f, q]) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; });
  const choirG = ctx.createGain();
  choirG.gain.setValueAtTime(0.0001, HIT + 0.05); choirG.gain.exponentialRampToValueAtTime(0.5, HIT + 0.7);
  choirG.gain.setValueAtTime(0.5, THROUGH + 0.4); choirG.gain.exponentialRampToValueAtTime(0.0001, THROUGH + 1.9);
  formants.forEach((b) => b.connect(choirG));
  out(choirG, 0.6);
  const vib = osc('sine', 5.2, HIT, THROUGH + 2); const vibDepth = ctx.createGain(); vibDepth.gain.value = 5; vib.connect(vibDepth);
  const voice = (f: number, start: number, end: number, pan: number) => {
    for (const det of [-9, 9]) {
      const o = osc('sawtooth', f, start, end); o.detune.value = det; vibDepth.connect(o.detune);
      const p = ctx.createStereoPanner(); p.pan.value = pan * (det > 0 ? 1 : -1);
      const g = ctx.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(p); formants.forEach((b) => p.connect(b));
    }
  };
  voice(146.83, HIT + 0.05, THROUGH + 2, 0.3);   // D3
  voice(220.0, HIT + 0.05, THROUGH + 2, 0.5);    // A3
  voice(293.66, HIT + 0.05, THROUGH + 2, 0.2);   // D4
  voice(349.23, HIT + 0.05, HIT + 1.3, 0.6);     // F4: the minor...
  voice(369.99, HIT + 1.2, THROUGH + 2, 0.6);    // ...becomes F#4: major, the door opening
  [[880.0, -0.6], [1174.66, 0.6]].forEach(([f, pan]) => {
    const o = osc('triangle', f, HIT + 0.4, THROUGH + 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, HIT + 0.4); g.gain.exponentialRampToValueAtTime(0.018, HIT + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, THROUGH + 1.9);
    o.connect(g); out(g, 0.7, pan);
  });

  // ── 5. Stepping through ──
  const rush = noiseAt(THROUGH - 0.35, 1.2);
  const rushBp = ctx.createBiquadFilter(); rushBp.type = 'bandpass'; rushBp.Q.value = 0.9;
  rushBp.frequency.setValueAtTime(3200, THROUGH - 0.35); rushBp.frequency.exponentialRampToValueAtTime(180, THROUGH + 0.7);
  const rushG = ctx.createGain();
  rushG.gain.setValueAtTime(0.0001, THROUGH - 0.35); rushG.gain.exponentialRampToValueAtTime(0.2, THROUGH); rushG.gain.exponentialRampToValueAtTime(0.0001, THROUGH + 0.8);
  rush.connect(rushBp).connect(rushG); out(rushG, 0.5);
  brass(THROUGH, [73.42, 110.0, 146.83, 185.0], 0.16, 1.8, 2400);
  const sub2 = osc('sine', 60, THROUGH, THROUGH + 2.2);
  sub2.frequency.setValueAtTime(60, THROUGH); sub2.frequency.exponentialRampToValueAtTime(30, THROUGH + 1.4);
  const sub2G = ctx.createGain(); env(sub2G, THROUGH, 0.55, 0.01, 1.9); sub2.connect(sub2G); out(sub2G, 0.1);
  [[1174.66, -0.5], [1479.98, 0.5], [1760.0, 0]].forEach(([f, pan], i) => {
    const at = THROUGH + 0.05 + i * 0.07;
    const o = osc('sine', f, at, at + 2.6);
    const g = ctx.createGain(); env(g, at, 0.045, 0.004, 2.4); o.connect(g); out(g, 0.85, pan, 0.8);
  });

  setTimeout(() => { void ctx.close().catch(() => {}); }, 6200);
  return 0.05 + (ctx.outputLatency || ctx.baseLatency || 0);
  };

  return { start, cancel: () => { void ctx.close().catch(() => {}); } };
}

export async function playSonicLogo(): Promise<boolean> {
  const logo = await prepareSonicLogo();
  if (!logo) return false;
  logo.start();
  return true;
}
