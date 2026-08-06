// The sign-in / sign-up dialog. Two email-based methods, no third-party account
// required: a password, or a one-time link.
//
// Modes:
//   signin   — email + password (the default; works even when mail is slow)
//   signup   — name (optional) + email + password
//   magic    — email only, we send a one-time link
//   forgot   — email only, we send a reset link
//   sent     — "check your inbox", the terminal state of magic/forgot/signup
//   recovery — set a new password; entered only via a reset link, never chosen
//
// Nothing here is a wall: the dialog is dismissible from every state, and the app
// behind it works signed out. It exists to let someone opt *in* to persistence.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../hooks/useAuth";
import {
  MIN_PASSWORD_LENGTH,
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
} from "../services/supabase";

const COPY = {
  signin: { title: "Sign in", submit: "Sign in" },
  signup: { title: "Create an account", submit: "Create account" },
  magic: { title: "Sign in with a link", submit: "Email me a link" },
  forgot: { title: "Reset your password", submit: "Email me a reset link" },
  recovery: { title: "Set a new password", submit: "Save password" },
};

/** Supabase error messages are decent; this only softens the ones that aren't. */
function readableError(error) {
  const message = error?.message ?? "Something went wrong. Try again.";
  if (/failed to fetch|network|load failed/i.test(message)) {
    // The browser's wording for "offline, DNS failed, or the project is down" is
    // "Failed to fetch", which tells a user nothing about what to do.
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match. Try again, or use a sign-in link.";
  }
  if (/user already registered/i.test(message)) {
    return "That email already has an account — sign in instead.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}

function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input {...props} className="glass-input w-full px-3 py-2 text-sm" />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

function LinkButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-muted underline underline-offset-2 transition hover:text-accent"
    >
      {children}
    </button>
  );
}

export function AuthDialog({ open, mode: initialMode = "signin", onClose }) {
  const { isRecovering, endRecovery } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const dialogRef = useRef(null);

  // A reset link takes over whatever the dialog was showing — the user followed it
  // to do exactly one thing.
  const effectiveMode = isRecovering ? "recovery" : mode;
  const visible = open || isRecovering;

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setSentTo(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!visible) return null;

  function close() {
    // Leaving recovery without setting a password is allowed — the user is signed
    // in either way, and trapping them in a modal would be worse than an unchanged
    // password they can reset again.
    if (isRecovering) endRecovery();
    setPassword("");
    setError(null);
    onClose?.();
  }

  function switchTo(next) {
    setMode(next);
    setError(null);
    setPassword("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (effectiveMode === "signin") {
        await signInWithPassword(email, password);
        close();
      } else if (effectiveMode === "signup") {
        const { needsConfirmation } = await signUpWithPassword(email, password, name);
        if (needsConfirmation) setSentTo(email);
        else close();
      } else if (effectiveMode === "magic") {
        await sendMagicLink(email);
        setSentTo(email);
      } else if (effectiveMode === "forgot") {
        await sendPasswordReset(email);
        setSentTo(email);
      } else if (effectiveMode === "recovery") {
        await updatePassword(password);
        endRecovery();
        close();
      }
    } catch (caught) {
      setError(readableError(caught));
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = ["signin", "signup", "recovery"].includes(effectiveMode);
  const needsEmail = effectiveMode !== "recovery";
  const passwordTooShort =
    ["signup", "recovery"].includes(effectiveMode) &&
    password.length > 0 &&
    password.length < MIN_PASSWORD_LENGTH;

  const canSubmit =
    !busy &&
    (!needsEmail || email.trim().length > 3) &&
    (!needsPassword || password.length >= (effectiveMode === "signin" ? 1 : MIN_PASSWORD_LENGTH));

  // Portalled to <body> deliberately. The dialog is rendered from inside the sticky
  // header, and `.glass-header`'s backdrop-filter makes that header a containing
  // block for fixed-position descendants — so without this the overlay is positioned
  // against the header and gets clipped to it, instead of covering the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={COPY[effectiveMode].title}
        className="glass-card w-full max-w-sm p-5"
      >
        {sentTo ? (
          <>
            <h2 className="text-lg font-bold tracking-tight text-fg">Check your email</h2>
            <p className="mt-2 text-sm text-muted">
              We sent a link to <span className="font-semibold text-fg">{sentTo}</span>.
              Open it in this browser to finish.
            </p>
            <p className="mt-3 text-xs text-faint">
              Nothing after a minute or two? Check spam — and you can keep using
              GridironIQ without an account in the meantime.
            </p>
            <button
              type="button"
              onClick={close}
              className="btn-accent mt-4 w-full px-4 py-2 text-sm"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-fg">
                  {COPY[effectiveMode].title}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {effectiveMode === "recovery"
                    ? "Pick something you'll remember."
                    : "Saves your league profiles, watchlist, and views across devices."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="-mr-1 -mt-1 px-2 py-1 text-lg leading-none text-faint transition hover:text-fg"
              >
                ×
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3">
              {effectiveMode === "signup" && (
                <Field
                  label="Name (optional)"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}

              {needsEmail && (
                <Field
                  label="Email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}

              {needsPassword && (
                <Field
                  label={effectiveMode === "recovery" ? "New password" : "Password"}
                  type="password"
                  required
                  autoFocus={effectiveMode === "recovery"}
                  autoComplete={
                    effectiveMode === "signin" ? "current-password" : "new-password"
                  }
                  minLength={effectiveMode === "signin" ? undefined : MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  hint={
                    effectiveMode === "signin"
                      ? undefined
                      : `At least ${MIN_PASSWORD_LENGTH} characters.`
                  }
                />
              )}

              {passwordTooShort && (
                <p className="text-xs text-neg">
                  Passwords need at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
              {error && <p className="text-xs text-neg">{error}</p>}

              <button
                type="submit"
                disabled={!canSubmit}
                className="btn-accent w-full px-4 py-2 text-sm disabled:opacity-40"
              >
                {busy ? "Working…" : COPY[effectiveMode].submit}
              </button>
            </form>

            {effectiveMode !== "recovery" && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                {effectiveMode === "signin" && (
                  <>
                    <LinkButton onClick={() => switchTo("magic")}>
                      Email me a link instead
                    </LinkButton>
                    <LinkButton onClick={() => switchTo("forgot")}>
                      Forgot password?
                    </LinkButton>
                  </>
                )}
                {effectiveMode === "magic" && (
                  <LinkButton onClick={() => switchTo("signin")}>
                    Use a password instead
                  </LinkButton>
                )}
                {effectiveMode === "forgot" && (
                  <LinkButton onClick={() => switchTo("signin")}>
                    Back to sign in
                  </LinkButton>
                )}
                {effectiveMode === "signup" && (
                  <LinkButton onClick={() => switchTo("signin")}>
                    Already have an account? Sign in
                  </LinkButton>
                )}
                {effectiveMode !== "signup" && (
                  <LinkButton onClick={() => switchTo("signup")}>
                    Create an account
                  </LinkButton>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
