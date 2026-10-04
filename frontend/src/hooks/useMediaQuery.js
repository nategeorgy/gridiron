// Whether a media query matches, kept in step as the window resizes.
//
// For the few places a phone needs a different *structure* rather than different
// styles: a chart drawn in a narrower box, for one. Anything CSS can do stays in CSS.
import { useEffect, useState } from "react";

export function useMediaQuery(query) {
  const read = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches);
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Below Tailwind's `sm` (640px): a phone held upright. */
export const usePhone = () => useMediaQuery("(max-width: 639px)");
