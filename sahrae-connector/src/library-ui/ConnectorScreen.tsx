import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeFromUrl, OAuthError } from '../auth/oauthClient.ts';
import { subscribe } from '../auth/tokenStore.ts';
import { backendMisconfigured } from '../auth/config.ts';
import { launch } from '../playback/tier1.ts';
import { adapterFor, allAdapters, mergeTracks } from '../providers/registry.ts';
import type { ProviderAdapter } from '../providers/types.ts';
import { pickArtwork, type ProviderId, type SahraeTrack } from '../types/index.ts';
import ProviderBadge, { providerName } from './ProviderBadge.tsx';
import EmbedPlayer from './EmbedPlayer.tsx';

/**
 * Library screen.
 *
 * Lists every provider, connects them, pulls each connected library, and shows
 * the result as one merged list with a provenance badge per row. Activating a
 * row resolves through tierPolicy: Tier 2 plays in the provider's own embed
 * below, Tier 1 hands off to its app.
 */

const fmtDuration = (ms: number): string => {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Guards the one-shot OAuth completion against StrictMode's double-invoke.
// Module scope, not a ref: StrictMode remounts, and a ref would reset with it.
let completionStarted = false;

interface LoadState {
  loading: boolean;
  error?: string;
  tracks: SahraeTrack[];
}

export default function ConnectorScreen() {
  // Re-render whenever a token is stored or cleared, so the connect buttons
  // reflect reality without the screen polling.
  const [tokenVersion, setTokenVersion] = useState(0);
  useEffect(() => subscribe(() => setTokenVersion((v) => v + 1)), []);

  const [byProvider, setByProvider] = useState<Record<string, LoadState>>({});
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [dedupe, setDedupe] = useState(false);

  // The track playing in the Tier 2 embed, or null when nothing is embedded.
  // Mirrored into a ref so callbacks can read it without a stale closure and
  // without doing work inside a state updater.
  const [playing, setPlaying] = useState<SahraeTrack | null>(null);
  const playingRef = useRef<SahraeTrack | null>(null);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const connected = useMemo(
    () => allAdapters.filter((a) => a.implemented && a.isConnected()),
    // tokenVersion is the point: connection state lives outside React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tokenVersion],
  );

  /**
   * A build that cannot reach its backend is unrecoverable from inside the app,
   * so say so instead of letting every Connect button fail with a network error.
   * build:android refuses to produce this configuration; this covers a bundle
   * built some other way.
   */
  const configError = useMemo(() => backendMisconfigured(), []);

  // ── Finish an OAuth redirect, if this load is one ──
  useEffect(() => {
    const url = window.location.href;
    if (!/[?&]code=|[?&]error=/.test(url)) return;
    // An authorization code is single-use, so this may run exactly once per page
    // load. React StrictMode deliberately double-invokes effects in development,
    // and a useRef would not help because StrictMode unmounts and remounts —
    // the guard has to outlive the component, hence module scope. Without it the
    // second exchange fails on a spent code and the user sees an error after a
    // sign-in that actually succeeded.
    if (completionStarted) return;
    completionStarted = true;

    completeFromUrl(url)
      .then((provider) => {
        setNotice({ kind: 'info', text: `Connected to ${providerName(provider)}.` });
      })
      .catch((err: unknown) => {
        setNotice({ kind: 'error', text: err instanceof OAuthError || err instanceof Error ? err.message : 'Could not complete sign-in.' });
      })
      .finally(() => {
        // Strip the code from the address bar: it is single-use, and leaving it
        // there means a refresh replays a spent exchange and shows an error.
        window.history.replaceState({}, '', window.location.pathname);
      });
  }, []);

  const loadProvider = useCallback(async (adapter: ProviderAdapter) => {
    setByProvider((p) => ({ ...p, [adapter.id]: { loading: true, tracks: p[adapter.id]?.tracks || [] } }));
    try {
      const tracks = await adapter.getUserLibrary(100);
      setByProvider((p) => ({ ...p, [adapter.id]: { loading: false, tracks } }));
    } catch (err) {
      setByProvider((p) => ({
        ...p,
        [adapter.id]: {
          loading: false,
          tracks: [],
          error: err instanceof Error ? err.message : 'Could not load this library.',
        },
      }));
    }
  }, []);

  // Pull each newly-connected provider's library once.
  useEffect(() => {
    for (const a of connected) {
      if (!byProvider[a.id]) loadProvider(a);
    }
    // byProvider is intentionally not a dep: including it would re-run on every
    // load and re-fetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, loadProvider]);

  const onConnect = async (adapter: ProviderAdapter) => {
    try {
      const url = await adapter.beginConnect();
      window.location.href = url;
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Could not start sign-in.' });
    }
  };

  const onDisconnect = (adapter: ProviderAdapter) => {
    adapter.disconnect();
    setByProvider((p) => {
      const next = { ...p };
      delete next[adapter.id];
      return next;
    });
  };

  /** Hand a track off to the provider's app (Tier 1). */
  const handOff = useCallback(async (track: SahraeTrack, reason?: string) => {
    if (reason) setNotice({ kind: 'info', text: `${reason} Opening ${providerName(track.provider)} instead.` });
    const result = await launch({
      kind: 'deeplink',
      deepLink: track.playback.deepLink,
      webUrl: track.playback.webUrl,
      provider: track.provider,
    });
    if (result.opened === 'none') {
      setNotice({ kind: 'error', text: result.reason || 'Could not open that track.' });
    }
  }, []);

  const onPlay = async (track: SahraeTrack) => {
    const action = await adapterFor(track.provider).resolvePlaybackAction(track);

    // Tier 2 — play it here, in the provider's own visible player.
    if (action.kind === 'embed') {
      setPlaying(track);
      return;
    }
    // Tier 3 is Phase 3 and nothing produces it yet; refusing is honest.
    if (action.kind === 'native') {
      setNotice({ kind: 'error', text: 'Sahrae-hosted playback is not built yet.' });
      return;
    }
    if (action.kind === 'unavailable') {
      setNotice({ kind: 'error', text: action.reason });
      return;
    }

    // Tier 1.
    setPlaying(null);
    const result = await launch(action);
    if (result.opened === 'none') {
      setNotice({ kind: 'error', text: result.reason || 'Could not open that track.' });
    } else if (result.opened === 'web') {
      setNotice({ kind: 'info', text: `Opened in ${providerName(track.provider)} on the web.` });
    }
  };

  /**
   * The embed reported it cannot play — fall back to the provider's app.
   *
   * The current track is read from a ref, not from inside a setState updater:
   * React may invoke an updater twice (StrictMode, concurrent re-render), and a
   * hand-off fired from inside one would launch the external app twice.
   */
  const onEmbedFallback = useCallback((reason: string) => {
    const current = playingRef.current;
    setPlaying(null);
    if (current) void handOff(current, reason);
  }, [handOff]);

  const merged = useMemo(
    () => mergeTracks(
      Object.values(byProvider).map((s) => s.tracks),
      { dedupeByIsrc: dedupe, order: ['spotify', 'youtube'] as ProviderId[] },
    ),
    [byProvider, dedupe],
  );

  const anyLoading = Object.values(byProvider).some((s) => s.loading);

  return (
    <div className={`min-h-screen bg-zinc-950 text-white px-4 md:px-8 py-8 max-w-5xl mx-auto ${playing ? "pb-[26rem]" : ""}`}>
      <header className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-1">Sahrae</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Connections</h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-2xl">
          Link the services you already use. Sahrae reads your saved music into one list.
          Playing a track uses that service&apos;s own player — here when it can, in their app when it cannot.
        </p>
      </header>

      {configError && (
        <div role="alert" className="mb-6 rounded-xl px-4 py-3 text-sm border bg-red-500/10 border-red-500/40 text-red-200">
          <p className="font-semibold mb-1">This build cannot reach its sign-in service.</p>
          <p className="text-red-200/80 text-xs leading-relaxed">{configError}</p>
        </div>
      )}

      {notice && (
        <div role="status"
          className={`mb-6 rounded-xl px-4 py-3 text-sm border flex items-start justify-between gap-3 ${
            notice.kind === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-current/60 hover:text-current shrink-0">✕</button>
        </div>
      )}

      {/* ── Providers ── */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-3">Services</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {allAdapters.map((a) => {
            const isOn = a.implemented && a.isConnected();
            const state = byProvider[a.id];
            return (
              <div key={a.id}
                className={`rounded-xl border p-4 flex items-center gap-3 ${
                  a.implemented ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.01] opacity-60'
                }`}>
                <ProviderBadge provider={a.id} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{a.displayName}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {!a.implemented
                      ? 'Coming soon'
                      : isOn
                        ? state?.loading
                          ? 'Loading your library…'
                          : state?.error
                            ? state.error
                            : `${state?.tracks.length ?? 0} saved tracks`
                        : 'Not connected'}
                  </p>
                </div>
                {a.implemented && (
                  isOn ? (
                    <button onClick={() => onDisconnect(a)}
                      className="text-xs font-bold px-3 py-2 rounded-lg border border-white/10 text-zinc-300 hover:text-white hover:border-white/25 transition-colors">
                      Disconnect
                    </button>
                  ) : (
                    <button onClick={() => onConnect(a)} disabled={!!configError}
                      title={configError || undefined}
                      className="text-xs font-bold px-3 py-2 rounded-lg bg-amber-500 text-amber-950 hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      Connect
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Merged library ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold">Your library</h2>
          {merged.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="accent-amber-500" />
              Merge duplicates across services
            </label>
          )}
        </div>

        {connected.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center border border-dashed border-white/10 rounded-xl">
            Connect a service above and your saved music appears here.
          </p>
        ) : merged.length === 0 && anyLoading ? (
          <p className="text-sm text-zinc-400 py-10 text-center">Loading your library…</p>
        ) : merged.length === 0 ? (
          <p className="text-sm text-zinc-500 py-10 text-center">Nothing saved in the connected services yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {merged.map((t) => {
              const art = pickArtwork(t.artwork, 120);
              return (
                <li key={t.id}>
                  <button onClick={() => onPlay(t)}
                    aria-label={`Play ${t.title} by ${t.artists.join(', ')} in ${providerName(t.provider)}`}
                    className="w-full flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-white/5 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                    <div className="w-11 h-11 rounded bg-zinc-800 overflow-hidden shrink-0">
                      {art && <img src={art} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {t.artists.join(', ')}{t.album ? ` · ${t.album}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums shrink-0">{fmtDuration(t.durationMs)}</span>
                    <ProviderBadge provider={t.provider} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-zinc-600 mt-10 leading-relaxed">
        Sahrae does not host or stream audio from these services. A track plays in that service&apos;s
        own player inside Sahrae, or opens in its app — the service always serves the audio.
        In-app playback runs only while Sahrae is on screen.
      </p>

      {playing && (
        <EmbedPlayer
          key={playing.id}
          track={playing}
          onFallback={onEmbedFallback}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}
