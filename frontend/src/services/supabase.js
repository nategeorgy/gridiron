// The Supabase client, used *only* as a token issuer.
//
// It runs the Google OAuth flow and holds the session; it never reads or writes
// application data. Everything else still goes through the FastAPI services layer,
// which verifies the token it hands out. Keeping that boundary means authorization
// lives in tested Python rather than in row-level-security policies.
//
// Both env vars are optional: with them unset the app runs exactly as it did before
// M5, minus the sign-in button. Accounts are a persistence layer, never a gate.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Whether this build was configured with a Supabase project. */
export const authConfigured = Boolean(url && anonKey);

export const supabase = authConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth redirect comes back with the session in the URL hash; let the
        // client consume it so the fragment does not linger in the address bar.
        detectSessionInUrl: true,
      },
    })
  : null;

/** Start the Google OAuth flow, returning to the page the user was on. */
export async function signInWithGoogle() {
  if (!supabase) throw new Error("Accounts are not configured for this deployment.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) throw error;
}

/** End the session. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** The current access token, or null when signed out. */
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
