/**
 * The sidebar's artwork: a wall of hieroglyphics (owner, 2026-11-17:
 * "hieroglyphics, particularly on the sidebar"; ui/Glyphs.tsx).
 *
 * Three layers of the same carved wall, all painted in the theme's colours:
 *   shadow  the cut edge of each sign, a pixel down and right, so the signs
 *           read as cut into the wall rather than drawn on it;
 *   face    the signs themselves, quiet behind the menu;
 *   lit     the signs near the selected item, brighter, as if a lamp were
 *           held to the wall there (--glow-y, set by Sidebar).
 * Plus warm light falling from the top and a gold edge on the right.
 *
 * Static: only the lit patch moves, when the selection changes. A TV draws
 * the wall once.
 */
import type { CSSProperties } from 'react';
import { WALL_W, glyphWallUrl } from './Glyphs';

export default function SideArt() {
  const style = { '--wall': glyphWallUrl(), '--wall-w': `${WALL_W}px` } as CSSProperties;
  return (
    <div className="side-art" aria-hidden="true" style={style}>
      <div className="side-art-glow" />
      <div className="glyph-wall glyph-wall-shadow" />
      <div className="glyph-wall glyph-wall-face" />
      <div className="glyph-wall glyph-wall-lit" />
      <div className="side-edge" />
    </div>
  );
}
