import { useEffect, useState } from 'react';

// Returns `value`, but only after it's stopped changing for `delayMs` —
// the shared pattern for "search as you type" without firing a request on
// every keystroke. Every admin-panel search box used to require pressing
// Enter/clicking the magnifying glass; this lets the same box's existing
// fetch-on-change effect just watch the debounced value instead.
//
// Below `minLength` characters, the debounced value simply doesn't update
// (so no search fires) — except clearing back to empty, which resets it
// right away so the panel falls back to showing everything.
export function useDebouncedValue(value, delayMs = 350, minLength = 3) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value.length > 0 && value.length < minLength) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, minLength]);
  return debounced;
}
