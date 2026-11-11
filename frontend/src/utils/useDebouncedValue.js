import { useEffect, useState } from 'react';

// Returns `value`, but only after it's stopped changing for `delayMs` —
// the shared pattern for "search as you type" without firing a request on
// every keystroke. Every admin-panel search box used to require pressing
// Enter/clicking the magnifying glass; this lets the same box's existing
// fetch-on-change effect just watch the debounced value instead.
export function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
