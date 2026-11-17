/**
 * The sidebar's hieroglyphics (owner, 2026-11-17: "hieroglyphics, particularly
 * on the sidebar").
 *
 * Signs drawn in the manner of Egyptian hieroglyphs, single carved strokes on
 * a 24 grid: the eye, ankh, feather, scarab, ibis, owl, reed, water, lotus,
 * cobra, djed pillar, sun disc, loaf, basket, mouth, hand, star, palm, scroll.
 * They decorate; they are not arranged to spell anything.
 *
 * The wall is composed the way a temple wall is: vertical columns divided by
 * fine rules, signs grouped into square blocks (one large sign, or two small
 * ones stacked or side by side), under a frieze band. It is built once as an
 * SVG and used as a CSS mask (index.css .glyph-wall*), so the paint is always
 * the theme's own colour.
 */
import type { SVGProps } from 'react';

export const GLYPHS = {
  eye: 'M2.5 11c3-3 6-4.5 9.5-4.5s6.5 1.5 9.5 4.5c-3 2.5-6 3.5-9.5 3.5S5.5 13.5 2.5 11zM12 8.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 1 0 0-4.8zM3.5 6.5C6.5 4 9.3 3 12 3s5.5 1 8.5 3.5M9 14.3c-.4 3-1.8 5-4 6.7M14.5 14.3v3c0 2.2 2.2 3.4 3.4 2.4.9-.8.6-2.6-1-2.6',
  ankh: 'M12 2.8c-2.4 0-4 1.9-4 4.3 0 2.3 1.8 3.9 4 5.4 2.2-1.5 4-3.1 4-5.4 0-2.4-1.6-4.3-4-4.3zM5.5 12.5h13M12 12.5v8.7',
  feather: 'M9 21.2c-.6-6 .5-12 4-16 1.6-1.8 3.6-2.3 4.6-1.6.3 4.1-1.7 8.3-5.6 11.7M9 21.2l3-5.6M11.2 11.4l2.6-1.2M10.5 14.6l2.4-.6',
  scarab: 'M12 8.2a4.6 5.6 0 1 0 0 11.2 4.6 5.6 0 1 0 0-11.2zM9.6 8.4a2.4 2 0 0 1 4.8 0M12 10.4v9M7.6 11.2 4.6 9.6M7.4 14H4M8 17l-2.6 2.2M16.4 11.2l3-1.6M16.6 14H20M16 17l2.6 2.2',
  ibis: 'M7.5 13.2c0-3 2.6-5.2 6.2-5.2 2.4 0 3.9 1.4 4.4 3.4-2 1.6-4.6 2.6-7.6 2.6M13.6 8c-.6-2.1.4-4.2 2.6-4.6M16.2 3.4c1.2.6 2.2 2.2 2.7 4.8M10.6 13.8V21M13.6 13.4 14.8 21M7.5 13.2 4.4 14.8M9 21h3M13.4 21h3',
  owl: 'M8 20.5V9.2c0-2.6 1.8-4.6 4-4.6s4 2 4 4.6v11.3M10.4 9.2h.01M13.6 9.2h.01M12 10.6v1.6M8.6 5.6 8 3.4M15.4 5.6l.6-2.2M7 20.5h10M9.5 14.5c1.6.8 3.4.8 5 0',
  reed: 'M12 21.2V6M12 6c1.5-1.5 3.1-2.5 4.6-3-.3 2.6-1.8 4.6-4.6 6.1M12 11.2c-1.6-1-3.1-1.4-4.6-1.3.8 1.6 2.4 2.7 4.6 3.1M9.5 21.2h5',
  water: 'M3 8.5 4.5 7 6 8.5 7.5 7 9 8.5 10.5 7 12 8.5 13.5 7 15 8.5 16.5 7 18 8.5 19.5 7 21 8.5M3 12.5 4.5 11 6 12.5 7.5 11 9 12.5 10.5 11 12 12.5 13.5 11 15 12.5 16.5 11 18 12.5 19.5 11 21 12.5M3 16.5 4.5 15 6 16.5 7.5 15 9 16.5 10.5 15 12 16.5 13.5 15 15 16.5 16.5 15 18 16.5 19.5 15 21 16.5',
  lotus: 'M12 21.2V13M12 13c-1.6-2.2-1.6-5.4 0-8.6 1.6 3.2 1.6 6.4 0 8.6zM12 13c-2.6-.5-4.6-2.6-5.2-5.8 2.6.3 4.4 2.2 5.2 5.8zM12 13c2.6-.5 4.6-2.6 5.2-5.8-2.6.3-4.4 2.2-5.2 5.8zM9 21.2h6',
  cobra: 'M7.5 21h9M10 21c0-3.2 4-4.2 4-8.4 0-2.6-2-4-2-6.6 0-1.6 1-3 2.6-3S17 4.2 17 5.6c0 1-.8 1.8-2.1 2.1M10.6 8.6c-1.2.6-1.6 1.8-1.2 3',
  djed: 'M10 21.2V7.6M14 21.2V7.6M8 7.6h8M8 5.4h8M8 3.2h8M7 21.2h10M10 12h4M10 16h4',
  sun: 'M12 5.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 1 0 0-12.8zM12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z',
  loaf: 'M4.5 16.5a7.5 7.5 0 0 1 15 0zM3.5 16.5h17',
  basket: 'M4 11h16c0 4.4-3.6 8-8 8s-8-3.6-8-8zM9 11V9.2c0-1.7 1.3-3 3-3s3 1.3 3 3V11',
  mouth: 'M3 12c3-2.6 6-3.6 9-3.6s6 1 9 3.6c-3 2.6-6 3.6-9 3.6S6 14.6 3 12zM6.5 12h11',
  hand: 'M3.5 15h13c1.6 0 3-.9 3-2.3s-1.4-2.4-3-2.4H8.8L6.2 12.4M9 13h8.5M3.5 15v-2.6',
  star: 'M12 3.2l2.2 5.6 5.8.6-4.5 3.8 1.4 5.8L12 15.9 7.1 19l1.4-5.8L4 9.4l5.8-.6z',
  palm: 'M12 21.2V10M12 10c-2-3-5-4-8-3M12 10c2-3 5-4 8-3M12 10c-1-3-1-5 1-7M12 10c-3-1-5 1-6 3M12 10c3-1 5 1 6 3M8 21.2h8',
  scroll: 'M6 4.5h11.5a2.5 2.5 0 0 1 0 5H8.5M6 4.5a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 6 19.5h11M17.5 9.5v10M8 12.5h6M8 15.5h5',
} as const;
export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, ...rest }: { name: GlyphName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={GLYPHS[name]} />
    </svg>
  );
}

/** The signs the wall is composed from (the scroll is kept for the labels). */
const WALL: GlyphName[] = ['eye', 'ankh', 'feather', 'scarab', 'ibis', 'owl', 'reed', 'water', 'lotus', 'cobra', 'djed', 'sun', 'loaf', 'basket', 'mouth', 'hand', 'star', 'palm'];
/** Signs that read well small, for the paired blocks. */
const SMALL: GlyphName[] = ['sun', 'loaf', 'mouth', 'water', 'basket', 'star', 'hand', 'eye', 'reed', 'ankh'];

export const WALL_W = 256;
export const WALL_H = 1240;
const COLS = 4;
const COL_W = WALL_W / COLS;
const FRIEZE_H = 22;

const sign = (name: GlyphName, x: number, y: number, size: number) =>
  `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 24).toFixed(3)})"><path d="${GLYPHS[name]}"/></g>`;

/**
 * The wall as SVG markup: a frieze along the top, four columns between fine
 * rules, each filled with blocks of signs chosen by a fixed seed (the same wall
 * on every device and every visit).
 */
function wallSvg(): string {
  let seed = 11;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (list: GlyphName[]) => list[Math.floor(rnd() * list.length)];
  let body = '';
  // The frieze: a band of tall rounded posts between two rules.
  body += `<path d="M0 2.5H${WALL_W}M0 ${FRIEZE_H - 2.5}H${WALL_W}"/>`;
  for (let x = 4; x < WALL_W - 4; x += 12) body += `<path d="M${x} ${FRIEZE_H - 5}V9a3 3 0 0 1 6 0V${FRIEZE_H - 5}M${x + 3} 6.5v2"/>`;
  // The column rules.
  for (let c = 0; c <= COLS; c++) {
    const x = Math.min(WALL_W - 0.75, Math.max(0.75, c * COL_W));
    body += `<path d="M${x} ${FRIEZE_H + 4}V${WALL_H}" stroke-width="0.9"/>`;
  }
  // The blocks.
  for (let c = 0; c < COLS; c++) {
    const x0 = c * COL_W;
    let y = FRIEZE_H + 12 + (c % 2) * 14;
    let last = '';
    while (y < WALL_H - 40) {
      const kind = rnd();
      if (kind < 0.5) {
        let g = pick(WALL); if (g === last) g = pick(WALL); last = g;
        const s = 34;
        body += sign(g, x0 + (COL_W - s) / 2, y, s);
        y += s + 14;
      } else if (kind < 0.8) {
        const s = 20;
        body += sign(pick(SMALL), x0 + (COL_W - s) / 2, y, s);
        body += sign(pick(SMALL), x0 + (COL_W - s) / 2, y + s + 4, s);
        y += s * 2 + 4 + 14;
      } else {
        const s = 20;
        body += sign(pick(SMALL), x0 + COL_W / 2 - s - 2, y, s);
        body += sign(pick(SMALL), x0 + COL_W / 2 + 2, y, s);
        y += s + 14;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WALL_W}" height="${WALL_H}" viewBox="0 0 ${WALL_W} ${WALL_H}" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

let wallUrl = '';
export function glyphWallUrl(): string {
  if (!wallUrl) wallUrl = `url("data:image/svg+xml,${encodeURIComponent(wallSvg())}")`;
  return wallUrl;
}
