/**
 * Pre-release reachability audit.
 *
 * Hits every external thing the app depends on and reports what actually
 * answers. Reading the code tells you what SHOULD work; this tells you what
 * does. Third-party streaming hosts and radio stations go dark without notice,
 * so the list in the source is a claim, not a fact.
 *
 * Run: node audit.mjs [movies|tv|radio|apis]
 */
import fs from 'node:fs';

const ONLY = process.argv[2];
const TIMEOUT = 12_000;
const CONCURRENCY = 12;

const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

/** A HEAD, falling back to a ranged GET — many CDNs refuse HEAD outright. */
async function probe(url, { method = 'GET', headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        // Some hosts serve a block page to anything that looks automated.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        ...headers,
      },
    });
    return {
      ok: res.status < 400,
      status: res.status,
      ms: Date.now() - started,
      type: res.headers.get('content-type') || '',
      body: res,
    };
  } catch (err) {
    return { ok: false, status: 0, type: '', ms: Date.now() - started, error: err.name === 'AbortError' ? 'timeout' : String(err.message).slice(0, 40) };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

const line = (ok, label, detail) =>
  `  ${ok ? GREEN('PASS') : RED('FAIL')}  ${label.padEnd(34)} ${DIM(detail)}`;

const summary = { pass: 0, fail: 0, sections: {} };
function record(section, ok) {
  summary.sections[section] ||= { pass: 0, fail: 0 };
  summary.sections[section][ok ? 'pass' : 'fail'] += 1;
  summary[ok ? 'pass' : 'fail'] += 1;
}

// ── Movie / series embed servers ────────────────────────────────────────────
// Parsed from PlayerModal rather than duplicated here. A hardcoded copy drifts
// the moment a server is added or removed, and then the audit reports on a list
// the app no longer uses — which is exactly what happened once.
//
// Fight Club (tmdb 550) is the probe: old, popular, in every catalogue. A
// server that cannot serve it cannot serve anything.
function parseServers() {
  const src = fs.readFileSync('src/components/PlayerModal.tsx', 'utf8');
  const out = [];
  const re = /\{ id: '([a-z0-9]+)',[\s\S]*?type === 'movie' \? `([^`]+)`/g;
  let m;
  while ((m = re.exec(src))) {
    out.push([m[1], m[2].replace(/\$\{id\}/g, '550')]);
  }
  return out;
}
const MOVIE_SERVERS = parseServers();

async function auditMovies() {
  console.log('\n── Movie / series servers ' + '─'.repeat(40));
  const results = await pool(MOVIE_SERVERS, async ([id, url]) => {
    const r = await probe(url);
    let verdict = r.ok;
    let note = `${r.status || r.error} ${r.ms}ms`;

    if (r.ok && r.body) {
      // A 200 is not enough: a parked domain, a "not found" page and a real
      // player all return 200. Look for something a player would carry.
      const html = await r.body.text().catch(() => '');
      const looksPlayable = /<iframe|<video|jwplayer|playerjs|hls\.js|\.m3u8|sources\s*[:=]/i.test(html);
      const looksDead = /domain (is )?for sale|parked|buy this domain|not found|no results/i.test(html);
      if (looksDead) { verdict = false; note += ' · parked/not-found page'; }
      else if (!looksPlayable) { verdict = false; note += ` · 200 but no player markup (${html.length}b)`; }
      else note += ' · player markup present';
    }
    record('movies', verdict);
    return line(verdict, id, note);
  });
  results.forEach((l) => console.log(l));
}

// ── Live TV ─────────────────────────────────────────────────────────────────
function parseChannels() {
  const src = fs.readFileSync('src/components/LiveTVView.tsx', 'utf8');
  const out = [];
  const re = /name:\s*'([^']+)'[\s\S]{0,300}?url:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.push([m[1], m[2]]);
  return out;
}

async function auditTv() {
  const channels = parseChannels();
  console.log(`\n── Live TV (${channels.length}) ` + '─'.repeat(46));
  const results = await pool(channels, async ([name, url]) => {
    // A YouTube-backed channel is an embed, not a stream — fetching it as one
    // was a bug in this script that failed six perfectly good channels. The
    // meaningful check is whether the CHANNEL still exists, which the Data API
    // can answer.
    const yt = url.match(/youtube\.com\/embed\/live_stream\?channel=([A-Za-z0-9_-]+)/);
    if (yt) {
      const key = JSON.parse(fs.readFileSync('firebase-applet-config.json','utf8')).apiKey;
      const r2 = await probe(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${yt[1]}&key=${key}`);
      let ok2 = false, note2 = 'channel lookup failed';
      if (r2.ok && r2.body) {
        const j = await r2.body.json().catch(() => null);
        const item = j?.items?.[0];
        ok2 = !!item;
        note2 = item ? `yt live · ${item.snippet.title}` : 'yt channel NOT FOUND';
      }
      record('tv', ok2);
      return line(ok2, name, note2);
    }
    const r = await probe(url, { headers: { Range: 'bytes=0-2047' } });
    let ok = r.ok;
    let note = `${r.status || r.error} ${r.ms}ms`;
    if (r.ok && r.body && /\.m3u8/.test(url)) {
      const txt = await r.body.text().catch(() => '');
      // A manifest that lists no segments and no variants is an empty shell.
      if (!/#EXTM3U/.test(txt)) { ok = false; note += ' · not a manifest'; }
      else if (!/#EXT-X-STREAM-INF|#EXTINF/.test(txt)) { ok = false; note += ' · manifest has no streams'; }
      else note += /#EXT-X-STREAM-INF/.test(txt) ? ' · master' : ' · media';
    }
    record('tv', ok);
    return line(ok, name, note);
  });
  results.forEach((l) => console.log(l));
}

// ── Radio ───────────────────────────────────────────────────────────────────
function parseStations() {
  const src = fs.readFileSync('src/components/AudioHubView.tsx', 'utf8');
  const out = [];
  const re = /name:\s*'([^']+)'[\s\S]{0,200}?url:\s*'(https?:[^']+)'/g;
  let m;
  while ((m = re.exec(src))) out.push([m[1], m[2]]);
  return out;
}

async function auditRadio() {
  const stations = parseStations();
  console.log(`\n── Radio (${stations.length}) ` + '─'.repeat(50));
  const results = await pool(stations, async ([name, url]) => {
    const r = await probe(url, { headers: { Range: 'bytes=0-1023', Icy_MetaData: '1' } });
    let ok = r.ok;
    let note = `${r.status || r.error} ${r.ms}ms ${r.type.slice(0, 24)}`;
    // A station serving HTML is a station that has stopped serving audio.
    if (r.ok && /text\/html/.test(r.type)) { ok = false; note += ' · html, not audio'; }
    record('radio', ok);
    return line(ok, name, note);
  });
  results.forEach((l) => console.log(l));
}

// ── APIs ────────────────────────────────────────────────────────────────────
async function auditApis() {
  console.log('\n── APIs and services ' + '─'.repeat(44));
  const key = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8')).apiKey;
  const checks = [
    ['TMDB (trending)', 'https://api.themoviedb.org/3/trending/all/week?api_key=' + (process.env.TMDB_KEY || '')],
    ['iTunes podcast search', 'https://itunes.apple.com/search?media=podcast&limit=1&term=news'],
    ['iTunes episodes', 'https://itunes.apple.com/lookup?id=1665219519&entity=podcastEpisode&limit=1'],
    ['YouTube chart (KE)', `https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&videoCategoryId=10&regionCode=KE&maxResults=1&key=${key}`],
    ['YouTube search', `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=test&maxResults=1&key=${key}`],
    ['Sports feed (streamed.pk)', 'https://streamed.pk/api/matches/all'],
    ['Supabase user_state', 'https://qkyrztpqdrpucdyabjsm.supabase.co/rest/v1/user_state?select=user_id&limit=1'],
    ['Supabase search_cache', 'https://qkyrztpqdrpucdyabjsm.supabase.co/rest/v1/search_cache?select=cache_key&limit=1'],
  ];
  const SUPA_KEY = 'sb_publishable_pd_yZhWPd2SE1ipMbijolQ_0jVCfcL0';
  const results = await pool(checks, async ([name, url]) => {
    const headers = url.includes('supabase.co') ? { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } : {};
    const r = await probe(url, { headers });
    let ok = r.ok;
    let note = `${r.status || r.error} ${r.ms}ms`;
    if (r.ok && r.body) {
      const txt = await r.body.text().catch(() => '');
      try {
        const j = JSON.parse(txt);
        const n = Array.isArray(j) ? j.length : (j.results?.length ?? j.items?.length ?? '');
        note += n === '' ? '' : ` · ${n} rows`;
        if (j.error) { ok = false; note += ` · ${String(j.error.message || j.error).slice(0, 50)}`; }
      } catch { /* not json — fine for some */ }
    }
    record('apis', ok);
    return line(ok, name, note);
  });
  results.forEach((l) => console.log(l));
}

// ── Run ─────────────────────────────────────────────────────────────────────
if (!ONLY || ONLY === 'movies') await auditMovies();
if (!ONLY || ONLY === 'tv') await auditTv();
if (!ONLY || ONLY === 'radio') await auditRadio();
if (!ONLY || ONLY === 'apis') await auditApis();

console.log('\n' + '═'.repeat(66));
for (const [name, s] of Object.entries(summary.sections)) {
  const pct = Math.round((s.pass / (s.pass + s.fail)) * 100);
  console.log(`  ${name.padEnd(8)} ${String(s.pass).padStart(3)}/${s.pass + s.fail} working  (${pct}%)`);
}
console.log(`  ${'TOTAL'.padEnd(8)} ${summary.pass}/${summary.pass + summary.fail}`);
