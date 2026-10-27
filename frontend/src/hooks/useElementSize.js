import { useEffect, useRef, useState } from "react";

/**
 * An element's rendered width and height in pixels, kept current as it resizes: the
 * two-dimensional `useElementWidth`, for content laid out to fill the box it was given
 * (`FillBox` on the home page). Returns `[ref, { width, height }]`, zeros until measured.
 */
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const next = { width: Math.round(box.width), height: Math.round(box.height) };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
