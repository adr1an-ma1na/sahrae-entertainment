import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for authentication.
 *
 * The anon key is PUBLIC by design (Row-Level Security protects your data), so
 * it's safe to ship in the client — exactly like a Firebase web config. Fill
 * these two values from Supabase → Project → Settings → API. Until BOTH are
 * present the client is `null` and the app transparently falls back to the
 * on-device auth shim (see firebase.ts), so the build never breaks.
 *
 * They can be provided either as Vite env vars (VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY) or by hardcoding the constants below.
 */
const ENV = (import.meta as unknown as { env?: Record<string, string> }).env || {};
// URL + PUBLISHABLE (client-safe) key only. NEVER put the secret key here.
const SUPABASE_URL = ENV.VITE_SUPABASE_URL || 'https://qkyrztpqdrpucdyabjsm.supabase.co';
const SUPABASE_ANON_KEY = ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_pd_yZhWPd2SE1ipMbijolQ_0jVCfcL0';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

export const hasSupabase = !!supabase;

/**
 * Raw REST details, for callers that must not depend on the SDK being alive.
 * The error reporter is the case: it has to work when initialising something
 * else is exactly what failed.
 */
export const SUPABASE_REST = SUPABASE_URL ? `${SUPABASE_URL}/rest/v1` : '';
export const SUPABASE_KEY = SUPABASE_ANON_KEY;
