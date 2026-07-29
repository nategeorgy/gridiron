// Light/dark theme state for the Liquid Glass UI. The active theme is stored on
// <html data-theme="..."> (also set pre-paint by an inline script in index.html)
// and persisted in localStorage. Defaults to dark. Two themes: "dark" (smoked
// graphite) and "light" ("clear").
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gridiron.theme";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(
    () => document.documentElement.getAttribute("data-theme") || readStored() || "dark",
  );

  // Keep <html> and localStorage in sync with state.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme: setThemeState, toggleTheme };
}
