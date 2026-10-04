// Light/dark theme state for the Liquid Glass UI. The active theme is stored on
// <html data-theme="..."> (also set pre-paint by an inline script in index.html)
// and persisted in localStorage. Defaults to dark. Two themes: "dark" (smoked
// graphite) and "light" ("clear").
//
// The attribute is the state: `theme` is read from it (useThemeName), and setting the
// theme writes it. It used to be component state mirrored onto the attribute, which
// meant two toggles kept two copies, and the header has two now (the desktop button
// and the phone menu's switch): flipping one left the other showing the old theme.
import { useCallback } from "react";
import { useThemeName } from "./useThemeName";

const STORAGE_KEY = "gridiron.theme";

// Safari's toolbar tint (<meta name="theme-color">), per theme. Mirrored in index.html,
// which sets it before first paint.
const TOOLBAR = { dark: "#0d0f11", light: "#eef1f6" };

const current = () => document.documentElement.getAttribute("data-theme") || "dark";

export function useTheme() {
  const theme = useThemeName();

  /** Takes a theme, or an updater from the current one. */
  const setTheme = useCallback((next) => {
    const value = typeof next === "function" ? next(current()) : next;
    document.documentElement.setAttribute("data-theme", value);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", TOOLBAR[value] ?? TOOLBAR.dark);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
