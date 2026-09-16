// The header's account control: a Sign in button when signed out, and an avatar
// dropdown when signed in — saved views and sign out.
//
// It used to lead with league profiles. Profiles were cut before launch along with
// custom scoring, since a "profile" whose only contents were one of four presets is
// a name for something that already fits in a dropdown.
//
// Renders nothing at all when the build has no Supabase project configured, so a
// local checkout without accounts looks exactly like the pre-M5 app rather than
// showing a button that cannot work.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthDialog } from "./AuthDialog";
import { useAuth } from "../hooks/useAuth";
import { useSavedViews } from "../hooks/useAccount";

function Avatar({ user, size = "h-7 w-7" }) {
  // Email accounts have no avatar, so the initial is the normal case, not a fallback.
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

/** The display name for an email account, which may have no name set. */
function displayName(user) {
  return user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Signed in";
}

export function AccountMenu() {
  const { authConfigured, isSignedIn, ready, user, signOut } = useAuth();
  const { views, deleteView } = useSavedViews();
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState(null);
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
      <>
        <button
          type="button"
          disabled={!ready}
          onClick={() => setAuthMode("signin")}
          className="btn-ghost px-3 py-1.5 text-sm font-medium transition hover:!text-accent"
        >
          Sign in
        </button>
        {/* Also renders on its own when a password-reset link brings someone back. */}
        <AuthDialog
          open={authMode !== null}
          mode={authMode ?? "signin"}
          onClose={() => setAuthMode(null)}
        />
      </>
    );
  }

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
                {displayName(user)}
              </div>
              <div className="truncate text-xs text-muted">{user?.email}</div>
            </div>
          </div>

          <div className="my-1.5 border-t border-line" />

          {views.length > 0 && (
            <>
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
              <div className="my-1.5 border-t border-line" />
            </>
          )}

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
      {/* Mounted here too: following a password-reset link *signs you in*, so the
          recovery form has to be reachable from the signed-in branch as well. */}
      <AuthDialog open={false} onClose={() => {}} />
    </div>
  );
}
