/**
 * Source ranking, audio-format honesty, and the upscale decision.
 *
 * The brief for this work was explicit: do not label ordinary audio as Dolby
 * Atmos. So the audio tests below are mostly about REFUSING to claim things —
 * plain 5.1 E-AC-3 is not Atmos, and an Atmos stream on a device that cannot
 * decode E-AC-3 is not Atmos either, however the manifest describes itself.
 *
 * Run: node --experimental-strip-types sportsquality-check.mjs
 */

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  readAudioFormat, bestAudioTrack, upscaleDecision, bestHeight, canDecode,
} = await import('./src/services/streamQuality.ts');
const {
  rankSources, recordSourceOutcome, scoreSource, priorFor, likelyPlayable, resetSourceRank,
} = await import('./src/services/sportsSources.ts');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/* ── source ranking ── */
console.log('\nsource ranking — the measured reality of the feed');
resetSourceRank();
ok('echo, named on 149 fixtures and never yielding, starts near zero', priorFor('echo') < 0.2);
ok('admin, which always yielded, starts high', priorFor('admin') > 0.8);
ok('an unknown source gets a fair middling chance', priorFor('brand-new') === 0.5);

resetSourceRank();
{
  const ranked = rankSources([{ source: 'echo' }, { source: 'admin' }, { source: 'delta' }]).map((s) => s.source);
  ok('a dead source is tried last even when the feed lists it first',
    ranked[0] === 'admin' && ranked[ranked.length - 1] === 'echo', ranked.join(','));
}

console.log('\nlearning — the prior must yield to evidence');
resetSourceRank();
for (let i = 0; i < 25; i++) recordSourceOutcome('echo', true);
ok('a repaired source climbs out of a bad prior', scoreSource('echo') > 0.6, String(scoreSource('echo')));
resetSourceRank();
for (let i = 0; i < 25; i++) recordSourceOutcome('admin', false);
ok('a rotted source falls despite a good prior', scoreSource('admin') < 0.4, String(scoreSource('admin')));

resetSourceRank();
recordSourceOutcome('fresh', true);
ok('one lucky hit does not beat a strong prior outright', scoreSource('fresh') < priorFor('admin'));

resetSourceRank();
ok('a fixture backed only by dead sources is flagged unplayable',
  likelyPlayable([{ source: 'echo' }, { source: 'foxtrot' }]) === false);
ok('a fixture with one good source is playable',
  likelyPlayable([{ source: 'echo' }, { source: 'admin' }]) === true);
ok('a fixture with no sources at all is not playable', likelyPlayable([]) === false);

/* ── audio honesty ── */
console.log('\naudio — Atmos is claimed ONLY when the stream has it AND the device can decode it');
const yes = () => true;
const no = () => false;

{
  const f = readAudioFormat({ codec: 'ec-3', channels: '16/JOC' }, yes);
  ok('a real Atmos rendition on a capable device is labelled Atmos', f.showAtmos && f.label === 'Dolby Atmos');
}
{
  const f = readAudioFormat({ codec: 'ec-3', channels: '16/JOC' }, no);
  ok('the SAME Atmos stream on a device that cannot decode it is NOT labelled Atmos', f.showAtmos === false);
  ok('  and it says so rather than staying silent', /not supported/i.test(f.label), f.label);
}
{
  const f = readAudioFormat({ codec: 'ec-3', channels: '6' }, yes);
  ok('plain 5.1 E-AC-3 is Dolby but NOT Atmos', f.showDolby === true && f.showAtmos === false);
  ok('  and is labelled 5.1, not Atmos', f.label === 'Dolby 5.1', f.label);
}
{
  const f = readAudioFormat({ codec: 'mp4a.40.2', channels: '2' }, yes);
  ok('ordinary AAC stereo claims nothing', !f.showDolby && !f.showAtmos && f.label === 'Stereo');
}
{
  const f = readAudioFormat({ codec: 'mp4a.40.2', channels: '6' }, yes);
  ok('6-channel AAC is surround but never Dolby', f.showDolby === false && f.label === '5.1 surround', f.label);
}
{
  const f = readAudioFormat(null, yes);
  ok('a missing track does not throw and claims nothing', f.showDolby === false && f.label === '');
}
ok('canDecode says no for an empty codec', canDecode('', yes) === false);
ok('canDecode survives a probe that throws',
  canDecode('ec-3', () => { throw new Error('blocked'); }) === false);
ok('canDecode asks about the right MIME type',
  canDecode('ec-3', (t) => t === 'audio/mp4; codecs="ec-3"') === true);

console.log('\nchoosing an audio track');
{
  const tracks = [
    { codec: 'mp4a.40.2', channels: '2' },
    { codec: 'ec-3', channels: '16/JOC' },
    { codec: 'ec-3', channels: '6' },
  ];
  ok('Atmos wins when decodable', bestAudioTrack(tracks, yes).channels === '16/JOC');
  ok('when Dolby cannot be decoded, a WORKING track is chosen over a better label',
    bestAudioTrack(tracks, (t) => /mp4a/.test(t)).codec === 'mp4a.40.2');
}

/* ── upscaling ── */
console.log('\nupscaling — only where there is somewhere for the pixels to go');
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 1440, hardwareGpu: true });
  ok('1080p on a 1440p display upscales', d.shouldUpscale && d.targetHeight === 1440, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 1080, hardwareGpu: true });
  ok('1080p on a 1080p panel does NOT — the pixels have nowhere to go', !d.shouldUpscale, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 2160, hardwareGpu: true });
  ok('a 4K display is still capped at 1440p', d.shouldUpscale && d.targetHeight === 1440, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1440, displayHeight: 2160, hardwareGpu: true });
  ok('a source already at 1440p is left alone', !d.shouldUpscale, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 1440, hardwareGpu: false });
  ok('a software renderer vetoes it outright', !d.shouldUpscale && /GPU/i.test(d.reason), d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 1200, hardwareGpu: true });
  ok('a marginal gain is not worth a shader every frame', !d.shouldUpscale, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 720, displayHeight: 1440, hardwareGpu: true });
  ok('720p on a 1440p display upscales', d.shouldUpscale && d.targetHeight === 1440, d.reason);
}
{
  const d = upscaleDecision({ sourceHeight: 1080, displayHeight: 1440, hardwareGpu: true, enabled: false });
  ok('the viewer can turn it off', !d.shouldUpscale && /off/i.test(d.reason));
}
{
  const d = upscaleDecision({ sourceHeight: 0, displayHeight: 1440, hardwareGpu: true });
  ok('an unknown source resolution never upscales blind', !d.shouldUpscale, d.reason);
}
ok('bestHeight reads the top rendition', bestHeight([{ height: 480 }, { height: 1080 }, { height: 720 }]) === 1080);
ok('bestHeight on an empty manifest is 0, not NaN', bestHeight([]) === 0 && bestHeight(null) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
