// Returns a debounced copy of a value that only updates after `delay` ms of
// no changes — used to throttle search-as-you-type requests.
import { useEffect, useState } from "react";

export function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
