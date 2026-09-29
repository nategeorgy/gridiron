// The active theme ("dark" | "light"), kept in step with <html data-theme>.
//
// useTheme owns the toggle, but its state lives in whichever component called it, so a
// chart elsewhere never hears about a switch. Charts that paint pixels themselves (the
// target heatmap draws a canvas) need to repaint when the theme changes, so this reads
// the attribute directly and subscribes to it. It also answers correctly while an image
// export briefly renders a chart in the other theme (utils/exportImage.js).
import { useSyncExternalStore } from "react";

function subscribe(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const snapshot = () => document.documentElement.getAttribute("data-theme") || "dark";

export function useThemeName() {
  return useSyncExternalStore(subscribe, snapshot, () => "dark");
}
