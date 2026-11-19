/**
 * The sidebar's carved wall (SideArt) as a frieze, for the phone, which has no
 * sidebar (owner, 2026-11-19: "hieroglyphics should be on the phone … the
 * bottom and also the More section"). The same wall of signs (ui/Glyphs.tsx),
 * in the same three layers and the theme's colours: the cut edge, the signs,
 * and a lamp lighting the signs above the selected tab (`litX`). A gold edge
 * runs along the top, as one runs down the sidebar. Static, drawn once.
 */
import type { CSSProperties } from 'react';
import { WALL_W, glyphWallUrl } from './Glyphs';

export default function GlyphFrieze({ litX, className = '' }: { litX?: string; className?: string }) {
  const style = { '--wall': glyphWallUrl(), '--wall-w': `${WALL_W}px`, '--lit-x': litX ?? '-400px' } as CSSProperties;
  return (
    <div className={`glyph-frieze ${className}`} aria-hidden="true" style={style}>
      <div className="frieze-wall frieze-shadow" />
      <div className="frieze-wall frieze-face" />
      <div className="frieze-wall frieze-lit" />
      <div className="frieze-edge" />
    </div>
  );
}
