// Auth state for the whole app: who is signed in, and how to change that.
//
// The Supabase client owns the session (it persists and refreshes it); this context
// just mirrors it into React and clears cached account queries on sign-out so one
// user's saved state can never flash in front of the next.
//
// Signed-out is a first-class state, not an error — nothing in the product is gated
// behind an account.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  authConfigured,
  signOut as supabaseSignOut,
  supabase,
} from "../services/supabase";

const AuthContext = createContext({
  user: null,
  isSignedIn: false,
  // False until the initial session lookup resolves, so the header can avoid
  // flashing "Sign in" at someone who is already signed in.
  ready: !authConfigured,
  authConfigured,
  // True after arriving on a password-reset link, until a new password is set.
  isRecovering: false,
  endRecovery: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!authConfigured);
  const [isRecovering, setIsRecovering] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
      // Following a reset link signs the user in *and* fires this event. The session
      // is real, so nothing is gated — but until they actually set a new password the
      // UI should be asking them to, not behaving like a normal sign-in.
      if (event === "PASSWORD_RECOVERY") setIsRecovering(true);
      if (event === "SIGNED_OUT") setIsRecovering(false);
      // Account queries are per-user by definition. Dropping them on any auth
      // change keeps a previous user's profiles/favorites out of the next one's UI.
      queryClient.removeQueries({ queryKey: ["account"] });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user,
      isSignedIn: Boolean(user),
      ready,
      authConfigured,
      isRecovering,
      endRecovery: () => setIsRecovering(false),
      signOut: supabaseSignOut,
    }),
    [user, ready, isRecovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
