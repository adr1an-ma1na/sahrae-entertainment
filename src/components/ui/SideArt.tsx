/**
 * The sidebar's artwork (owner, 2026-11-17: "an art design that's high level,
 * with the theme going on well"). All of it drawn in the theme's own colours:
 *
 *   SunMark   Sahrae's sun over dunes, as a small jewel beside the name.
 *   SideArt   behind the sidebar: dawn light at the top, a desert at the foot
 *             with the sun going down behind the dunes, and a gold edge whose
 *             light rests beside the selected item (--glow-y, set by Sidebar).
 *
 * Static shapes: nothing here moves except the edge light when the selection
 * changes, so a TV draws it once.
 */
import { useId } from 'react';

export function SunMark({ className = '' }: { className?: string }) {
  // Its own ids: the tablet rail and the sidebar both draw one, and a gradient
  // borrowed from the hidden copy does not paint.
  const u = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`sm-sky${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sm-top" />
          <stop offset="0.62" style={{ stopColor: 'rgb(var(--acc2-rgb))', stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--acc-rgb))', stopOpacity: 0.85 }} />
        </linearGradient>
        <radialGradient id={`sm-sun${u}`} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" style={{ stopColor: 'var(--logo-hi)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--logo-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-2)' }} />
        </radialGradient>
        <clipPath id={`sm-clip${u}`}><rect width="40" height="40" rx="11" /></clipPath>
      </defs>
      <g clipPath={`url(#sm-clip${u})`}>
        <rect width="40" height="40" fill={`url(#sm-sky${u})`} />
        <circle cx="20" cy="22.5" r="7.2" fill={`url(#sm-sun${u})`} />
        <path d="M-2 25.5 C 9 22.5 18 24.5 24 24.8 C 31 25.2 36 23.6 42 25 L42 42 L-2 42 Z" className="sa-far" />
        <path d="M-2 29.5 C 8 25.5 17 26.6 22 27.2 C 30 28.2 35 26.6 42 28.6 L42 42 L-2 42 Z" className="sa-near" />
        <path d="M-2 29.5 C 8 25.5 17 26.6 22 27.2 C 30 28.2 35 26.6 42 28.6" fill="none" style={{ stroke: 'var(--logo-1)' }} strokeWidth="0.9" opacity="0.85" />
      </g>
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" fill="none" style={{ stroke: 'rgb(var(--acc-rgb))' }} strokeOpacity="0.45" />
    </svg>
  );
}

export default function SideArt({ dunes = true }: { dunes?: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <div className="side-art" aria-hidden="true">
      <div className="side-art-glow" />
      {dunes && (
        <svg className="side-art-dunes" viewBox="0 0 256 210" preserveAspectRatio="xMidYMax slice">
          <defs>
            <radialGradient id={`sa-sky${u}`} cx="0.7" cy="0.62" r="0.7">
              <stop offset="0" style={{ stopColor: 'rgb(var(--acc-rgb))', stopOpacity: 0.34 }} />
              <stop offset="0.45" style={{ stopColor: 'rgb(var(--acc2-rgb))', stopOpacity: 0.14 }} />
              <stop offset="1" style={{ stopColor: 'rgb(var(--acc2-rgb))', stopOpacity: 0 }} />
            </radialGradient>
            <radialGradient id={`sa-sun${u}`} cx="0.5" cy="0.45" r="0.6">
              <stop offset="0" style={{ stopColor: 'var(--logo-hi)' }} />
              <stop offset="0.55" style={{ stopColor: 'var(--logo-1)' }} />
              <stop offset="1" style={{ stopColor: 'var(--logo-2)' }} />
            </radialGradient>
            <linearGradient id={`sa-fade${u}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--zinc-950)', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'var(--zinc-950)', stopOpacity: 0.9 }} />
            </linearGradient>
          </defs>
          <rect width="256" height="210" fill={`url(#sa-sky${u})`} />
          <circle cx="182" cy="132" r="22" fill={`url(#sa-sun${u})`} opacity="0.72" />
          <path d="M0 132 C 50 116 98 128 140 126 C 186 124 222 112 256 120 L256 210 L0 210 Z" className="sa-far" opacity="0.75" />
          <path d="M0 152 C 44 128 104 136 150 141 C 196 146 228 134 256 140 L256 210 L0 210 Z" className="sa-mid" />
          <path d="M0 152 C 44 128 104 136 150 141 C 196 146 228 134 256 140" fill="none" style={{ stroke: 'var(--logo-1)' }} strokeWidth="1" opacity="0.7" />
          <path d="M0 178 C 60 160 120 170 170 172 C 210 174 236 166 256 170 L256 210 L0 210 Z" className="sa-near" />
          <rect width="256" height="210" fill={`url(#sa-fade${u})`} />
        </svg>
      )}
      <div className="side-edge" />
    </div>
  );
}
