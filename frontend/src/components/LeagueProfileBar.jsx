// The account layer on top of the scoring/league editors: save the current setup as
// a named profile, update the active one, or drop back to it.
//
// Renders nothing when signed out — accounts are persistence, not a gate, and a
// signed-out visitor should not see controls that only nag them to sign up.
//
// Editing scoring never silently rewrites a saved profile. An edit is an override
// that lives in the URL; committing it to the profile is an explicit act. Otherwise
// opening a shared link would quietly overwrite the league you play in.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useLeagueProfiles } from "../hooks/useAccount";
import { useLeague } from "../hooks/useLeague";
import { useScoring } from "../hooks/useScoring";

function errorMessage(error) {
  return (
    error?.response?.data?.detail?.[0]?.msg ||
    error?.response?.data?.detail ||
    "Could not save. Try again."
  );
}

export function LeagueProfileBar() {
  const { isSignedIn } = useAuth();
  const { profiles, activeProfile, createProfile, updateProfile } = useLeagueProfiles();
  const [scoring] = useScoring();
  const [league] = useLeague();
  const [, setSearchParams] = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!isSignedIn) return null;

  const matchesActive =
    activeProfile &&
    activeProfile.scoring_spec === scoring &&
    activeProfile.league_spec === league;

  const clearOverrides = () =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("scoring");
        params.delete("league");
        return params;
      },
      { replace: true },
    );

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAsNew = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = await run(() =>
      createProfile({
        name: trimmed,
        scoring_spec: scoring,
        league_spec: league,
        activate: true,
      }),
    );
    if (ok) {
      setNaming(false);
      setName("");
      // The new profile now supplies these values, so the URL copies are redundant.
      clearOverrides();
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
      {activeProfile ? (
        <span className="text-muted">
          Profile:{" "}
          <span className="font-semibold text-accent">{activeProfile.name}</span>
          {!matchesActive && <span className="ml-1 text-faint">· modified</span>}
        </span>
      ) : (
        <span className="text-muted">No league profile saved yet.</span>
      )}

      {!naming && (
        <>
          {activeProfile && !matchesActive && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    updateProfile({
                      profileId: activeProfile.profile_id,
                      scoring_spec: scoring,
                      league_spec: league,
                    }),
                  ).then((ok) => ok && clearOverrides())
                }
                className="btn-ghost px-2.5 py-1 font-medium transition hover:!text-accent"
              >
                Update &ldquo;{activeProfile.name}&rdquo;
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clearOverrides}
                className="text-faint underline transition hover:text-muted"
              >
                revert
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setNaming(true);
              setError(null);
            }}
            className="btn-ghost px-2.5 py-1 font-medium transition hover:!text-accent"
          >
            {profiles.length === 0 ? "Save as league profile" : "Save as new"}
          </button>
        </>
      )}

      {naming && (
        <span className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            maxLength={60}
            placeholder="Profile name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveAsNew();
              if (event.key === "Escape") {
                setNaming(false);
                setError(null);
              }
            }}
            className="glass-input w-40 px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={saveAsNew}
            className="btn-ghost px-2.5 py-1 font-medium transition hover:!text-accent"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setError(null);
            }}
            className="text-faint underline transition hover:text-muted"
          >
            cancel
          </button>
        </span>
      )}

      {error && <span className="text-neg">{error}</span>}
    </div>
  );
}
