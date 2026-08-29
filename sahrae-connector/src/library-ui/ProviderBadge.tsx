import type { ProviderId } from '../types/index.ts';

/**
 * Per-track provenance badge.
 *
 * Deliberately a neutral chip — a letter and Sahrae's own palette — not the
 * provider's logo, wordmark or brand colour. Reproducing another service's
 * branding inside our UI is out of scope by constraint, and it would also be a
 * trademark problem: a Spotify-green pill implies an endorsement that does not
 * exist. The badge answers "where is this from", which is all it needs to do.
 */

const LABEL: Record<ProviderId, { short: string; full: string }> = {
  spotify: { short: 'SP', full: 'Spotify' },
  youtube: { short: 'YT', full: 'YouTube Music' },
  apple: { short: 'AM', full: 'Apple Music' },
  deezer: { short: 'DZ', full: 'Deezer' },
  soundcloud: { short: 'SC', full: 'SoundCloud' },
};

export default function ProviderBadge({ provider, size = 'sm' }: { provider: ProviderId; size?: 'sm' | 'md' }) {
  const l = LABEL[provider];
  return (
    <span
      title={`From ${l.full}`}
      aria-label={`From ${l.full}`}
      className={`inline-flex items-center justify-center shrink-0 rounded font-bold tracking-wide bg-white/10 text-zinc-300 border border-white/10 ${
        size === 'md' ? 'text-[11px] px-2 py-1' : 'text-[10px] px-1.5 py-0.5'
      }`}
    >
      {l.short}
    </span>
  );
}

export function providerName(provider: ProviderId): string {
  return LABEL[provider].full;
}
