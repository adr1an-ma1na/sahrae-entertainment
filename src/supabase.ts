import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const isNativeShell = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

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
  // VITE_AUTH_LOCAL=1 builds use the on-device accounts instead: for testing a
  // local build signed in without touching real accounts. Never set in CI.
  SUPABASE_URL && SUPABASE_ANON_KEY && ENV.VITE_AUTH_LOCAL !== '1'
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // The links in reset and confirmation emails carry the session in the
        // address; read it on the web. The Android app is never opened by them.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isNativeShell() },
      })
    : null;

export const hasSupabase = !!supabase;
