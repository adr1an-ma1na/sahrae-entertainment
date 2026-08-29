import type { ProviderId } from '../../types/index.ts';
import { createSpotifyEmbed } from './spotifyEmbed.ts';
import { createYouTubeEmbed } from './youtubeEmbed.ts';
import type { CreateEmbedOptions, EmbedController } from './types.ts';

export type { EmbedController, EmbedState, EmbedStatus, CreateEmbedOptions } from './types.ts';
export { createSpotifyEmbed } from './spotifyEmbed.ts';
export { createYouTubeEmbed } from './youtubeEmbed.ts';

/**
 * Build the right embedded player for a provider.
 *
 * Throws for a provider with no sanctioned embed rather than returning a broken
 * controller — the caller's fallback is Tier 1, which is a good outcome, not an
 * error state to paper over.
 */
export function createEmbed(provider: ProviderId, opts: CreateEmbedOptions): Promise<EmbedController> {
  switch (provider) {
    case 'spotify': return createSpotifyEmbed(opts);
    case 'youtube': return createYouTubeEmbed(opts);
    default:
      return Promise.reject(new Error(`No sanctioned embedded player for ${provider}.`));
  }
}
