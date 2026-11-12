/*
 * Planted at document start in every frame Sahrae embeds (MainActivity.installFrameHelper).
 *
 * A server's quality and sound settings sit inside its own player, in a frame a
 * TV remote cannot enter. This asks that player what it offers and sets it,
 * through the player's own controls, so nothing reloads (owner, 2026-11-08):
 *   up   {sahrae:'frame-options', o:{quality,qOn,audio,aOn,subs,sOn}}
 *   down {sahrae:'set-quality', id}, {sahrae:'set-audio', id}, {sahrae:'set-subs', id},
 *        {sahrae:'options?'}
 *
 * Subtitles the same way (-1 is Off), and their size, {sahrae:'sub-style', size}
 * with size 'S' | 'M' | 'L' (owner, 2026-11-12, "Netflix-like options for
 * subtitles and audio").
 *
 * And the clock, so Sahrae can offer Skip Intro and resume where it was left on
 * any server: up {sahrae:'frame-clock', t, d, paused} each second while the film
 * plays, down {sahrae:'seek', to} (seconds).
 *
 * It also lets Sahrae open the next feed out of sight so a switch is nearly
 * instant. A frame named 'sahrae-warm', and any frame inside it, loads silently
 * and holds on its first picture until {sahrae:'wake'}.
 */
(function () {
  try {
    if (window === window.top) return;
    if (/(^|[.])youtube(-nocookie)?[.]com$/.test(location.hostname)) return;
    var ao = location.ancestorOrigins;
    if (!ao || !ao.length || ao[ao.length - 1] !== 'https://localhost') return;

    function up(m) { try { parent.postMessage(m, '*'); } catch (e) {} }
    function vids() { return [].slice.call(document.querySelectorAll('video')); }

    // ── hls.js, which most of these players are built on ──
    var instances = [];
    function watch(H) {
      try {
        var p = H && H.prototype;
        if (!p || !p.loadSource || p.__sahraeSeen) return;
        p.__sahraeSeen = true;
        var load = p.loadSource;
        p.loadSource = function () {
          if (instances.indexOf(this) < 0) instances.push(this);
          return load.apply(this, arguments);
        };
      } catch (e) {}
    }
    try {
      if (window.Hls) watch(window.Hls);
      else {
        var held;
        Object.defineProperty(window, 'Hls', {
          configurable: true, enumerable: true,
          get: function () { return held; },
          set: function (v) { held = v; watch(v); },
        });
      }
    } catch (e) {}

    function hlsNow() {
      var c = instances.filter(function (h) { return h.media; });
      if (c.length) return c[c.length - 1];
      try {
        var named = [window.hls, window.player && window.player.hls, window.art && window.art.hls];
        if (window.Artplayer && window.Artplayer.instances && window.Artplayer.instances[0]) named.push(window.Artplayer.instances[0].hls);
        for (var i = 0; i < named.length; i++) if (named[i] && named[i].levels && 'nextLevel' in named[i]) return named[i];
      } catch (e) {}
      return null;
    }
    function jw() {
      try { var p = window.jwplayer && window.jwplayer(); return p && p.getQualityLevels ? p : null; } catch (e) { return null; }
    }
    function vjs() {
      try {
        var l = window.videojs && window.videojs.getAllPlayers ? window.videojs.getAllPlayers() : [];
        return l && l[0] && l[0].qualityLevels ? l[0] : null;
      } catch (e) { return null; }
    }
    function list(x) { var o = []; if (x) for (var i = 0; i < x.length; i++) o.push(x[i]); return o; }
    function jwAny() { try { var p = window.jwplayer && window.jwplayer(); return p && p.getPosition ? p : null; } catch (e) { return null; } }
    // The film, not an advert: the longest video with a length.
    function main() {
      var best = null;
      vids().forEach(function (v) { var d = v.duration; if (d > 0 && d !== Infinity && (!best || d > best.duration)) best = v; });
      return best;
    }
    function isSub(t) { return t && (t.kind === 'subtitles' || t.kind === 'captions'); }
    function nativeSubs() {
      var v = main() || vids()[0];
      return v && v.textTracks ? list(v.textTracks).filter(isSub) : [];
    }
    function nativeRead() {
      var tracks = nativeSubs(), on = -1;
      tracks.forEach(function (t, i) { if (t.mode === 'showing') on = i; });
      return { subs: tracks.map(function (t, i) { return { id: i, label: String(t.label || t.language || '') }; }), sOn: on };
    }

    function read() {
      var p = jw();
      if (p) {
        return {
          quality: list(p.getQualityLevels()).map(function (l, i) { return { id: i, label: String(l.label || ''), height: l.height || 0 }; }),
          qOn: p.getCurrentQuality(),
          audio: p.getAudioTracks ? list(p.getAudioTracks()).map(function (t, i) { return { id: i, label: String(t.name || t.language || '') }; }) : [],
          aOn: p.getCurrentAudioTrack ? p.getCurrentAudioTrack() : -1,
          // jwplayer's list starts with "Off" at 0.
          subs: p.getCaptionsList ? list(p.getCaptionsList()).slice(1).map(function (c, i) { return { id: i + 1, label: String(c.label || c.language || '') }; }) : [],
          sOn: p.getCurrentCaptions && p.getCurrentCaptions() > 0 ? p.getCurrentCaptions() : -1,
        };
      }
      var h = hlsNow();
      if (h) {
        return {
          quality: [{ id: -1, label: 'Auto', height: 0 }].concat(list(h.levels).map(function (l, i) { return { id: i, label: String(l.name || ''), height: l.height || 0 }; })),
          qOn: h.autoLevelEnabled ? -1 : h.currentLevel,
          audio: list(h.audioTracks).map(function (t, i) { return { id: i, label: String(t.name || t.lang || '') }; }),
          aOn: h.audioTrack,
          subs: h.subtitleTracks && h.subtitleTracks.length
            ? list(h.subtitleTracks).map(function (t, i) { return { id: i, label: String(t.name || t.lang || '') }; })
            : nativeRead().subs,
          sOn: h.subtitleTracks && h.subtitleTracks.length ? (h.subtitleDisplay === false ? -1 : h.subtitleTrack) : nativeRead().sOn,
        };
      }
      var v = vjs();
      if (v) {
        var q = list(v.qualityLevels()), all = q.every(function (l) { return l.enabled; });
        var tracks = v.audioTracks ? list(v.audioTracks()) : [];
        var aOn = -1;
        tracks.forEach(function (t, i) { if (t.enabled) aOn = i; });
        var qOn = -1;
        if (!all) q.forEach(function (l, i) { if (l.enabled) qOn = i; });
        return {
          quality: [{ id: -1, label: 'Auto', height: 0 }].concat(q.map(function (l, i) { return { id: i, label: '', height: l.height || 0 }; })),
          qOn: qOn,
          audio: tracks.map(function (t, i) { return { id: i, label: String(t.label || t.language || '') }; }),
          aOn: aOn,
          subs: vsubs(v).map(function (t, i) { return { id: i, label: String(t.label || t.language || '') }; }),
          sOn: (function () { var on = -1; vsubs(v).forEach(function (t, i) { if (t.mode === 'showing') on = i; }); return on; })(),
        };
      }
      // Any other player on a plain video element: its subtitle tracks at least.
      var n = nativeRead();
      if (n.subs.length) return { quality: [], qOn: -1, audio: [], aOn: -1, subs: n.subs, sOn: n.sOn };
      return null;
    }
    function vsubs(v) { try { return v.textTracks ? list(v.textTracks()).filter(isSub) : []; } catch (e) { return []; } }

    function setSubs(id) {
      var p = jw();
      if (p && p.setCurrentCaptions) { p.setCurrentCaptions(id < 0 ? 0 : id); return; }
      var h = hlsNow();
      if (h && h.subtitleTracks && h.subtitleTracks.length) { h.subtitleTrack = id; h.subtitleDisplay = id >= 0; return; }
      var v = vjs();
      if (v) { vsubs(v).forEach(function (t, i) { t.mode = i === id ? 'showing' : 'disabled'; }); return; }
      nativeSubs().forEach(function (t, i) { t.mode = i === id ? 'showing' : 'disabled'; });
    }

    // Subtitle size, for the players that draw subtitles themselves too.
    // Relative to the size each player already gives them (trackPrefs.CUE_SIZE).
    var SIZES = { S: '80%', M: '100%', L: '140%' };
    function subStyle(size) {
      var px = SIZES[size];
      if (!px) return;
      var css = 'video::cue{font-size:' + px + ' !important;}' +
        '.jw-text-track-cue,.vjs-text-track-cue div,.art-subtitle,.plyr__caption,.dplayer-subtitle{font-size:' + px + ' !important;}';
      try {
        var el = document.getElementById('sahrae-cues');
        if (!el) { el = document.createElement('style'); el.id = 'sahrae-cues'; (document.head || document.documentElement).appendChild(el); }
        el.textContent = css;
      } catch (e) {}
    }

    function seek(to) {
      if (typeof to !== 'number' || !(to >= 0)) return;
      var p = jwAny();
      if (p && p.seek) { try { p.seek(to); return; } catch (e) {} }
      var v = main();
      if (v) { try { v.currentTime = Math.min(to, v.duration - 0.5); } catch (e) {} }
    }

    function setQuality(id) {
      var p = jw();
      if (p) { p.setCurrentQuality(id); return; }
      var h = hlsNow();
      // nextLevel changes at the next segment: no pause and no flushed picture.
      if (h) { h.nextLevel = id; return; }
      var v = vjs();
      if (v) list(v.qualityLevels()).forEach(function (l, i) { l.enabled = id === -1 || i === id; });
    }
    function setAudio(id) {
      var p = jw();
      if (p && p.setCurrentAudioTrack) { p.setCurrentAudioTrack(id); return; }
      var h = hlsNow();
      if (h) { h.audioTrack = id; return; }
      var v = vjs();
      if (v && v.audioTracks) list(v.audioTracks()).forEach(function (t, i) { t.enabled = i === id; });
    }

    var sent = '';
    function report() {
      var o;
      try { o = read(); } catch (e) { return; }
      if (!o) return;
      o.subs = o.subs || [];
      if (o.quality.length < 2 && o.audio.length < 2 && !o.subs.length) return;
      var s = JSON.stringify(o);
      if (s === sent) return;
      sent = s;
      up({ sahrae: 'frame-options', o: o });
    }
    setInterval(report, 2000);

    // ── The clock ──
    var lastT = -1;
    function clock(force) {
      if (warm) return;
      var v = main();
      if (!v || !(v.currentTime > 0)) return;
      if (!force && (v.paused || Math.abs(v.currentTime - lastT) < 0.25)) return;
      lastT = v.currentTime;
      up({ sahrae: 'frame-clock', t: v.currentTime, d: v.duration, paused: v.paused });
    }
    setInterval(function () { clock(false); }, 1000);
    document.addEventListener('pause', function (e) { if (e.target && e.target.tagName === 'VIDEO') clock(true); }, true);
    document.addEventListener('seeked', function (e) { if (e.target && e.target.tagName === 'VIDEO') clock(true); }, true);

    // ── Waiting out of sight ──
    var warm = window.name === 'sahrae-warm';
    var play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!warm) return play.apply(this, arguments);
      this.muted = true;
      if (this.__sahraeHeld) return Promise.resolve();
      return play.apply(this, arguments);
    };
    function hush(e) {
      if (warm && e.target && e.target.tagName === 'VIDEO' && !e.target.muted) e.target.muted = true;
    }
    document.addEventListener('play', hush, true);
    document.addEventListener('volumechange', hush, true);
    document.addEventListener('playing', function (e) {
      var v = e.target;
      if (!warm || !v || v.tagName !== 'VIDEO') return;
      v.muted = true;
      v.__sahraeHeld = true;
      try { v.pause(); } catch (x) {}
    }, true);
    function wake() {
      if (!warm) return;
      warm = false;
      vids().forEach(function (v) {
        v.__sahraeHeld = false;
        v.muted = false;
        try {
          // A held live picture is behind: go to the edge of what has been published.
          var s = v.seekable;
          if (v.duration === Infinity && s && s.length) v.currentTime = Math.max(0, s.end(s.length - 1) - 4);
        } catch (x) {}
        try { var r = v.play(); if (r && r.catch) r.catch(function () {}); } catch (x) {}
      });
    }
    if (!warm && parent !== window.top) up({ sahrae: 'warm?' });

    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object' || typeof d.sahrae !== 'string') return;
      if (e.source === parent) {
        // The player helper passes everything from above on to the frames below.
        if (d.sahrae === 'set-quality' && typeof d.id === 'number') { try { setQuality(d.id); } catch (x) {} setTimeout(report, 400); }
        else if (d.sahrae === 'set-audio' && typeof d.id === 'number') { try { setAudio(d.id); } catch (x) {} setTimeout(report, 400); }
        else if (d.sahrae === 'set-subs' && typeof d.id === 'number') { try { setSubs(d.id); } catch (x) {} setTimeout(report, 400); }
        else if (d.sahrae === 'sub-style' && typeof d.size === 'string') subStyle(d.size);
        else if (d.sahrae === 'seek' && typeof d.to === 'number') { seek(d.to); setTimeout(function () { clock(true); }, 300); }
        else if (d.sahrae === 'options?') { sent = ''; report(); }
        else if (d.sahrae === 'wake') wake();
        else if (d.sahrae === 'warm-yes') warm = true;
      } else if (d.sahrae === 'frame-options' || d.sahrae === 'frame-clock') {
        up(d);
      } else if (d.sahrae === 'warm?' && warm && e.source) {
        try { e.source.postMessage({ sahrae: 'warm-yes' }, '*'); } catch (x) {}
      }
    });
  } catch (e) {}
})();
