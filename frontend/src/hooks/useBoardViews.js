// Saved views for everyone (November 2026): the account's when signed in, this
// browser's when not.
//
// A view is a route plus its query string, so it needs no per-board knowledge (see
// SaveViewButton). Signed out, views live in localStorage, which keeps "Accounts are a
// persistence layer, never a gate" true for the one feature that used to need one.
// Signing in moves them to the account, once, and empties the local list, so a view
// saved before signing in is still there after; a name the account already uses gets
// " 2" rather than overwriting the account's view.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./useAuth";
import { useSavedViews } from "./useAccount";

const STORAGE_KEY = "secondlevel.savedViews";
const MAX_LOCAL_VIEWS = 100;

const listeners = new Set();
let localViews = readLocal();
let migrating = false;

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((view) => view && typeof view.name === "string" && typeof view.path === "string")
      : [];
  } catch {
    return [];
  }
}

function writeLocal(next) {
  localViews = next;
  try {
    if (next.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked (a private window): the views last for this visit only.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => localViews;

/** "a=1&b=2" whichever order the params were written in, so a view matches its URL. */
export function normalizeQuery(query) {
  const params = new URLSearchParams(String(query ?? "").replace(/^\?/, ""));
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/**
 * @returns views    [{ id, name, path, query }], newest last
 *          storage  "account" | "local"
 *          save     ({ name, path, query }) => Promise; an existing name is updated
 *          remove   (id) => Promise
 */
export function useBoardViews() {
  const { isSignedIn } = useAuth();
  const account = useSavedViews();
  const local = useSyncExternalStore(subscribe, snapshot, snapshot);

  // Move this browser's views into the account once signed in, after the account's own
  // list has loaded so a name clash can be seen.
  const { createView } = account;
  const accountViews = account.views;
  const accountLoading = account.isLoading;
  useEffect(() => {
    if (!isSignedIn || accountLoading || !local.length || migrating) return;
    migrating = true;
    (async () => {
      const taken = new Set(accountViews.map((view) => view.name));
      for (const view of local) {
        let name = view.name;
        for (let copy = 2; taken.has(name); copy += 1) name = `${view.name.slice(0, 56)} ${copy}`;
        taken.add(name);
        try {
          await createView({ name, path: view.path, query: view.query ?? "" });
        } catch {
          // One view the account refuses (a path it does not accept) should not hold
          // the rest back; it is dropped with the local list.
        }
      }
      writeLocal([]);
      migrating = false;
    })();
  }, [isSignedIn, accountLoading, local, accountViews, createView]);

  const views = isSignedIn
    ? accountViews.map((view) => ({ id: view.view_id, name: view.name, path: view.path, query: view.query ?? "" }))
    : local;

  const save = useCallback(
    async ({ name, path, query }) => {
      const trimmed = name.trim();
      if (isSignedIn) {
        const existing = accountViews.find((view) => view.name === trimmed);
        if (existing) return account.updateView({ viewId: existing.view_id, path, query });
        return account.createView({ name: trimmed, path, query });
      }
      const existing = localViews.find((view) => view.name === trimmed);
      if (existing) {
        writeLocal(localViews.map((view) => (view.id === existing.id ? { ...view, path, query } : view)));
      } else {
        const id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        writeLocal([...localViews, { id, name: trimmed, path, query }].slice(-MAX_LOCAL_VIEWS));
      }
      return undefined;
    },
    [isSignedIn, accountViews, account],
  );

  const remove = useCallback(
    async (id) => {
      if (isSignedIn) return account.deleteView(id);
      writeLocal(localViews.filter((view) => view.id !== id));
      return undefined;
    },
    [isSignedIn, account],
  );

  return { views, storage: isSignedIn ? "account" : "local", save, remove };
}
