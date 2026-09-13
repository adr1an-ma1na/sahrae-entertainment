import { useId } from 'react';

/**
 * Spot illustrations for empty and resting states.
 *
 * Inline SVG rather than image files, deliberately:
 *   - they follow the theme (surfaces and outlines read the same --zinc tokens
 *     as the rest of the app, so they sit correctly in light, dark and midnight)
 *   - they weigh a few hundred bytes each and are in the bundle, so they appear
 *     instantly and work offline in the APK — an empty Downloads screen is most
 *     likely to be opened with no connection
 *   - one visual language across every scene: a soft blue glow, two frosted
 *     glass cards echoing the app's glass surfaces, the subject, and sparkles
 *
 * The subject glyphs use fixed blues rather than the --gold tokens. Those are
 * the dark-theme primary (a light blue), which nearly vanishes on the light
 * theme's white page; a light-to-deep gradient reads on every background.
 *
 * Decorative only: aria-hidden, since the heading beside each illustration
 * already says what it means.
 */

export type IllustrationName =
  | 'list' | 'continue' | 'downloads' | 'search' | 'filters' | 'offline'
  | 'music' | 'podcast' | 'radio' | 'tv' | 'favorites' | 'playlist' | 'video';

export default function Illustration({
  name,
  className = 'w-48 h-auto md:w-56',
}: {
  name: IllustrationName;
  className?: string;
}) {
  // Unique gradient ids per instance, so two illustrations on one screen never
  // borrow each other's gradients. useId contains colons, which are fragile
  // inside url(#…), so they are stripped.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (k: string) => `${k}-${uid}`;
  const url = (k: string) => `url(#${id(k)})`;

  return (
    <svg viewBox="0 0 240 180" className={`illo ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={id('glow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7CACF8" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#4F7FE0" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#4F7FE0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('subject')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C2D7F8" />
          <stop offset="55%" stopColor="#7CACF8" />
          <stop offset="100%" stopColor="#0B57D0" />
        </linearGradient>
        <linearGradient id={id('deep')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1A5FD6" />
          <stop offset="100%" stopColor="#0842A0" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--glass-sheen, rgba(255,255,255,.09))' }} />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* glow */}
      <circle cx="120" cy="92" r="84" fill={url('glow')} />

      {/* back glass card, tilted */}
      <g transform="rotate(-9 120 94)" opacity="0.7">
        <rect x="66" y="40" width="108" height="108" rx="22"
          style={{ fill: 'var(--zinc-800)', stroke: 'var(--zinc-700)' }} fillOpacity="0.45" strokeWidth="1.2" />
      </g>
      {/* front glass card */}
      <rect x="70" y="42" width="100" height="104" rx="20"
        style={{ fill: 'var(--zinc-800)', stroke: 'var(--zinc-700)' }} fillOpacity="0.72" strokeWidth="1.2" />
      <rect x="70" y="42" width="100" height="104" rx="20" fill={url('sheen')} />
      <path d="M90 42.6h60" style={{ stroke: 'var(--glass-rim, rgba(255,255,255,.2))' }} strokeWidth="1.2" strokeLinecap="round" />

      <g className="illo-float">{subject(name, url)}</g>

      {/* sparkles */}
      <g className="illo-twinkle" fill={url('subject')}>
        <path transform="translate(48 50) scale(1.1)" d="M0-6 1.4-1.4 6 0 1.4 1.4 0 6-1.4 1.4-6 0-1.4-1.4Z" />
        <path transform="translate(196 58) scale(0.8)" d="M0-6 1.4-1.4 6 0 1.4 1.4 0 6-1.4 1.4-6 0-1.4-1.4Z" />
        <path transform="translate(186 146) scale(1)" d="M0-6 1.4-1.4 6 0 1.4 1.4 0 6-1.4 1.4-6 0-1.4-1.4Z" />
      </g>
      <circle cx="40" cy="128" r="3" fill="#7CACF8" opacity="0.55" />
      <circle cx="206" cy="104" r="2.2" fill="#C2D7F8" opacity="0.6" />
    </svg>
  );
}

/** The subject drawn on the front card, centred on roughly (120, 94). */
function subject(name: IllustrationName, url: (k: string) => string) {
  const S = url('subject');
  const D = url('deep');
  switch (name) {
    case 'list':
      return (
        <>
          <path d="M120 122c-2 0-24-14-30-26-5-10 1-24 14-24 7 0 12 4 16 9 4-5 9-9 16-9 13 0 19 14 14 24-6 12-28 26-30 26Z" fill={S} />
          <circle cx="146" cy="72" r="11" fill={D} />
          <path d="M146 66.5v11M140.5 72h11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </>
      );
    case 'continue':
      return (
        <>
          <circle cx="120" cy="86" r="26" fill={D} />
          <path d="M113 74.5 131 86l-18 11.5Z" fill="#E8F0FE" />
          <rect x="88" y="124" width="64" height="6" rx="3" style={{ fill: 'var(--zinc-700)' }} />
          <rect x="88" y="124" width="38" height="6" rx="3" fill={S} />
          <circle cx="126" cy="127" r="5" fill="#E8F0FE" />
        </>
      );
    case 'downloads':
      return (
        <>
          <path d="M120 64v38" stroke={S} strokeWidth="8" strokeLinecap="round" />
          <path d="m104 88 16 16 16-16" fill="none" stroke={S} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M94 110v10a8 8 0 0 0 8 8h36a8 8 0 0 0 8-8v-10" fill="none" stroke={D} strokeWidth="7" strokeLinecap="round" />
        </>
      );
    case 'search':
      return (
        <>
          <rect x="84" y="60" width="26" height="36" rx="5" style={{ fill: 'var(--zinc-700)' }} />
          <rect x="114" y="54" width="26" height="36" rx="5" style={{ fill: 'var(--zinc-700)' }} opacity="0.7" />
          <circle cx="120" cy="96" r="20" fill="none" stroke={S} strokeWidth="7" />
          <path d="m134 110 14 14" stroke={D} strokeWidth="9" strokeLinecap="round" />
        </>
      );
    case 'filters':
      return (
        <>
          {[70, 94, 118].map((y, i) => (
            <g key={y}>
              <rect x="88" y={y - 3} width="64" height="6" rx="3" style={{ fill: 'var(--zinc-700)' }} />
              <circle cx={[104, 136, 116][i]} cy={y} r="9" fill={i === 1 ? D : S} />
            </g>
          ))}
        </>
      );
    case 'offline':
      return (
        <>
          <path d="M98 114h46a18 18 0 0 0 0-36 26 26 0 0 0-49-6 20 20 0 0 0 3 42Z" fill={S} />
          <path d="m92 64 58 58" stroke={D} strokeWidth="8" strokeLinecap="round" />
        </>
      );
    case 'music':
      return (
        <>
          <circle cx="110" cy="100" r="28" fill={D} />
          <circle cx="110" cy="100" r="18" fill="none" stroke="#7CACF8" strokeOpacity="0.4" strokeWidth="1.5" />
          <circle cx="110" cy="100" r="6" fill="#E8F0FE" />
          <path d="M136 58v40" stroke={S} strokeWidth="6" strokeLinecap="round" />
          <path d="M136 58c8 2 14 7 16 15" fill="none" stroke={S} strokeWidth="6" strokeLinecap="round" />
          <circle cx="129" cy="100" r="9" fill={S} />
        </>
      );
    case 'podcast':
      return (
        <>
          <rect x="106" y="56" width="28" height="48" rx="14" fill={S} />
          <path d="M96 92a24 24 0 0 0 48 0" fill="none" stroke={D} strokeWidth="6" strokeLinecap="round" />
          <path d="M120 116v12M108 128h24" stroke={D} strokeWidth="6" strokeLinecap="round" />
          <path d="M84 72a40 40 0 0 0 0 36M156 72a40 40 0 0 1 0 36" fill="none" stroke="#7CACF8" strokeOpacity="0.6" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'radio':
      return (
        <>
          <path d="m120 86-16 42h32Z" fill={D} />
          <circle cx="120" cy="82" r="8" fill={S} />
          <path d="M104 66a22 22 0 0 0 0 32M136 66a22 22 0 0 1 0 32" fill="none" stroke={S} strokeWidth="5" strokeLinecap="round" />
          <path d="M92 56a38 38 0 0 0 0 52M148 56a38 38 0 0 1 0 52" fill="none" stroke="#7CACF8" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'tv':
      return (
        <>
          <rect x="84" y="62" width="72" height="50" rx="9" fill={D} />
          <rect x="90" y="68" width="60" height="38" rx="5" fill={S} opacity="0.35" />
          <path d="M114 78 130 87l-16 9Z" fill="#E8F0FE" />
          <path d="M108 126h24M120 112v14" stroke={S} strokeWidth="6" strokeLinecap="round" />
        </>
      );
    case 'favorites':
      return (
        <path d="m120 60 10.6 21.5 23.7 3.4-17.2 16.7 4 23.6L120 114l-21.1 11.2 4-23.6-17.2-16.7 23.7-3.4Z" fill={S} />
      );
    case 'playlist':
      return (
        <>
          <rect x="86" y="64" width="54" height="9" rx="4.5" fill={S} />
          <rect x="86" y="82" width="46" height="9" rx="4.5" fill={S} opacity="0.75" />
          <rect x="86" y="100" width="38" height="9" rx="4.5" fill={S} opacity="0.55" />
          <path d="M150 78v34" stroke={D} strokeWidth="6" strokeLinecap="round" />
          <path d="M150 78c7 2 11 6 13 12" fill="none" stroke={D} strokeWidth="6" strokeLinecap="round" />
          <circle cx="143" cy="113" r="9" fill={D} />
        </>
      );
    case 'video':
      return (
        <>
          <rect x="80" y="66" width="80" height="52" rx="12" fill={D} />
          <path d="M113 80 133 92l-20 12Z" fill="#E8F0FE" />
          <rect x="88" y="126" width="64" height="5" rx="2.5" style={{ fill: 'var(--zinc-700)' }} />
          <rect x="88" y="126" width="26" height="5" rx="2.5" fill={S} />
        </>
      );
  }
}
