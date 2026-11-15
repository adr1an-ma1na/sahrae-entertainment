/**
 * Which title a card stands for, so the TV can show a large picture of
 * whatever the remote is on (components/TvFocusPreview.tsx), the way Netflix
 * does (owner, 2026-11-15: "the way you can see pictures").
 *
 * Cards register themselves; the remote announces where it lands.
 */
import { useCallback } from 'react';
import type { MediaItem } from '../services/tmdb';

export interface PreviewItem { item: MediaItem; type: 'movie' | 'tv' }

const registry = new WeakMap<Element, PreviewItem>();

/** Sent on window each time the remote lands on a control; `detail` is the element. */
export const TV_FOCUSED = 'sahrae:tv-focused';
/** On the root element while the preview is in use: the remote settles rows lower, under it. */
export const PREVIEW_CLASS = 'tv-preview';
/** Marks a card that has a preview. */
export const PREVIEW_ATTR = 'data-tv-preview';

export const previewOf = (el: Element | null | undefined): PreviewItem | undefined => (el ? registry.get(el) : undefined);

/** For cards drawn in a loop, where a hook cannot be used. */
export function registerPreview(el: Element, item: MediaItem, type: 'movie' | 'tv'): void { registry.set(el, { item, type }); }

/** A ref for a card: `<div ref={usePreviewRef(item, type)} data-tv-preview>`. */
export function usePreviewRef(item: MediaItem, type: 'movie' | 'tv') {
  return useCallback((el: HTMLElement | null) => { if (el) registry.set(el, { item, type }); }, [item, type]);
}
