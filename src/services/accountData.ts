/**
 * The viewer's data rights, in the app (Privacy Policy, section 8):
 *
 *   exportMyData   a JSON copy of everything Sahrae keeps for them: account
 *                  details and every Sahrae setting, list and history on this
 *                  device (which, signed in, is also what the account holds)
 *   deleteAccount  the account and its synced library, gone; then this device
 *                  is cleared and signed out
 *
 * Deletion runs the `delete_my_account` function in Supabase
 * (supabase/delete_my_account.sql), which removes the caller's own synced row
 * and sign-in, and nobody else's. If that function has not been installed yet,
 * the synced library is still deleted (row-level security lets an account
 * delete its own row) and the viewer is told how to finish by email.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabase';
import { auth, logout } from '../firebase';
import { LEGAL_EMAIL } from '../legal/legalText';

/** Access keys are left out of an export: they are passwords in all but name. */
const SECRET = /token|session|password|accounts$/i;

export function collectMyData(): Record<string, unknown> {
  const user = auth.currentUser;
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sahrae[._]/.test(k) || SECRET.test(k)) continue;
      const v = localStorage.getItem(k);
      try { data[k] = JSON.parse(v || 'null'); } catch { data[k] = v; }
    }
  } catch { /* storage unavailable */ }
  return {
    exportedAt: new Date().toISOString(),
    account: user ? { id: user.uid, email: user.email, displayName: user.displayName } : null,
    note: 'Everything Sahrae keeps for you on this device. When you are signed in, your lists, likes, progress and settings are also kept with your account, as they appear here.',
    data,
  };
}

/** Save the export. Returns where it went, in words, for the confirmation. */
export async function exportMyData(): Promise<string> {
  const json = JSON.stringify(collectMyData(), null, 2);
  const name = `sahrae-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: name, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return `Saved to Documents as ${name}.`;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `Downloaded as ${name}.`;
}

/** Every Sahrae key on this device, so nothing of the account is left behind. */
function clearDevice() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^sahrae[._]/.test(k)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}

export type DeleteResult = { ok: true } | { ok: false; partial: boolean; message: string };

export async function deleteAccount(): Promise<DeleteResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, partial: false, message: 'Sign in first, then delete the account.' };
  if (!supabase) {
    // A build without the cloud backend keeps accounts on this device only.
    clearDevice();
    await logout();
    return { ok: true };
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (!error) {
    clearDevice();
    await logout().catch(() => {});
    return { ok: true };
  }
  // The function is not installed: delete what row-level security allows, then say what is left.
  const { error: rowError } = await supabase.from('user_state').delete().eq('user_id', user.uid);
  clearDevice();
  await logout().catch(() => {});
  return {
    ok: false,
    partial: !rowError,
    message: rowError
      ? `Your account could not be deleted just now. Your data on this device has been cleared. Please email ${LEGAL_EMAIL} from ${user.email || 'your account email'} and we will delete the account within 30 days.`
      : `Your library and settings have been deleted and this device is cleared. To finish removing your sign-in, email ${LEGAL_EMAIL} from ${user.email || 'your account email'}; it is done within 30 days.`,
  };
}
