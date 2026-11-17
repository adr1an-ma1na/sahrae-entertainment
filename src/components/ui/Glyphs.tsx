/**
 * Sahrae's own carved symbols (owner, 2026-11-17: "hieroglyphics of sorts").
 *
 * Not a real script: copying Egyptian hieroglyphs or Tifinagh letters as
 * ornament would spell nonsense in someone's writing. These are pictograms of
 * the app's own world, drawn the way glyphs are carved: single strokes, round
 * ends, on a 24 grid. The desert (sun, dune, palm, star, moon, water) and the
 * app (an eye to watch, waves to listen, a doorway for the library, a reel for
 * films, a note for music, a ball for sport).
 *
 * Drawn in currentColor, so they always wear the theme's colours.
 */
import type { SVGProps } from 'react';

export const GLYPHS = {
  sun: 'M12 4v2M12 18v2M4 12h2M18 12h2M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7zM12 11.4v1.2',
  dune: 'M3 17c3-4 6-6 9-6s6 2 9 6M6 20h12',
  eye: 'M3 12c3-4.5 6-6 9-6s6 1.5 9 6c-3 4.5-6 6-9 6s-6-1.5-9-6zM12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4zM12 18v3',
  waves: 'M4 8c2-2 4-2 6 0s4 2 6 0 4-2 4-2M4 12c2-2 4-2 6 0s4 2 6 0 4-2 4-2M4 16c2-2 4-2 6 0s4 2 6 0 4-2 4-2',
  door: 'M7 21V10a5 5 0 0 1 10 0v11M5 21h14M12 13v2',
  reel: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM12 7.5v1M12 15.5v1M7.5 12h1M15.5 12h1M12 11.6v.8',
  note: 'M9 18V6l9-2v11M9 18a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM18 15a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
  ball: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM5 9c4 1 10 1 14 0M5 15c4-1 10-1 14 0M12 4c-2 3-2 13 0 16',
  palm: 'M12 21V10M12 10c-2-3-5-4-8-3M12 10c2-3 5-4 8-3M12 10c-1-3-1-5 1-7M12 10c-3-1-5 1-6 3M12 10c3-1 5 1 6 3M8 21h8',
  star: 'M12 3l2.2 5.6L20 9.2l-4.5 3.8 1.4 5.8L12 15.8 7.1 18.8l1.4-5.8L4 9.2l5.8-.6z',
  moon: 'M16 4.5A8 8 0 1 0 19.5 16 6.5 6.5 0 0 1 16 4.5z',
  water: 'M3 9l3-3 3 3 3-3 3 3 3-3 3 3M3 15l3-3 3 3 3-3 3 3 3-3 3 3',
} as const;
export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, ...rest }: { name: GlyphName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/**
 * The carved wall: every glyph in a staggered grid, as an SVG to use as a CSS
 * mask (index.css .glyph-wall), so the wall itself is painted in the theme's
 * colour. Built once.
 */
let wallUrl = '';
export function glyphWallUrl(): string {
  if (wallUrl) return wallUrl;
  const names = Object.keys(GLYPHS) as GlyphName[];
  const cell = 40, cols = 4, rows = Math.ceil(names.length / cols);
  let body = '';
  names.forEach((n, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const x = c * cell + (r % 2 ? cell / 2 : 0) + 8, y = r * cell + 8;
    body += `<g transform="translate(${x} ${y})"><path d="${GLYPHS[n]}"/></g>`;
  });
  const w = cols * cell + cell / 2, h = rows * cell;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="#000" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  wallUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return wallUrl;
}
