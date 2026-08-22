/**
 * Structural loading placeholders.
 *
 * Replaces the lone centred spinner that used to take over the whole screen
 * while a section loaded. A spinner says "wait" and nothing else — the layout
 * jumps into existence when it vanishes. A skeleton in the SHAPE of the page
 * says "here is what is coming", holds the layout still so nothing shifts under
 * the reader, and makes the same wait feel markedly shorter.
 *
 * Reuses the existing `.skeleton` shimmer from index.css, so this looks like the
 * row-level placeholders MediaRow already draws rather than a second visual
 * language.
 */

/** One horizontal rail of poster tiles: a title bar plus a row of 2:3 cards. */
function RailSkeleton({ tiles = 8, wide = false }: { tiles?: number; wide?: boolean }) {
  return (
    <div className="px-4 md:px-12 py-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-1 h-5 md:h-6 rounded-full bg-gradient-to-b from-amber-300/60 to-amber-600/60" />
        <div className="skeleton h-5 md:h-6 w-44 rounded-md" />
      </div>
      <div className="flex gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4 overflow-hidden pb-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <div
            key={i}
            className={`skeleton flex-none rounded-lg border border-white/5 ${
              wide
                ? 'w-[220px] md:w-[300px] lg:w-[340px] aspect-video'
                : 'w-[120px] md:w-[140px] lg:w-[160px] xl:w-[180px] aspect-[2/3]'
            }`}
            // Stagger the shimmer so the row reads as a wave rather than one
            // block pulsing in unison — subtle, but it feels alive.
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Billboard + rails: the shape of Home, Movies and Series. */
export function BrowseSkeleton({ hero = true, rails = 3 }: { hero?: boolean; rails?: number }) {
  return (
    <div className="animate-in fade-in duration-300">
      {hero && (
        <div className="relative w-full h-[46vh] md:h-[62vh] skeleton">
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--ink)] via-transparent to-transparent" />
          <div className="absolute bottom-10 left-4 md:left-12 right-4 space-y-4 max-w-2xl">
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton h-10 md:h-14 w-3/4 rounded-lg" />
            <div className="flex gap-2">
              <div className="skeleton h-6 w-16 rounded-full" />
              <div className="skeleton h-6 w-16 rounded-full" />
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-5/6 rounded" />
            <div className="flex gap-3 pt-2">
              <div className="skeleton h-11 w-32 rounded-lg" />
              <div className="skeleton h-11 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      )}
      {Array.from({ length: rails }).map((_, i) => (
        <RailSkeleton key={i} />
      ))}
    </div>
  );
}

/** A wrapping grid, for search results and the browse-all views. */
export function GridSkeleton({ tiles = 18, title = true }: { tiles?: number; title?: boolean }) {
  return (
    <div className="px-4 md:px-12 pt-[calc(env(safe-area-inset-top)+7rem)] md:pt-28 pb-24 animate-in fade-in duration-300">
      {title && <div className="skeleton h-8 w-64 rounded-lg mb-8" />}
      <div className="flex flex-wrap gap-2.5 md:gap-3 lg:gap-3.5 xl:gap-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <div
            key={i}
            className="skeleton w-[120px] md:w-[140px] lg:w-[160px] xl:w-[180px] aspect-[2/3] rounded-lg border border-white/5"
            style={{ animationDelay: `${(i % 6) * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Stacked list rows — Downloads, My List, Continue Watching. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="px-4 md:px-12 pt-[calc(env(safe-area-inset-top)+7rem)] md:pt-28 pb-24 max-w-5xl mx-auto animate-in fade-in duration-300">
      <div className="skeleton h-8 w-52 rounded-lg mb-8" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-white/5 bg-zinc-900/40">
            <div className="skeleton w-32 aspect-video rounded-lg shrink-0" style={{ animationDelay: `${i * 90}ms` }} />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="skeleton h-4 w-1/3 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RailSkeleton };
