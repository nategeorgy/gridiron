// The header's account control: a Sign in button when signed out, and an avatar
// dropdown when signed in — league profiles, saved views, and sign out.
//
// Renders nothing at all when the build has no Supabase project configured, so a
// local checkout without accounts looks exactly like the pre-M5 app rather than
// showing a button that cannot work.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLeagueProfiles, useSavedViews } from "../hooks/useAccount";
import { scoringLabel } from "../constants/scoring";

function GoogleMark() {
  // Google's four-colour G. Fixed brand colours by design — this one mark is
  // deliberately exempt from the theme tokens.
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}

function Avatar({ user, size = "h-7 w-7" }) {
  const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const name = user?.user_metadata?.full_name || user?.email || "?";
  if (url) {
    return <img src={url} alt="" className={`${size} rounded-full object-cover`} />;
  }
  return (
    <span
      className={`${size} grid place-items-center rounded-full bg-surface-2 text-xs font-bold text-accent`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function AccountMenu() {
  const { authConfigured, isSignedIn, ready, user, signIn, signOut } = useAuth();
  const { profiles, activeProfile, updateProfile, deleteProfile } = useLeagueProfiles();
  const { views, deleteView } = useSavedViews();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Accounts are not part of this deployment — show nothing rather than a dead button.
  if (!authConfigured) return null;

  if (!isSignedIn) {
    return (
      <button
        type="button"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await signIn();
          } catch {
            setBusy(false);
          }
        }}
        className="btn-ghost flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition hover:!text-accent"
      >
        <GoogleMark />
        <span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }

  const openProfile = async (profileId) => {
    // Activating a profile must also clear any scoring/league override sitting in
    // the URL, or the override would keep winning and the switch would look broken.
    await updateProfile({ profileId, activate: true });
    const params = new URLSearchParams(window.location.search);
    params.delete("scoring");
    params.delete("league");
    navigate(
      { pathname: window.location.pathname, search: params.toString() },
      { replace: true },
    );
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full transition hover:opacity-80"
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div role="menu" className="glass-popover absolute right-0 top-full z-30 mt-1.5 w-72 p-1.5">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <Avatar user={user} size="h-9 w-9" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">
                {user?.user_metadata?.full_name || "Signed in"}
              </div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          </div>

          <div className="my-1.5 border-t border-line" />

          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            League profiles
          </div>
          {profiles.length === 0 ? (
            <p className="px-3 pb-2 text-xs text-muted">
              None yet — create one from any board&apos;s scoring editor.
            </p>
          ) : (
            profiles.map((profile) => (
              <div
                key={profile.profile_id}
                className={`group flex items-center gap-1 rounded-lg pr-1.5 transition ${
                  profile.is_active ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openProfile(profile.profile_id)}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm font-semibold ${
                        profile.is_active ? "text-accent" : "text-fg"
                      }`}
                    >
                      {profile.name}
                    </span>
                    {profile.is_active && (
                      <span className="shrink-0 text-[10px] font-bold uppercase text-accent">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {scoringLabel(profile.scoring_spec)} · {profile.league_spec.split(":")[0]}-team
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${profile.name}`}
                  title="Delete profile"
                  onClick={() => deleteProfile(profile.profile_id).catch(() => {})}
                  className="shrink-0 px-1 text-faint opacity-0 transition hover:text-neg focus:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))
          )}

          {views.length > 0 && (
            <>
              <div className="my-1.5 border-t border-line" />
              <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                Saved views
              </div>
              {views.slice(0, 8).map((view) => (
                <div
                  key={view.view_id}
                  className="group flex items-center gap-1 rounded-lg pr-1.5 transition hover:bg-surface-2"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      navigate(`${view.path}${view.query ? `?${view.query}` : ""}`);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-fg"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    title="Delete saved view"
                    onClick={() => deleteView(view.view_id).catch(() => {})}
                    className="shrink-0 px-1 text-faint opacity-0 transition hover:text-neg focus:opacity-100 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="my-1.5 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
              setOpen(false);
              setBusy(false);
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
          >
            Sign out
          </button>
        </div>
      )}
      {activeProfile && <span className="sr-only">Active league: {activeProfile.name}</span>}
    </div>
  );
}
