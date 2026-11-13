// node --experimental-strip-types playerchoices-check.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { qualityList, audioList, readFrameOptions, hasChoices } from './src/services/playerChoices.ts';

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log('  ok', name); }
  else { fail++; console.log('  FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); }
};

console.log('\nthe lists');
eq('sharpest first, Auto ahead', qualityList([{ id: 0, label: '', height: 480 }, { id: 1, label: '', height: 1080 }, { id: -1, label: 'Auto', height: 0 }]).map((c) => c.label), ['Auto', '1080p', '480p']);
eq('a height is named from the height', qualityList([{ id: 3, label: 'HD', height: 720 }]), [{ id: 3, label: '720p' }]);
eq('a label stands in with no height', qualityList([{ id: 3, label: 'HD', height: 0 }]), [{ id: 3, label: 'HD' }]);
eq('one entry per height', qualityList([{ id: 0, height: 720 }, { id: 1, height: 720 }]).length, 1);
eq('nothing to call it, dropped', qualityList([{ id: 0, label: '', height: 0 }]), []);
eq('a track with no name still has one', audioList([{ id: 0, label: '' }]), [{ id: 0, label: 'Sound 1' }]);

console.log('\nwhat a page may post');
eq('not an object', readFrameOptions('hello'), null);
eq('one quality is no choice', readFrameOptions({ quality: [{ id: 0, height: 720 }], audio: [] }), null);
eq('long labels are cut', readFrameOptions({ quality: [{ id: -1, label: 'Auto' }, { id: 0, label: 'x'.repeat(200) }] }).quality[1].label.length, 24);
eq('a huge list is capped', readFrameOptions({ quality: Array.from({ length: 500 }, (_, i) => ({ id: i, height: 100 + i })) }).quality.length, 16);
eq('non-number ids are refused', readFrameOptions({ quality: [{ id: 'x', height: 720 }, { id: {}, height: 480 }] }), null);
eq('hasChoices: none', hasChoices(null), false);

// The frame's script, run against a pretend page.
function frame({ name = '', hls = null, jw = null, parent = 'other', href = 'embed.example', vid = {} } = {}) {
  const sent = [], clocks = [], listeners = {}, doc = {}, intervals = [];
  const proto = { play() { this.playCalls = (this.playCalls || 0) + 1; return Promise.resolve(); } };
  const video = Object.assign(Object.create(proto), { tagName: 'VIDEO', muted: false, paused: false, duration: Infinity, seekable: { length: 1, end: () => 100 }, currentTime: 10, pause() { this.paused = true; } }, vid);
  const parentWin = { postMessage: (m) => { if (m.sahrae === 'frame-options') sent.push(m); else if (m.sahrae === 'frame-clock') clocks.push(m); } };
  const top = parent === 'top' ? parentWin : { };
  const win = {
    name, top, parent: parentWin, location: { hostname: href, ancestorOrigins: ['https://localhost'] },
    addEventListener: (t, f) => { listeners[t] = f; },
    HTMLMediaElement: { prototype: proto },
    jwplayer: jw ? () => jw : undefined,
    hls,
    setInterval: (f) => intervals.push(f),
    setTimeout: (f) => f(),
    Promise, JSON, Object, String, Math, Infinity,
  };
  win.window = win;
  doc.querySelectorAll = () => [video];
  doc.addEventListener = (t, f) => { const was = doc['on' + t]; doc['on' + t] = was ? (e) => { was(e); f(e); } : f; };
  win.document = doc;
  const code = readFileSync('android-overlay/app/src/main/assets/frame-options.js', 'utf8');
  vm.runInNewContext(code, win);
  return {
    win, video, sent, clocks, doc, proto,
    tick: () => intervals.forEach((f) => f()),
    fromParent: (d) => listeners.message({ data: d, source: parentWin }),
  };
}

console.log('\nthe helper, jwplayer');
{
  const jw = { q: 2, a: 0, getQualityLevels: () => [{ label: 'Auto' }, { label: '1080p', height: 1080 }, { label: '720p', height: 720 }], getCurrentQuality() { return this.q; }, setCurrentQuality(i) { this.q = i; }, getAudioTracks: () => [{ name: 'English' }, { name: 'French' }], getCurrentAudioTrack() { return this.a; }, setCurrentAudioTrack(i) { this.a = i; } };
  const f = frame({ jw });
  f.tick();
  eq('reports what it offers', f.sent[0].o.quality.map((q) => q.label), ['Auto', '1080p', '720p']);
  eq('reports the current one', f.sent[0].o.qOn, 2);
  eq('reports sound', f.sent[0].o.audio.map((q) => q.label), ['English', 'French']);
  f.tick();
  eq('says nothing when nothing changed', f.sent.length, 1);
  f.fromParent({ sahrae: 'set-quality', id: 1 });
  eq('sets quality', jw.q, 1);
  f.fromParent({ sahrae: 'set-audio', id: 1 });
  eq('sets sound', jw.a, 1);
  const n = f.sent.length;
  f.fromParent({ sahrae: 'set-quality', id: 'bad' });
  eq('ignores a bad id', jw.q, 1);
  f.fromParent({ sahrae: 'options?' });
  eq('answers when asked', f.sent.length, n + 1);
}

console.log('\nthe helper, hls.js');
{
  const hls = { levels: [{ height: 720 }, { height: 1080 }], audioTracks: [], audioTrack: -1, autoLevelEnabled: true, currentLevel: 0, nextLevel: -1, media: {} };
  const f = frame({ hls });
  f.tick();
  eq('Auto is offered', f.sent[0].o.quality[0], { id: -1, label: 'Auto', height: 0 });
  eq('auto is current', f.sent[0].o.qOn, -1);
  f.fromParent({ sahrae: 'set-quality', id: 1 });
  eq('changes at the next segment', hls.nextLevel, 1);
}

console.log('\nsubtitles');
{
  const jw = { q: 0, c: 0, getQualityLevels: () => [], getCurrentQuality: () => 0,
    getCaptionsList: () => [{ id: 'off', label: 'Off' }, { label: 'English' }, { label: 'Español' }],
    getCurrentCaptions() { return this.c; }, setCurrentCaptions(i) { this.c = i; } };
  const f = frame({ jw });
  f.tick();
  eq('jwplayer: its subtitles, without its Off', f.sent[0].o.subs.map((x) => x.label), ['English', 'Español']);
  eq('jwplayer: the ids are its own', f.sent[0].o.subs.map((x) => x.id), [1, 2]);
  eq('jwplayer: off reads as -1', f.sent[0].o.sOn, -1);
  f.fromParent({ sahrae: 'set-subs', id: 2 });
  eq('jwplayer: turned on', jw.c, 2);
  f.fromParent({ sahrae: 'set-subs', id: -1 });
  eq('jwplayer: turned off', jw.c, 0);
}
{
  const hls = { levels: [], audioTracks: [], subtitleTracks: [{ name: 'English' }, { lang: 'fre' }], subtitleTrack: -1, subtitleDisplay: false, nextLevel: -1, media: {} };
  const f = frame({ hls });
  f.tick();
  eq('hls.js: a list of subtitles is worth reporting alone', f.sent.length, 1);
  f.fromParent({ sahrae: 'set-subs', id: 1 });
  eq('hls.js: track and display', [hls.subtitleTrack, hls.subtitleDisplay], [1, true]);
}
{
  const tracks = [{ kind: 'metadata', label: 'x', mode: 'hidden' }, { kind: 'subtitles', label: 'English', mode: 'disabled' }, { kind: 'captions', language: 'de', mode: 'showing' }];
  const f = frame({ vid: { textTracks: tracks, duration: 1500 } });
  f.tick();
  eq('any player: its text tracks, not metadata', f.sent[0].o.subs.map((x) => x.label), ['English', 'de']);
  eq('any player: the one showing', f.sent[0].o.sOn, 1);
  f.fromParent({ sahrae: 'set-subs', id: 0 });
  eq('any player: one on, the rest off', tracks.map((t) => t.mode), ['hidden', 'showing', 'disabled']);
}
{
  const styles = [];
  const f = frame();
  f.doc.getElementById = () => null;
  f.doc.createElement = () => { const el = { textContent: '' }; styles.push(el); return el; };
  f.doc.head = { appendChild() {} };
  f.fromParent({ sahrae: 'sub-style', size: 'L' });
  eq('size reaches the page', /font-size:140%/.test(styles[0]?.textContent || ''), true);
  f.fromParent({ sahrae: 'sub-style', size: '<script>' });
  eq('an unknown size is ignored', styles.length, 1);
}

console.log('\nthe clock and Skip');
{
  const f = frame({ vid: { duration: 1440, currentTime: 350 } });
  f.tick();
  eq('reports the film playing', f.clocks.map((c) => [c.t, c.d]), [[350, 1440]]);
  f.tick();
  eq('quiet while the clock has not moved', f.clocks.length, 1);
  f.fromParent({ sahrae: 'seek', to: 435 });
  eq('Skip moves the film', f.video.currentTime, 435);
  eq('and says where it is', f.clocks.at(-1).t, 435);
  f.fromParent({ sahrae: 'seek', to: 99999 });
  eq('never past the end', f.video.currentTime, 1439.5);
  f.fromParent({ sahrae: 'seek', to: 'x' });
  eq('a bad second is ignored', f.video.currentTime, 1439.5);
}
{
  const jw = { at: 0, getPosition: () => 0, seek(t) { this.at = t; }, getQualityLevels: () => [], getCurrentQuality: () => 0 };
  const f = frame({ jw, vid: { duration: 1440 } });
  f.fromParent({ sahrae: 'seek', to: 90 });
  eq('jwplayer seeks through its own player', jw.at, 90);
}
{
  const f = frame({ vid: { duration: Infinity, currentTime: 50 } });
  f.tick();
  eq('a live picture has no clock to report', f.clocks.length, 0);
}

console.log('\nsound from the start');
{
  const f = frame({ vid: { muted: true, duration: 1440 } });
  f.doc.onplaying({ target: f.video });
  eq('a film that started muted is given its sound', f.video.muted, false);
  f.video.muted = true;
  f.doc.onplaying({ target: f.video });
  eq('a viewer who mutes it later stays muted', f.video.muted, true);
}
{
  const jw = { m: true, getMute() { return this.m; }, setMute(x) { this.m = x; }, getPosition: () => 0, getQualityLevels: () => [], getCurrentQuality: () => 0 };
  const f = frame({ jw, vid: { muted: true, duration: 1440 } });
  f.doc.onplaying({ target: f.video });
  eq('JW Player is told too, so its button agrees', jw.m, false);
}
{
  const f = frame({ vid: { muted: true, duration: 20 } });
  f.doc.onplaying({ target: f.video });
  eq('a short advert is left as it was', f.video.muted, true);
}
{
  const f = frame({ name: 'sahrae-warm', vid: { muted: false, duration: 1440 } });
  f.doc.onplaying({ target: f.video });
  eq('a feed waiting out of sight stays silent', f.video.muted, true);
}

console.log('\nno player to ask');
{
  const f = frame();
  f.tick();
  eq('says nothing', f.sent.length, 0);
}

console.log('\nwaiting out of sight');
{
  const f = frame({ name: 'sahrae-warm', parent: 'top' });
  f.video.play();
  eq('plays silent', f.video.muted, true);
  f.video.muted = false;
  f.doc.onvolumechange({ target: f.video });
  eq('cannot turn its sound on', f.video.muted, true);
  f.doc.onplaying({ target: f.video });
  eq('holds on its first picture', f.video.paused, true);
  const calls = f.video.playCalls;
  f.video.play();
  eq('a nudge does not start it', f.video.playCalls, calls);
  f.fromParent({ sahrae: 'wake' });
  eq('wakes with sound', f.video.muted, false);
  eq('wakes at the live edge', f.video.currentTime, 96);
  eq('wakes playing', f.video.playCalls, calls + 1);
}
{
  const f = frame({ parent: 'top' });
  f.video.play();
  eq('a normal frame keeps its sound', f.video.muted, false);
  f.doc.onplaying({ target: f.video });
  eq('a normal frame is not held', f.video.paused, false);
}
{
  const f = frame({ href: 'www.youtube.com' });
  f.tick();
  eq('YouTube is left alone', f.sent.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
