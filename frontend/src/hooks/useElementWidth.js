import { useEffect, useRef, useState } from "react";

/**
 * An element's rendered width in pixels, kept current as it resizes, for a chart that
 * draws its viewBox at the size it is shown rather than scaling a fixed box. Returns
 * `[ref, width]`; the width is 0 until the element has been measured.
 */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
