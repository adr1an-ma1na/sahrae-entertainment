import type { EqSettings } from './eq';

/**
 * A real equaliser for web playback.
 *
 * eq.ts pushes settings to Android's native audio effects through /__eq, and its
 * own docstring says "no-op on web" — so on the PWA the sliders did nothing at
 * all. This is the actual signal chain for the browser.
 *
 * WHAT IT CAN AND CANNOT TOUCH — the honest boundary:
 *
 *   <audio> lane (podcasts, downloads, direct files)  →  fully processed.
 *   YouTube iframe lane (most of Music)               →  impossible.
 *
 * The second is not a gap to fill later. YouTube's player runs in a cross-origin
 * iframe; the audio never enters this document, so no amount of Web Audio can
 * reach it. Claiming otherwise would be a slider that lies. `eqCanApply()` tells
 * the UI which case it is in.
 *
 * CORS matters here in a way that is easy to get wrong: a MediaElementSource
 * built from cross-origin media WITHOUT CORS outputs silence rather than
 * failing. So the element is marked crossOrigin='anonymous' before the source is
 * set, which turns that silent failure into a load error we can catch and
 * recover from. Measured first: the podcast CDNs in use send
 * Access-Control-Allow-Origin: *, so this path works for them.
 *
 * The chain, in order, and why each stage is there:
 *
 *   highpass 25Hz   subsonic rumble carries no music and eats headroom that the
 *                   bass shelf then has to fight for
 *   5 × peaking     the existing 60/230/910/3.6k/14k bands, so saved presets
 *                   keep meaning what they meant
 *   lowshelf        "bass" as weight rather than another mid-bass bump
 *   mid/side width  "spatial" done by attenuating the mono sum, which widens
 *                   without the hollow phase-cancellation of a naive M/S trick
 *   compressor      "loudness" — evens dynamics so quiet passages sit forward
 *   makeup + limit  boosting five bands WILL clip; this is what stops it, and
 *                   it is the stage most home-made EQs leave out
 */

/** Matches EQ_FREQS in eq.ts — the sliders' labels have to mean something. */
const BAND_HZ = [60, 230, 910, 3600, 14000];

interface Chain {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  input: GainNode;
  highpass: BiquadFilterNode;
  bands: BiquadFilterNode[];
  bassShelf: BiquadFilterNode;
  widthDry: GainNode;
  widthMono: GainNode;
  merger: ChannelMergerNode;
  compressor: DynamicsCompressorNode;
  makeup: GainNode;
  limiter: DynamicsCompressorNode;
  bypass: GainNode;
  wet: GainNode;
}

let chain: Chain | null = null;
let attachedTo: HTMLAudioElement | null = null;

export type EqAvailability = 'active' | 'unsupported-source' | 'not-attached';

/**
 * Whether the EQ can affect what is currently playing.
 * `usingLocalAudio` is false when the YouTube iframe is the source.
 */
export function eqCanApply(usingLocalAudio: boolean): EqAvailability {
  if (!usingLocalAudio) return 'unsupported-source';
  return chain ? 'active' : 'not-attached';
}

/**
 * Build the graph around an audio element. Idempotent per element — a second
 * createMediaElementSource on the same element throws, and would also detach
 * the first one.
 */
export function attachEq(el: HTMLAudioElement): boolean {
  if (attachedTo === el && chain) return true;
  if (typeof window === 'undefined') return false;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;

  try {
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(el);

    const input = ctx.createGain();

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 25;

    const bands = BAND_HZ.map((hz, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = hz;
      // Wider at the extremes, tighter in the mids: a narrow 60Hz bell sounds
      // like a resonance rather than weight, and a narrow 14k sounds brittle.
      f.Q.value = i === 0 || i === BAND_HZ.length - 1 ? 0.7 : 1.1;
      f.gain.value = 0;
      return f;
    });

    const bassShelf = ctx.createBiquadFilter();
    bassShelf.type = 'lowshelf';
    bassShelf.frequency.value = 110;
    bassShelf.gain.value = 0;

    // Stereo width: split, sum to mono, subtract a fraction of the mono content.
    // Attenuating the correlated middle is what widens the image; boosting the
    // sides instead just raises level and collapses on mono playback.
    const splitter = ctx.createChannelSplitter(2);
    const widthDry = ctx.createGain();
    const widthMono = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    widthDry.gain.value = 1;
    widthMono.gain.value = 0;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.25;

    const makeup = ctx.createGain();
    makeup.gain.value = 1;

    // Brick-wall-ish safety stage. Without it, +15dB across five bands clips
    // audibly, which is exactly why aggressive presets usually sound worse.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;

    const wet = ctx.createGain();
    const bypass = ctx.createGain();
    wet.gain.value = 0;    // start bypassed; applyWebEq turns it on
    bypass.gain.value = 1;

    // Dry path — untouched audio, so switching the EQ off is truly transparent.
    source.connect(bypass);
    bypass.connect(ctx.destination);

    // Wet path.
    source.connect(input);
    input.connect(highpass);
    let node: AudioNode = highpass;
    for (const b of bands) { node.connect(b); node = b; }
    node.connect(bassShelf);

    bassShelf.connect(widthDry);
    bassShelf.connect(splitter);
    splitter.connect(widthMono, 0);
    splitter.connect(widthMono, 1);
    widthDry.connect(merger, 0, 0);
    widthDry.connect(merger, 0, 1);
    widthMono.connect(merger, 0, 0);
    widthMono.connect(merger, 0, 1);

    merger.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(limiter);
    limiter.connect(wet);
    wet.connect(ctx.destination);

    chain = {
      ctx, source, input, highpass, bands, bassShelf,
      widthDry, widthMono, merger, compressor, makeup, limiter, bypass, wet,
    };
    attachedTo = el;
    return true;
  } catch {
    // Already-attached element, or no Web Audio. Playback continues unprocessed.
    return false;
  }
}

/** millibels (the stored unit) → decibels (what Web Audio wants). */
const mb = (v: number) => (v || 0) / 100;

/** Push settings into the live graph. Ramped, because stepping a filter gain
 *  mid-playback is audible as a click. */
export function applyWebEq(s: EqSettings): void {
  if (!chain) return;
  const { ctx } = chain;
  const t = ctx.currentTime;
  const ramp = (p: AudioParam, v: number) => {
    try { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, 0.03); } catch { /* older impls */ }
  };

  // A suspended context is the usual reason "the EQ does nothing": browsers
  // start it suspended until a user gesture.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!s.on) {
    ramp(chain.wet.gain, 0);
    ramp(chain.bypass.gain, 1);
    return;
  }
  ramp(chain.wet.gain, 1);
  ramp(chain.bypass.gain, 0);

  s.bands.slice(0, chain.bands.length).forEach((v, i) => ramp(chain!.bands[i].gain, mb(v)));

  // bass 0..1000 → up to +9dB of shelf.
  ramp(chain.bassShelf.gain, (s.bass || 0) / 1000 * 9);

  // spatial 0..1000 → subtract up to 45% of the mono sum.
  const width = (s.spatial || 0) / 1000;
  ramp(chain.widthMono.gain, -0.45 * width);
  ramp(chain.widthDry.gain, 1 + 0.25 * width);

  // loud 0..2000 → harder compression and more makeup.
  const loud = Math.min(1, (s.loud || 0) / 2000);
  ramp(chain.compressor.threshold, -18 - 18 * loud);
  ramp(chain.compressor.ratio, 2 + 4 * loud);

  // Compensate for what the bands added so louder never means clipped. Only the
  // positive gains matter — cuts do not cost headroom.
  const peak = Math.max(0, ...s.bands.map(mb), (s.bass || 0) / 1000 * 9);
  const headroom = Math.pow(10, -peak / 20);
  ramp(chain.makeup.gain, headroom * (1 + 0.6 * loud));
}

/** Browsers start an AudioContext suspended; call this from a user gesture. */
export function resumeEq(): void {
  if (chain?.ctx.state === 'suspended') chain.ctx.resume().catch(() => {});
}

export function eqAttached(): boolean { return !!chain; }
