import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { isTelevision } from '../tv/spatialNavigation';
import { t } from '../i18n';

/** Fired by the top bar's search button: go to Search and put the cursor in the box. */
export const FOCUS_SEARCH = 'sahrae:focus-search';

/**
 * The one search box, at the top of the Search page. It used to live only in
 * the top bar, hidden behind an icon, so the Search tab on a phone opened a page
 * with filters and nowhere to type.
 *
 * Results follow the typing after a short pause; Enter searches at once.
 */
export default function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSent = useRef(value);

  useEffect(() => { setText(value); lastSent.current = value; }, [value]);

  const send = (q: string) => {
    const v = q.trim();
    if (v === lastSent.current.trim()) return;
    lastSent.current = v;
    onSearch(v);
  };

  useEffect(() => {
    const id = setTimeout(() => send(text), 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    // A TV opens its on-screen keyboard on focus; let the viewer choose to type.
    if (!isTelevision() && !value) inputRef.current?.focus({ preventScroll: true });
    const focus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH, focus);
    return () => window.removeEventListener(FOCUS_SEARCH, focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); send(text); inputRef.current?.blur(); }} className="relative mb-6">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('Films, series, actors, genres')}
        aria-label={t('Search')}
        className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl pl-12 pr-12 py-3.5 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button type="button" aria-label={t('Clear search')} onClick={() => { setText(''); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      )}
    </form>
  );
}
