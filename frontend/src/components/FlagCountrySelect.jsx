import { useEffect, useRef, useState } from 'react';
import CountryFlag from './CountryFlag';

// Replaces a native <select> for a country-code field. Native <option>
// elements can't render an image/SVG, only text — which is why this exists
// at all: it lets the closed control *and* the open list show a real
// rectangular flag (see CountryFlag) instead of relying on the OS/browser's
// flag emoji glyph, which several platforms render as a generic wavy-flag
// icon rather than a flat rectangle.
export default function FlagCountrySelect({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function choose(code) {
    setOpen(false);
    onChange?.(code);
  }

  return (
    <div ref={ref} className="flag" style={{ position: 'relative', cursor: disabled ? 'default' : 'pointer' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%',
          background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <CountryFlag code={value} />
        <span>{value || ''}</span>
      </button>
      {open && !disabled && options?.length > 0 && (
        <div
          className="card"
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, padding: 4,
            minWidth: 120, maxHeight: 220, overflowY: 'auto', zIndex: 30,
          }}
        >
          {options.map((code) => (
            <button
              type="button"
              key={code}
              className="acct-menu-item"
              onClick={() => choose(code)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
            >
              <CountryFlag code={code} />
              <span>{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
