/**
 * An episode's show notes as plain paragraphs: text, web links and tappable
 * times ("12:45" seeks there). Feeds send HTML; none of it reaches the page as
 * HTML. Only text and http(s) links survive, so a feed cannot run anything.
 * Pure, tested in podplayer-check.mjs.
 */
import { decodeEntities } from './episodeVideo.ts';

export type NotePart = { text: string; href?: string; seek?: number };
export type NoteBlock = { parts: NotePart[]; bullet?: boolean };

const TIME = /\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/g;

/** Text with times made seekable. */
function withTimes(text: string, maxSec: number): NotePart[] {
  const out: NotePart[] = [];
  let last = 0;
  for (const m of text.matchAll(TIME)) {
    const [all, a, b, c] = m;
    const sec = c ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
    if (maxSec && sec > maxSec + 5) continue; // "9:30 am", not a time in this episode
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: all, seek: sec });
    last = m.index! + all.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** HTML or plain show notes → paragraphs. `maxSec` is the episode's length (times past it stay text). */
export function parseNotes(input: string, maxSec = 0): NoteBlock[] {
  let html = (input || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|svg|template)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // Block boundaries become line breaks; list items are marked.
  html = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, '\n')
    .replace(/<\s*(p|div|ul|ol|h[1-6]|blockquote|tr)[^>]*>/gi, '\n');
  // Links: kept only when they go to the web.
  const links: { href: string; text: string }[] = [];
  html = html.replace(/<\s*a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi, (_m, _q, h1, h2, h3, inner) => {
    const href = decodeEntities(String(h1 ?? h2 ?? h3 ?? '')).trim();
    const text = decodeEntities(String(inner).replace(/<[^>]*>/g, '')).trim();
    if (!/^https?:\/\//i.test(href)) return text;
    links.push({ href, text: text || href });
    return `\u0001${links.length - 1}\u0002`;
  });
  const text = decodeEntities(html.replace(/<[^>]*>/g, ''));
  const blocks: NoteBlock[] = [];
  for (const raw of text.split(/\n+/)) {
    let line = raw.replace(/[ \t ]+/g, ' ').trim();
    if (!line) continue;
    const bullet = /^[•■●\-*]\s+/.test(line);
    if (bullet) line = line.replace(/^[•■●\-*]\s+/, '');
    const parts: NotePart[] = [];
    // Bare web addresses become links too.
    const chunks = line.split(/(\u0001\d+\u0002|https?:\/\/[^\s<>"')]+)/g);
    for (const ch of chunks) {
      if (!ch) continue;
      const ref = /^\u0001(\d+)\u0002$/.exec(ch);
      if (ref) { const l = links[Number(ref[1])]; parts.push({ text: l.text, href: l.href }); continue; }
      if (/^https?:\/\//i.test(ch)) { parts.push({ text: ch.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), href: ch }); continue; }
      parts.push(...withTimes(ch, maxSec));
    }
    if (parts.length) blocks.push({ parts, bullet });
  }
  return blocks;
}

/** The chapter playing at `sec`: the last one started. */
export function chapterAt(chapters: { start: number; title: string }[], sec: number): number {
  let i = -1;
  for (let k = 0; k < chapters.length; k++) { if (chapters[k].start <= sec + 0.5) i = k; else break; }
  return i;
}
