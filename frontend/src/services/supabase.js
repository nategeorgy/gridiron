// The Supabase client, used *only* as a token issuer.
//
// It handles sign-up, sign-in, and session refresh; it never reads or writes
// application data. Everything else still goes through the FastAPI services layer,
// which verifies the token it hands out. Keeping that boundary means authorization
// lives in tested Python rather than in row-level-security policies.
//
// Two sign-in methods, both email-based:
//   * **Password** — the familiar path, and the only one that works when the user's
//     mail is slow or filtered.
//   * **Magic link** — no password to invent or remember. Also the account-recovery
//     path for anyone who signed up with a password and forgot it.
// Neither requires an account with any third party.
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
        // Magic-link, email-confirmation, and password-recovery links all come back
        // with the session in the URL hash; let the client consume it so the
        // fragment does not linger in the address bar.
        detectSessionInUrl: true,
      },
    })
  : null;

/** Minimum password length enforced in the UI. Supabase's own floor is lower (6). */
export const MIN_PASSWORD_LENGTH = 8;

function client() {
  if (!supabase) throw new Error("Accounts are not configured for this deployment.");
  return supabase;
}

/** Where an emailed link should return the user: the page they started from.
 *
 * Every distinct value here must be allowlisted in Supabase → Authentication → URL
 * Configuration (a `/**` wildcard per origin covers all of them), or the link lands
 * on the Site URL instead of where the user was.
 */
function returnUrl() {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

/** Sign in with an existing email + password. Throws on bad credentials. */
export async function signInWithPassword(email, password) {
  const { error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Create an account with an email + password.
 *
 * Returns `{ needsConfirmation }` — true when the project requires email
 * confirmation (Supabase's default), in which case no session exists yet and the
 * caller should tell the user to check their inbox.
 */
export async function signUpWithPassword(email, password, name) {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: returnUrl(),
      // Lands in the token's user_metadata, which app/auth.py mirrors into
      // users.display_name. Optional — the API falls back to the email local part.
      data: name?.trim() ? { full_name: name.trim() } : undefined,
    },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/** Email a one-time sign-in link. Creates the account if it does not exist yet. */
export async function sendMagicLink(email) {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: returnUrl(), shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Email a password-reset link. Returning here fires a PASSWORD_RECOVERY event. */
export async function sendPasswordReset(email) {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    redirectTo: returnUrl(),
  });
  if (error) throw error;
}

/** Set a new password for the currently-authenticated (or recovering) user. */
export async function updatePassword(password) {
  const { error } = await client().auth.updateUser({ password });
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
