import { useEffect } from 'react';

// Closes an open menu/dropdown on any click outside `ref`'s element — the
// same 4-line mousedown-listener pattern was repeated identically across
// every dropdown in Layout.jsx (AccountMenu, GuestMenu, MobileNavMenu).
export function useClickOutside(ref, onOutside) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
