// "Save view" — names the current route + query string so it can be reopened from
// the account menu.
//
// A view is already completely described by its URL, so this needs no per-board
// knowledge and every board added later is saveable the day it ships. It does read
// the board registry to reject a path the app cannot render, which is the check the
// backend deliberately leaves to the client (the backend enforces the narrower,
// stable rule: same-origin app routes only).
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSavedViews } from "../hooks/useAccount";
import { ALL_BOARDS, EXPLORE_ITEMS } from "../constants/boards";

const SAVEABLE_PATHS = new Set(
  [...ALL_BOARDS, ...EXPLORE_ITEMS].map((entry) => entry.path),
);

function errorMessage(error) {
  return (
    error?.response?.data?.detail?.[0]?.msg ||
    error?.response?.data?.detail ||
    "Could not save. Try again."
  );
}

export function SaveViewButton({ defaultName }) {
  const { isSignedIn } = useAuth();
  const { views, createView, updateView } = useSavedViews();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isSignedIn || !SAVEABLE_PATHS.has(location.pathname)) return null;

  const query = location.search.replace(/^\?/, "");

  const save = async () => {
    const trimmed = (name || defaultName || "").trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      // Saving under an existing name updates it rather than 409ing — "save" on a
      // name you already used reads as "update that one", not as an error.
      const existing = views.find((view) => view.name === trimmed);
      if (existing) {
        await updateView({ viewId: existing.view_id, path: location.pathname, query });
      } else {
        await createView({ name: trimmed, path: location.pathname, query });
      }
      setOpen(false);
      setName("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setName(defaultName ?? "");
          setError(null);
        }}
        className="btn-ghost px-3 py-2 text-sm font-medium transition hover:!text-accent"
      >
        {saved ? "Saved ✓" : "Save view"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        maxLength={60}
        placeholder="View name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") setOpen(false);
        }}
        className="glass-input w-44 px-2.5 py-2 text-sm"
      />
      <button
        type="button"
        disabled={busy || !(name || defaultName || "").trim()}
        onClick={save}
        className="btn-ghost px-3 py-2 text-sm font-medium transition hover:!text-accent"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-faint underline transition hover:text-muted"
      >
        cancel
      </button>
      {error && <span className="text-xs text-neg">{error}</span>}
    </div>
  );
}
