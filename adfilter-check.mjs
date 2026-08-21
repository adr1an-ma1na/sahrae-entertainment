/**
 * Semantic mirror of AdFilter.java, used to validate the matching rules before
 * they ship. This is NOT the shipped code — it exists to catch logic errors
 * (especially over-blocking, which looks identical to a broken player) that a
 * compiler cannot see. Kept in sync by hand with the Java.
 */
const T = { UNKNOWN:0, DOCUMENT:1, SUBDOCUMENT:2, SCRIPT:4, IMAGE:8, STYLESHEET:16, XHR:32, MEDIA:64, FONT:128 };

function abpToRegex(p) {
  let sb = '', i = 0;
  if (p.startsWith('||')) { sb += '^[a-z]+://([^/]*\\.)?'; i = 2; }
  else if (p.startsWith('|')) { sb += '^'; i = 1; }
  for (; i < p.length; i++) {
    const c = p[i];
    if (c === '*') sb += '.*';
    else if (c === '^') sb += '(?:[^a-zA-Z0-9_\\-.%]|$)';
    else if (c === '|') sb += (i === p.length - 1) ? '$' : '\\|';
    else { if ('\\.+?()[]{}$'.includes(c)) sb += '\\'; sb += c; }
  }
  return sb;
}
const indexOfAny = (s, chars) => { let best = -1; for (const c of chars) { const i = s.indexOf(c); if (i >= 0 && (best < 0 || i < best)) best = i; } return best; };

function applyOptions(rule, opts) {
  for (let optRaw of opts.split(',')) {
    let opt = optRaw.trim().toLowerCase(); if (!opt) continue;
    const negate = opt.startsWith('~'); if (negate) opt = opt.slice(1);
    if (opt.startsWith('domain=')) {
      const inc = [], exc = [];
      for (const p of opt.slice(7).split('|')) { if (!p) continue; p[0] === '~' ? exc.push(p.slice(1)) : inc.push(p); }
      if (inc.length) rule.domainsInclude = inc;
      if (exc.length) rule.domainsExclude = exc;
      continue;
    }
    const map = { script:T.SCRIPT, image:T.IMAGE, stylesheet:T.STYLESHEET, xmlhttprequest:T.XHR, subdocument:T.SUBDOCUMENT, media:T.MEDIA, font:T.FONT, document:T.DOCUMENT };
    if (opt === 'third-party') { rule.thirdParty = !negate; continue; }
    if (map[opt] !== undefined) { negate ? (rule.notTypes |= map[opt]) : (rule.types |= map[opt]); continue; }
    if (['popup','other','object','websocket','ping'].includes(opt)) continue;
    return false;
  }
  return true;
}

function parse(line) {
  line = line.trim();
  if (!line || line[0] === '!' || line[0] === '[') return null;
  if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) return null;
  let exception = false;
  if (line.startsWith('@@')) { exception = true; line = line.slice(2); }
  if (line.length > 1 && line[0] === '/' && line.endsWith('/')) return null;
  const rule = { types:0, notTypes:0, thirdParty:null, exception };
  let pattern = line;
  const d = line.lastIndexOf('$');
  if (d >= 0) { pattern = line.slice(0, d); if (!applyOptions(rule, line.slice(d + 1))) return null; }
  if (!pattern) return null;
  if (pattern.startsWith('||')) {
    const rest = pattern.slice(2);
    const sep = indexOfAny(rest, '/^*|');
    const host = (sep < 0 ? rest : rest.slice(0, sep)).toLowerCase();
    if (!host) return null;
    rule.anchorHost = host;
    const tail = sep < 0 ? '' : rest.slice(sep);
    if (!(tail === '' || tail === '^' || tail === '|' || tail === '^|')) rule.regex = new RegExp(abpToRegex(pattern), 'i');
  } else if (!pattern.includes('*') && !pattern.includes('^') && !pattern.includes('|')) {
    rule.literal = pattern.toLowerCase();
  } else {
    rule.regex = new RegExp(abpToRegex(pattern), 'i');
  }
  return rule;
}

const hostMatches = (host, domain) => host === domain || (host.length > domain.length && host[host.length - domain.length - 1] === '.' && host.endsWith(domain));
const registrable = (h) => { const l = h.lastIndexOf('.'); if (l <= 0) return h; const p = h.lastIndexOf('.', l - 1); return p < 0 ? h : h.slice(p + 1); };
const sameSite = (a, b) => registrable(a) === registrable(b);

function ruleMatches(r, url, host, docHost, type) {
  if (r.types !== 0) { if (type === T.UNKNOWN || (r.types & type) === 0) return false; }
  if (r.notTypes !== 0 && type !== T.UNKNOWN && (r.notTypes & type) !== 0) return false;
  if (r.thirdParty !== null && r.thirdParty !== undefined) {
    if (!docHost) return false;
    if ((!sameSite(host, docHost)) !== r.thirdParty) return false;
  }
  if (r.domainsInclude || r.domainsExclude) {
    if (!docHost) return false;
    if (r.domainsExclude && r.domainsExclude.some(d => hostMatches(docHost, d))) return false;
    if (r.domainsInclude && !r.domainsInclude.some(d => hostMatches(docHost, d))) return false;
  }
  if (r.anchorHost && !hostMatches(host, r.anchorHost)) return false;
  if (r.literal) return url.includes(r.literal);
  if (r.regex) return r.regex.test(url);
  return !!r.anchorHost;
}

function makeEngine(lines) {
  const block = [], allow = [];
  for (const l of lines) { const r = parse(l); if (r) (r.exception ? allow : block).push(r); }
  return (url, host, docHost, type) => {
    const u = url.toLowerCase();
    const hit = block.some(r => ruleMatches(r, u, host, docHost, type));
    if (!hit) return false;
    return !allow.some(r => ruleMatches(r, u, host, docHost, type));
  };
}

// ── Cases: real EasyList shapes + the over-blocking traps that matter here ──
const LIST = [
  '||doubleclick.net^',
  '||popads.net^',
  '||vidsrc.to/js/pop.js$script',
  '||example.com/ads/*$script,third-party',
  '/banner_ad.',
  '||tracker.io^$third-party',
  '||cdn.example.com/x.js$domain=badsite.com',
  '@@||vidsrc.to/js/player.js$script',
  // NOTE: `^` matches a separator char or end-of-URL, so `/safe/^` would NOT
  // match `/safe/ok.js` (o is not a separator) — in ABP either. The realistic
  // exception form uses a wildcard.
  '@@||doubleclick.net/safe/*',
];
const match = makeEngine(LIST);

const cases = [
  // [desc, url, host, docHost, type, expectBlocked]
  ['ad host blocked', 'https://ads.doubleclick.net/x.gif', 'ads.doubleclick.net', 'vidsrc.to', T.IMAGE, true],
  ['popunder host blocked', 'https://c1.popads.net/pop.js', 'c1.popads.net', 'vidsrc.to', T.SCRIPT, true],
  ['exception unblocks', 'https://doubleclick.net/safe/ok.js', 'doubleclick.net', 'vidsrc.to', T.SCRIPT, false],
  // THE point of this upgrade: block an ad script on the provider's own domain…
  ['provider-own ad script blocked', 'https://vidsrc.to/js/pop.js', 'vidsrc.to', 'vidsrc.to', T.SCRIPT, true],
  // …without touching the player on that same domain.
  ['provider player NOT blocked', 'https://vidsrc.to/js/player.js', 'vidsrc.to', 'vidsrc.to', T.SCRIPT, false],
  ['provider embed doc NOT blocked', 'https://vidsrc.to/embed/movie/27205', 'vidsrc.to', 'localhost', T.SUBDOCUMENT, false],
  ['video segment NOT blocked', 'https://cdn.vidsrc.to/hls/seg1.ts', 'cdn.vidsrc.to', 'vidsrc.to', T.MEDIA, false],
  ['m3u8 NOT blocked', 'https://cdn.example.net/master.m3u8', 'cdn.example.net', 'vidsrc.to', T.MEDIA, false],
  // type + third-party conditions
  ['third-party rule blocks 3p', 'https://tracker.io/t.gif', 'tracker.io', 'vidsrc.to', T.IMAGE, true],
  ['third-party rule spares 1p', 'https://tracker.io/t.gif', 'tracker.io', 'tracker.io', T.IMAGE, false],
  ['type-scoped rule ignores other type', 'https://example.com/ads/x.png', 'example.com', 'vidsrc.to', T.IMAGE, false],
  ['type-scoped rule hits script', 'https://example.com/ads/x.js', 'example.com', 'vidsrc.to', T.SCRIPT, true],
  ['unknown type skips typed rule', 'https://example.com/ads/x.js', 'example.com', 'vidsrc.to', T.UNKNOWN, false],
  // substring rule
  ['substring rule', 'https://x.net/img/banner_ad.png', 'x.net', 'vidsrc.to', T.IMAGE, true],
  // $domain=
  ['domain= applies on listed site', 'https://cdn.example.com/x.js', 'cdn.example.com', 'badsite.com', T.SCRIPT, true],
  ['domain= spares other sites', 'https://cdn.example.com/x.js', 'cdn.example.com', 'vidsrc.to', T.SCRIPT, false],
  // subdomain semantics
  ['subdomain of ad host blocked', 'https://a.b.popads.net/x', 'a.b.popads.net', 'vidsrc.to', T.SCRIPT, true],
  ['lookalike host NOT blocked', 'https://notpopads.net/x', 'notpopads.net', 'vidsrc.to', T.SCRIPT, false],
];

let pass = 0, fail = 0;
for (const [desc, url, host, doc, type, want] of cases) {
  const got = match(url, host, doc, type);
  if (got === want) { pass++; console.log(`  ok   ${desc}`); }
  else { fail++; console.log(`  FAIL ${desc} — got ${got}, want ${want}`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
