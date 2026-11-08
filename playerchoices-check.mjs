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
function frame({ name = '', hls = null, jw = null, parent = 'other', href = 'embed.example' } = {}) {
  const sent = [], listeners = {}, doc = {}, intervals = [];
  const proto = { play() { this.playCalls = (this.playCalls || 0) + 1; return Promise.resolve(); } };
  const video = Object.assign(Object.create(proto), { tagName: 'VIDEO', muted: false, paused: false, duration: Infinity, seekable: { length: 1, end: () => 100 }, currentTime: 10, pause() { this.paused = true; } });
  const parentWin = { postMessage: (m) => { if (m.sahrae === 'frame-options') sent.push(m); } };
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
  doc.addEventListener = (t, f) => { doc['on' + t] = f; };
  win.document = doc;
  const code = readFileSync('android-overlay/app/src/main/assets/frame-options.js', 'utf8');
  vm.runInNewContext(code, win);
  return {
    win, video, sent, doc, proto,
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
