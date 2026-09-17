/**
 * What a stream actually carries, and what this device can actually do with it.
 *
 * Two decisions live here, both deliberately pure so they can be tested without
 * a GPU or a live stream:
 *
 *   1. AUDIO — is this genuinely Dolby, and genuinely Atmos?
 *   2. VIDEO — is upscaling this source worth doing on this display?
 *
 * WHERE THIS APPLIES, stated plainly because it is a real limit:
 * only on the HLS path, where the app owns the manifest and the decoded frames.
 * Most sports sources are cross-origin IFRAMES. Inside one of those the app
 * cannot read a manifest, inspect an audio track, or touch a single pixel — the
 * same-origin policy forbids it, and no amount of code changes that. On the web
 * the sports path is almost entirely iframes; on Android an embed can be
 * resolved to a real m3u8 first, which is where this becomes useful.
 */

/* ────────────────────────── AUDIO ────────────────────────── */

export interface AudioFormat {
  /** Codec string from the manifest, e.g. "ec-3", "ac-3", "mp4a.40.2". */
  codec: string;
  /** CHANNELS attribute verbatim, e.g. "6", "16/JOC". */
  channels: string;
  /** Channel count, when it can be read. */
  channelCount: number;
  /** The manifest claims Dolby Digital / Digital Plus. */
  claimsDolby: boolean;
  /** The manifest claims Atmos (Joint Object Coding). */
  claimsAtmos: boolean;
  /** This browser/WebView can actually decode it. */
  decodable: boolean;
  /** Safe to show a Dolby badge: claimed AND decodable. */
  showDolby: boolean;
  /** Safe to show an Atmos badge: claimed AND decodable. */
  showAtmos: boolean;
  /** Human-readable, honest label. */
  label: string;
}

/**
 * Atmos in HLS is signalled by the JOC suffix on CHANNELS, per Apple's
 * authoring spec — `CHANNELS="16/JOC"`. The codec alone cannot tell you: plain
 * 5.1 E-AC-3 is also `ec-3`, so treating ec-3 as Atmos would mislabel ordinary
 * surround, which is exactly what this is written to avoid.
 */
const JOC = /\/JOC/i;
const DOLBY_CODEC = /^(ec-3|ac-3|eac3|ac3)/i;

/** Can this platform decode the codec at all? */
export function canDecode(codec: string, isTypeSupported?: (t: string) => boolean): boolean {
  if (!codec) return false;
  const probe = isTypeSupported
    ?? (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported
        ? (t: string) => MediaSource.isTypeSupported(t)
        : null);
  if (!probe) return false;
  try {
    return probe(`audio/mp4; codecs="${codec}"`);
  } catch {
    return false;
  }
}

/**
 * Read an audio rendition honestly.
 *
 * The rule this enforces: a Dolby or Atmos badge requires BOTH that the stream
 * declares it AND that this device can decode it. Claiming Atmos because the
 * word appears in a manifest, on a device whose WebView cannot decode E-AC-3,
 * would be a label with nothing behind it.
 */
export function readAudioFormat(
  track: { codec?: string; channels?: string; name?: string } | null | undefined,
  isTypeSupported?: (t: string) => boolean,
): AudioFormat {
  const codec = (track?.codec || '').trim();
  const channels = (track?.channels || '').trim();
  const channelCount = parseInt(channels, 10) || 0;

  const claimsAtmos = JOC.test(channels);
  const claimsDolby = DOLBY_CODEC.test(codec) || claimsAtmos;
  const decodable = canDecode(codec, isTypeSupported);

  const showDolby = claimsDolby && decodable;
  const showAtmos = claimsAtmos && decodable;

  let label: string;
  if (showAtmos) label = 'Dolby Atmos';
  else if (showDolby) label = channelCount >= 6 ? `Dolby ${channelCount === 8 ? '7.1' : '5.1'}` : 'Dolby';
  else if (claimsDolby && !decodable) label = 'Dolby (not supported on this device)';
  else if (channelCount >= 6) label = `${channelCount === 8 ? '7.1' : '5.1'} surround`;
  else if (codec) label = 'Stereo';
  else label = '';

  return { codec, channels, channelCount, claimsDolby, claimsAtmos, decodable, showDolby, showAtmos, label };
}

/** Pick the best audio rendition: Atmos, then Dolby, then most channels. */
export function bestAudioTrack<T extends { codec?: string; channels?: string }>(
  tracks: T[],
  isTypeSupported?: (t: string) => boolean,
): T | null {
  if (!tracks?.length) return null;
  const scored = tracks.map((t) => {
    const f = readAudioFormat(t, isTypeSupported);
    // Only a DECODABLE track may score for Dolby — selecting an undecodable
    // Atmos rendition would trade working audio for a better-sounding label.
    let score = 0;
    if (f.showAtmos) score += 100;
    else if (f.showDolby) score += 50;
    score += Math.min(f.channelCount, 16);
    if (!f.decodable) score = -1;
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score < 0 ? tracks[0] : scored[0].t;
}

/* ────────────────────────── VIDEO ────────────────────────── */

export interface UpscaleDecision {
  shouldUpscale: boolean;
  /** Output height to render at. Equals sourceHeight when not upscaling. */
  targetHeight: number;
  reason: string;
}

/**
 * Ceiling on output. Beyond roughly 1440p the cost of the shader rises faster
 * than anyone can see the benefit on a screen a person is sitting in front of.
 */
const MAX_TARGET = 1440;

/**
 * Should this source be upscaled on this display?
 *
 * Upscaling only earns its cost when there is somewhere for the extra pixels to
 * GO. Rendering 1080p to 1440p on a 1080p panel produces exactly the same
 * picture, one wasted GPU pass later — so the display, not the source, decides.
 *
 * The device veto comes first: on a software renderer a full-screen shader per
 * frame is precisely how you turn a watchable stream into a slideshow, which
 * would trade the thing being asked for (reliability) for the thing being
 * asked for (sharpness).
 */
export function upscaleDecision(opts: {
  sourceHeight: number;
  displayHeight: number;
  /** Real GPU available (not a software rasteriser). */
  hardwareGpu: boolean;
  /** Viewer preference; upscaling is never forced on. */
  enabled?: boolean;
}): UpscaleDecision {
  const { sourceHeight, displayHeight, hardwareGpu, enabled = true } = opts;
  const no = (reason: string): UpscaleDecision => ({ shouldUpscale: false, targetHeight: sourceHeight || 0, reason });

  if (!enabled) return no('turned off');
  if (!hardwareGpu) return no('no hardware GPU, so a shader here would cost more than it returns');
  if (!sourceHeight || sourceHeight <= 0) return no('source resolution unknown');
  if (!displayHeight || displayHeight <= 0) return no('display size unknown');

  // Nothing to gain: the panel cannot show more than the source already has.
  if (displayHeight <= sourceHeight) return no('display is no larger than the source');

  // Already at or above the ceiling.
  if (sourceHeight >= MAX_TARGET) return no('source is already 1440p or better');

  // Too small a jump to be worth a GPU pass every frame.
  const target = Math.min(MAX_TARGET, displayHeight);
  if (target / sourceHeight < 1.2) return no('gain too small to justify the cost');

  return {
    shouldUpscale: true,
    targetHeight: target,
    reason: `${sourceHeight}p → ${target}p on a ${displayHeight}p display`,
  };
}

/** Highest rendition height a manifest offers. */
export function bestHeight(levels: { height?: number }[] | null | undefined): number {
  if (!levels?.length) return 0;
  return levels.reduce((m, l) => Math.max(m, l.height || 0), 0);
}
