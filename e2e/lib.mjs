// Shared by every target (PWA in Chrome, APK through WebView DevTools), so the
// two runs are the same user doing the same things and their results diff cleanly.
import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BODY_TYPES = new Set(['xhr', 'fetch', 'stylesheet', 'script', 'document']);

export function attachRecorder(page) {
  const rec = { step: 'boot', requests: [], consoleErrors: [], pageErrors: [] };
  const byReq = new Map();
  page.on('request', (req) => {
    let frame = '';
    try { frame = req.frame()?.url() || ''; } catch {}
    const e = { step: rec.step, url: req.url(), method: req.method(), type: req.resourceType(), frame, nav: req.isNavigationRequest() };
    byReq.set(req, e);
    rec.requests.push(e);
  });
  page.on('response', async (res) => {
    const e = byReq.get(res.request());
    if (!e) return;
    e.status = res.status();
    const h = res.headers();
    e.ctype = (h['content-type'] || '').slice(0, 60);
    // An APK-blocked request is answered with an EMPTY 200, which no error event
    // reports, so the body length is the only way to see it.
    if (BODY_TYPES.has(e.type) && /^https?:/.test(e.url) && e.status < 300) {
      try { e.bytes = (await res.buffer()).length; } catch {}
    }
  });
  page.on('requestfailed', (req) => {
    const e = byReq.get(req);
    if (e) e.failure = req.failure()?.errorText || 'failed';
  });
  page.on('console', (m) => {
    if (m.type() === 'error') rec.consoleErrors.push({ step: rec.step, text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (err) => rec.pageErrors.push({ step: rec.step, text: String(err?.message || err).slice(0, 300) }));
  return rec;
}

export async function settle(page, minMs = 3000, maxMs = 12000) {
  const t0 = Date.now();
  try { await page.waitForNetworkIdle({ idleTime: 1200, timeout: maxMs }); } catch {}
  const left = minMs - (Date.now() - t0);
  if (left > 0) await sleep(left);
}

/** Click the first visible control whose text or aria-label equals one of `labels`. */
export async function clickByText(page, labels, { timeout = 8000, contains = false } = {}) {
  labels = [].concat(labels);
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const hit = await page.evaluate((labels, contains) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const els = [...document.querySelectorAll('button, a, [role="button"], [data-tv-focusable], [tabindex]')].filter(vis);
      const textOf = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const ariaOf = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || '').trim().toLowerCase();
      for (const L of labels) {
        const want = L.toLowerCase();
        const match = (s) => (contains ? s.includes(want) : s === want);
        const el = els.find((e) => match(textOf(e))) || els.find((e) => match(ariaOf(e)));
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return L; }
      }
      return null;
    }, labels, contains);
    if (hit) return hit;
    await sleep(400);
  }
  return null;
}

/** Reach a section the way a person would: sidebar label, else the phone's More sheet. */
export async function goTo(page, label, alt = []) {
  const names = [label, ...alt];
  let hit = await clickByText(page, names, { timeout: 2500 });
  if (!hit) {
    if (await clickByText(page, ['More'], { timeout: 1500 })) {
      await sleep(700);
      hit = await clickByText(page, names, { timeout: 3000 });
    }
  }
  return hit;
}

export async function closeTop(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(500);
  await clickByText(page, ['Close', 'Back'], { timeout: 1200 });
  await sleep(500);
}

/** Click the first control inside the section headed by one of `headings`. */
export async function clickInSection(page, headings, selector = '[data-tv-focusable], button, [role="button"]') {
  return page.evaluate((headings, selector) => {
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,p,span,div')].filter((e) => e.children.length === 0 || e.tagName[0] === 'H');
    for (const want of headings) {
      const h = hs.find((e) => (e.innerText || '').trim().toLowerCase() === want.toLowerCase());
      if (!h) continue;
      let box = h;
      for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
        const c = [...box.querySelectorAll(selector)].find((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 20 && r.height > 20 && !e.contains(h);
        });
        if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return want + ' > ' + (c.getAttribute('aria-label') || c.innerText || '').trim().slice(0, 40); }
      }
    }
    return null;
  }, headings, selector);
}

/** Is any audio/video actually advancing? Samples twice, `gap` ms apart. */
export async function mediaAdvancing(page, gap = 4000) {
  // Players live inside cross-origin iframes (YouTube, the movie embeds), so every
  // frame is sampled, not just the app's own document.
  const sample = async () => {
    const out = {};
    for (const f of page.frames()) {
      let host = '';
      try { host = new URL(f.url()).host || 'app'; } catch { host = 'app'; }
      try {
        const ts = await f.evaluate(() => [...new Set([...document.querySelectorAll('video, audio'), ...(window.__sahraeMedia || [])])].map((m) => m.currentTime));
        ts.forEach((t, i) => { out[`${host}#${i}`] = t; });
      } catch {}
    }
    return out;
  };
  const a = await sample();
  await sleep(gap);
  const b = await sample();
  const moving = Object.keys(b).filter((k) => a[k] !== undefined && b[k] > a[k] + 0.5);
  return { media: Object.keys(b).length, advancing: moving.length > 0, moving };
}

export async function probe(page) {
  return page.evaluate(() => {
    const big = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 30 && r.height > 30 && r.bottom > 0 && r.top < innerHeight * 2;
    });
    const faces = [...document.fonts].filter((f) => /Figtree|Outfit/.test(f.family));
    const text = document.body ? document.body.innerText : '';
    return {
      url: location.href,
      imgs: big.length,
      imgsLoaded: big.filter((i) => i.complete && i.naturalWidth > 0).length,
      appFontFaces: faces.length,
      appFontsLoaded: faces.filter((f) => f.status === 'loaded').length,
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src).filter(Boolean).map((s) => s.slice(0, 120)),
      videos: [...document.querySelectorAll('video')].map((v) => ({ rs: v.readyState, t: +v.currentTime.toFixed(1), paused: v.paused, err: v.error ? v.error.code : 0 })),
      textLen: text.length,
      problemText: (text.match(/(something went wrong|couldn.?t (load|play|reach)|failed to load|no results|try again|not available|unavailable|offline)[^\n]{0,50}/gi) || []).slice(0, 6),
      htmlClass: document.documentElement.className,
    };
  });
}

/**
 * Sahrae's own film player, end to end inside the real Android WebView: does
 * the app say it can, does each server's hidden page hand over its stream, and
 * does the relay then serve the quality menu, the sharpest variant and a real
 * segment. Runs from the page itself, so the sign-in screen does not matter.
 * Viewers reported adverts and soft pictures on every server, i.e. the player
 * falling back; this says at which step.
 */
export const filmStreamCheck = async () => {
  const servers = {
    vixsrc: 'https://vixsrc.to/tv/226174/1/1?lang=en',
    vidrock: 'https://vidrock.to/embed/tv/226174/1/1',
    vidzee: 'https://player.vidzee.wtf/embed/tv/226174/1/1',
  };
  const out = { caps: window.__sahraeCaps || null, origin: location.origin };
  const ask = async (u) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const r = await fetch(`https://localhost/__filmstream?u=${encodeURIComponent(u)}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({ bad: r.status }));
      if (j.pending) { await new Promise((res) => setTimeout(res, 1000)); continue; }
      return { ...j, ms: Date.now() - t0 };
    }
    return { timeout: true, ms: Date.now() - t0 };
  };
  const relay = (u, r) => `https://localhost/__hlsproxy?u=${encodeURIComponent(u)}${r ? `&r=${encodeURIComponent(r)}` : ''}`;
  for (const [id, embed] of Object.entries(servers)) {
    const res = { resolve: null };
    try {
      res.resolve = await ask(embed);
      const m = res.resolve.m3u8;
      if (m) {
        const t1 = Date.now();
        const mr = await fetch(relay(m, res.resolve.referer));
        const mt = await mr.text();
        res.master = { status: mr.status, ms: Date.now() - t1, head: mt.slice(0, 60), variants: (mt.match(/#EXT-X-STREAM-INF/g) || []).length };
        const L = mt.split('\n');
        let best = null, bh = -1, h = 0;
        for (let i = 0; i < L.length; i++) {
          const b = L[i].match(/BANDWIDTH=(\d+)/);
          if (b && +b[1] > bh) { bh = +b[1]; h = +((L[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0); best = L.slice(i + 1).find((l) => l.trim() && !l.startsWith('#')); }
        }
        res.master.top = { height: h, mbps: bh > 0 ? +(bh / 1e6).toFixed(1) : null };
        let media = mt;
        if (best) {
          const vr = await fetch(new URL(best.trim(), location.href).href);
          media = await vr.text();
          res.variant = { status: vr.status, segments: (media.match(/#EXTINF/g) || []).length, keyed: /EXT-X-KEY/.test(media) };
        }
        const seg = media.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
        if (seg) {
          const t2 = Date.now();
          const sr = await fetch(new URL(seg, location.href).href);
          const buf = await sr.arrayBuffer();
          res.segment = { status: sr.status, kb: Math.round(buf.byteLength / 1024), ms: Date.now() - t2 };
        }
      }
    } catch (e) {
      res.error = String(e).slice(0, 160);
    }
    out[id] = res;
  }
  return out;
};

/**
 * The last step: actually play each server's stream through the relay with
 * hls.js (the library Sahrae's player uses), as Sahrae's player does: opening
 * on the sharpest rendition. Reports the picture's real size and whether time
 * advanced, after 25 s each.
 */
export const filmPlayCheck = async () => {
  const servers = {
    vixsrc: 'https://vixsrc.to/tv/226174/1/1?lang=en',
    vidrock: 'https://vidrock.to/embed/tv/226174/1/1',
    vidzee: 'https://player.vidzee.wtf/embed/tv/226174/1/1',
  };
  if (!window.Hls) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js';
      s.onload = res; s.onerror = () => rej(new Error('hls.js did not load'));
      document.head.appendChild(s);
    });
  }
  const out = {};
  for (const [id, embed] of Object.entries(servers)) {
    const res = {};
    let hls, v;
    try {
      let j = { pending: true };
      const t0 = Date.now();
      while (j.pending && Date.now() - t0 < 40000) {
        j = await (await fetch(`https://localhost/__filmstream?u=${encodeURIComponent(embed)}`, { cache: 'no-store' })).json();
        if (j.pending) await new Promise((r) => setTimeout(r, 1000));
      }
      if (!j.m3u8) { res.why = j.why || 'no stream'; out[id] = res; continue; }
      const src = `https://localhost/__hlsproxy?u=${encodeURIComponent(j.m3u8)}${j.referer ? `&r=${encodeURIComponent(j.referer)}` : ''}`;
      v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      v.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;z-index:99999';
      document.body.appendChild(v);
      hls = new window.Hls({ startLevel: -1, capLevelToPlayerSize: false, abrEwmaDefaultEstimate: 8000000 });
      const errors = [];
      hls.on(window.Hls.Events.ERROR, (_e, d) => { if (errors.length < 4) errors.push(`${d.fatal ? 'FATAL ' : ''}${d.details}${d.response?.code ? ' ' + d.response.code : ''}`); });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        let best = 0;
        hls.levels.forEach((l, i) => { if ((l.height || 0) > (hls.levels[best].height || 0)) best = i; });
        hls.startLevel = best;
        v.play().catch((e) => errors.push('play: ' + e.name));
      });
      const t1 = Date.now();
      hls.loadSource(src);
      hls.attachMedia(v);
      let firstFrameMs = null;
      while (Date.now() - t1 < 25000) {
        await new Promise((r) => setTimeout(r, 500));
        if (firstFrameMs === null && v.currentTime > 0.2) firstFrameMs = Date.now() - t1;
      }
      res.play = { height: v.videoHeight, width: v.videoWidth, seconds: +v.currentTime.toFixed(1), firstFrameMs, level: hls.levels[hls.currentLevel]?.height ?? null, errors };
    } catch (e) {
      res.error = String(e).slice(0, 160);
    } finally {
      try { hls && hls.destroy(); } catch {}
      try { v && v.remove(); } catch {}
    }
    out[id] = res;
  }
  return out;
};

/**
 * Candidate servers, measured on a device instead of by status code: for one
 * title, each server's hidden page is asked for its stream, the quality menu
 * and a real segment come through the relay (bitrate = segment bytes over its
 * duration), then the stream plays for 20 s with hls.js on the sharpest
 * rendition. A 200 page proves nothing: these sites send one when they have
 * no copy of the film too.
 */
export const CANDIDATES = {
  vidlink: ['https://vidlink.pro/movie/{id}', 'https://vidlink.pro/tv/{id}/{s}/{e}'],
  vidsrcto: ['https://vidsrc.to/embed/movie/{id}', 'https://vidsrc.to/embed/tv/{id}/{s}/{e}'],
  autoembed: ['https://autoembed.co/movie/tmdb/{id}', 'https://autoembed.co/tv/tmdb/{id}-{s}-{e}'],
  vidsrcsu: ['https://vidsrc.su/embed/movie/{id}', 'https://vidsrc.su/embed/tv/{id}/{s}/{e}'],
  vidsrcsh: ['https://vidsrc.sh/embed/movie?tmdb={id}', 'https://vidsrc.sh/embed/tv?tmdb={id}&season={s}&episode={e}'],
  '2embed': ['https://www.2embed.cc/embed/{id}', 'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}'],
  vidsrcio: ['https://vidsrc.io/embed/movie/{id}', 'https://vidsrc.io/embed/tv/{id}/{s}/{e}'],
  vidsrcpm: ['https://vidsrc.pm/embed/movie?tmdb={id}', 'https://vidsrc.pm/embed/tv?tmdb={id}&season={s}&episode={e}'],
  vixsrc: ['https://vixsrc.to/movie/{id}?lang=en', 'https://vixsrc.to/tv/{id}/{s}/{e}?lang=en'],
  vidrock: ['https://vidrock.to/embed/movie/{id}', 'https://vidrock.to/embed/tv/{id}/{s}/{e}'],
  vidzee: ['https://player.vidzee.wtf/embed/movie/{id}', 'https://player.vidzee.wtf/embed/tv/{id}/{s}/{e}'],
};

export const serverMatrix = async (candidates, title) => {
  if (!window.Hls) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.16/dist/hls.min.js';
      s.onload = res; s.onerror = () => rej(new Error('hls.js did not load'));
      document.head.appendChild(s);
    });
  }
  const fill = (t) => t.replace('{id}', title.id).replace('{s}', title.s || 1).replace('{e}', title.e || 1);
  const relay = (u, r) => `https://localhost/__hlsproxy?u=${encodeURIComponent(u)}${r ? `&r=${encodeURIComponent(r)}` : ''}`;
  const out = {};
  for (const [id, pair] of Object.entries(candidates)) {
    const embed = fill(title.type === 'tv' ? pair[1] : pair[0]);
    const res = {};
    let hls, v;
    try {
      const t0 = Date.now();
      let j = { pending: true };
      while (j.pending && Date.now() - t0 < 40000) {
        j = await (await fetch(`https://localhost/__filmstream?u=${encodeURIComponent(embed)}`, { cache: 'no-store' })).json();
        if (j.pending) await new Promise((r) => setTimeout(r, 1000));
      }
      res.lookupMs = Date.now() - t0;
      if (!j.m3u8) { res.why = j.why || (j.pending ? 'no answer in 40 s' : 'no stream'); out[id] = res; continue; }
      res.host = new URL(j.m3u8).hostname;
      const src = relay(j.m3u8, j.referer);
      const mt = await (await fetch(src)).text();
      const L = mt.split('\n');
      const menu = [];
      let best = null, bb = -1;
      for (let i = 0; i < L.length; i++) {
        const b = L[i].match(/BANDWIDTH=(\d+)/);
        if (!b || !/STREAM-INF/.test(L[i])) continue;
        const h = +((L[i].match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0);
        menu.push(`${h || '?'}p@${(+b[1] / 1e6).toFixed(1)}`);
        if (+b[1] > bb) { bb = +b[1]; best = L.slice(i + 1).find((l) => l.trim() && !l.startsWith('#')); }
      }
      res.menu = menu.length ? menu : 'single';
      const media = best ? await (await fetch(new URL(best.trim(), location.href).href)).text() : mt;
      const ML = media.split('\n');
      const segs = [];
      for (let i = 0; i < ML.length; i++) {
        const m = ML[i].match(/#EXTINF:([\d.]+)/);
        if (m) { const s = ML.slice(i + 1).find((l) => l.trim() && !l.startsWith('#')); if (s) segs.push([+m[1], s.trim()]); }
      }
      res.minutes = Math.round(segs.reduce((a, s) => a + s[0], 0) / 60);
      const pick = segs[Math.floor(segs.length * 0.4)];
      if (pick) {
        const buf = await (await fetch(new URL(pick[1], location.href).href)).arrayBuffer();
        res.mbps = +((buf.byteLength * 8) / pick[0] / 1e6).toFixed(2);
      }
      // Play it.
      v = document.createElement('video');
      v.muted = true; v.playsInline = true;
      v.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;z-index:99999';
      document.body.appendChild(v);
      hls = new window.Hls({ startLevel: -1, capLevelToPlayerSize: false, abrEwmaDefaultEstimate: 8000000 });
      const errors = [];
      hls.on(window.Hls.Events.ERROR, (_e, d) => { if (errors.length < 3) errors.push(`${d.fatal ? 'FATAL ' : ''}${d.details}`); });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        let top = 0;
        hls.levels.forEach((l, i) => { if ((l.height || 0) > (hls.levels[top].height || 0)) top = i; });
        hls.currentLevel = top;
        v.play().catch((e) => errors.push('play: ' + e.name));
      });
      const t1 = Date.now();
      hls.loadSource(src);
      hls.attachMedia(v);
      let first = null;
      while (Date.now() - t1 < 20000) {
        await new Promise((r) => setTimeout(r, 500));
        if (first === null && v.currentTime > 0.2) first = Date.now() - t1;
      }
      res.play = { w: v.videoWidth, h: v.videoHeight, sec: +v.currentTime.toFixed(1), firstFrameMs: first, errors };
    } catch (e) {
      res.error = String(e).slice(0, 140);
    } finally {
      try { hls && hls.destroy(); } catch {}
      try { v && v.remove(); } catch {}
    }
    out[id] = res;
  }
  return out;
};

const TITLES = {
  deadpool: { type: 'movie', id: 533535 },
  breakingbad: { type: 'tv', id: 1396, s: 1, e: 1 },
  darkknight: { type: 'movie', id: 155 },
};

export const FLOWS = [
  // One step per server and title, so no single step runs past the connection's limit.
  ...Object.entries(TITLES).flatMap(([name, t]) => Object.entries(CANDIDATES).map(([sid, pair]) => ({ name: `00-${name}-${sid}`, run: async (p) => p.evaluate(serverMatrix, { [sid]: pair }, t) }))),
  { name: '01-launch', run: async (p) => { await settle(p, 6000, 20000); } },
  { name: '02-past-onboarding', run: async (p) => ({ clicked: await clickByText(p, ['Skip', 'Get started'], { timeout: 6000 }) }) },
  { name: '03-home', run: async (p) => {
      await goTo(p, 'Home'); await settle(p, 4000);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await settle(p, 3000);
      await p.evaluate(() => window.scrollTo(0, 0));
  } },
  { name: '04-search', run: async (p) => {
      await goTo(p, 'Home'); await sleep(800);
      const opened = await p.evaluate(() => { const b = document.querySelector('form button[aria-label="Search"]'); if (b) { b.click(); return true; } return false; });
      await sleep(900);
      const input = await p.$('input[placeholder="Titles, people, genres"]');
      if (!input) return { opened, typed: false };
      await input.focus();
      // Set the value the way a keyboard commit does. Per-character IME input
      // scrambles in a WebView ("batman" arrived as "tmana").
      await p.evaluate(() => {
        const el = document.querySelector('input[placeholder="Titles, people, genres"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'batman');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await p.keyboard.press('Enter');
      await settle(p, 6000);
      const results = await p.evaluate(() => document.querySelectorAll('.poster-card').length);
      return { opened, typed: true, results };
  } },
  { name: '05-movies', run: async (p) => ({ nav: await goTo(p, 'Movies') }) },
  { name: '06-title-details', run: async (p) => {
      const opened = await p.evaluate(() => { const c = document.querySelector('.poster-card'); if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return true; } return false; });
      await settle(p, 4000);
      return { opened };
  } },
  { name: '07-trailer', run: async (p) => {
      const c = await clickByText(p, ['Trailer'], { timeout: 4000 });
      await settle(p, 8000, 15000);
      return { clicked: c, ...(await mediaAdvancing(p)) };
  } },
  { name: '08-play-movie', run: async (p) => {
      await closeTop(p);
      await p.evaluate(() => { const c = document.querySelector('.poster-card'); if (c) c.click(); });
      await sleep(2500);
      const c = await clickByText(p, ['Play'], { timeout: 4000 });
      await settle(p, 12000, 20000);
      return { clicked: c, ...(await mediaAdvancing(p)) };
  } },
  { name: '09-series', run: async (p) => { await closeTop(p); await closeTop(p); return { nav: await goTo(p, 'Series') }; } },
  { name: '10-live-tv', run: async (p) => ({ nav: await goTo(p, 'Live TV') }) },
  { name: '11-live-tv-play', run: async (p) => {
      const clicked = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('[data-tv-focusable], button, [role="button"]')]
          .filter((e) => /LIVE/.test(e.innerText || '') && /(Al Jazeera|Sky News|DW News|France 24|Euronews|NHK|CNA)/i.test(e.innerText || ''));
        const c = cards.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
        if (c) { c.scrollIntoView({ block: 'center' }); c.click(); return (c.innerText || '').replace(/s+/g, ' ').slice(0, 40); }
        return null;
      });
      await settle(p, 12000, 20000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '12-sports', run: async (p) => { await closeTop(p); return { nav: await goTo(p, 'Live Sports', ['Sports']) }; } },
  { name: '13-flow-channels', run: async (p) => {
      const nav = await goTo(p, 'Flow Channels', ['Channels']);
      await settle(p, 8000, 15000);
      return { nav, ...(await mediaAdvancing(p)) };
  } },
  { name: '14-music', run: async (p) => {
      const nav = await goTo(p, 'Music', ['Listen', 'Sauti']);
      await sleep(1500);
      const later = await clickByText(p, ['Maybe later'], { timeout: 3000 });
      await settle(p, 6000);
      return { nav, later };
  } },
  { name: '15-music-play', run: async (p) => {
      const clicked = await clickInSection(p, ['Quick picks', 'Trending now', 'Trending', 'Listen again', 'Top hits']);
      await settle(p, 10000, 15000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '16-podcasts', run: async (p) => ({ nav: await goTo(p, 'Podcasts') }) },
  { name: '17-podcast-play', run: async (p) => {
      const clicked = await clickInSection(p, ['Fresh episodes', 'Continue listening', 'Top shows'], 'button');
      await settle(p, 8000, 15000);
      return { clicked, ...(await mediaAdvancing(p)) };
  } },
  { name: '18-radio', run: async (p) => ({ nav: await goTo(p, 'Radio') }) },
  { name: '19-my-list', run: async (p) => ({ nav: await goTo(p, 'My List') }) },
  { name: '20-downloads', run: async (p) => ({ nav: await goTo(p, 'Downloads') }) },
  { name: '21-sign-in-form', run: async (p) => {
      const opened = await clickByText(p, ['Sign In', 'Sign in', 'Log in'], { timeout: 4000 });
      await sleep(1500);
      const form = await p.evaluate(() => ({
        email: !!document.querySelector('input[type="email"], input[placeholder*="mail" i]'),
        password: !!document.querySelector('input[type="password"]'),
      }));
      return { opened, ...form };
  } },
];

/** Run every flow, never letting one failure stop the rest. */
export async function runFlows(page, rec, outDir, { only } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const steps = [];
  for (const f of FLOWS) {
    if (only && !only.includes(f.name)) continue;
    rec.step = f.name;
    const t0 = Date.now();
    const step = { name: f.name };
    try {
      step.extra = (await f.run(page)) || {};
      await settle(page, 2500);
      step.ok = true;
    } catch (e) {
      step.ok = false;
      step.error = String(e?.message || e).slice(0, 300);
    }
    try { step.probe = await probe(page); } catch (e) { step.probe = { error: String(e?.message || e).slice(0, 200) }; }
    try { await page.screenshot({ path: path.join(outDir, `${f.name}.png`) }); } catch {}
    step.ms = Date.now() - t0;
    steps.push(step);
    const pr = step.probe || {};
    console.log(`${step.ok ? 'ok  ' : 'FAIL'} ${f.name.padEnd(20)} imgs ${pr.imgsLoaded}/${pr.imgs}  fonts ${pr.appFontsLoaded}/${pr.appFontFaces}  iframes ${(pr.iframes || []).length}  ${JSON.stringify(step.extra || {}).slice(0, 90)}${step.error ? '  ERR ' + step.error : ''}`);
  }
  const report = { at: new Date().toISOString(), steps, requests: rec.requests, consoleErrors: rec.consoleErrors, pageErrors: rec.pageErrors };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
  return report;
}

/** Track every media element that plays, including detached new Audio() ones. */
export const MEDIA_HOOK = () => {
  const orig = HTMLMediaElement.prototype.play;
  window.__sahraeMedia = [];
  HTMLMediaElement.prototype.play = function (...args) {
    if (!window.__sahraeMedia.includes(this)) window.__sahraeMedia.push(this);
    return orig.apply(this, args);
  };
};
