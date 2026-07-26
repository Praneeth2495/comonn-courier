import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CountryFlag from './CountryFlag';

// Replaces a native <select> for a country-code field. Native <option>
// elements can't render an image/SVG, only text — which is why this exists
// at all: it lets the closed control *and* the open list show a real
// rectangular flag (see CountryFlag) instead of relying on the OS/browser's
// flag emoji glyph, which several platforms render as a generic wavy-flag
// icon rather than a flat rectangle.
//
// The option list is rendered into a portal (document.body) rather than as
// a normal child — this field always sits inside .input-group, which has
// overflow:hidden for its own rounded-corner divider look, so a normal
// absolutely-positioned child would be invisibly clipped there.
export default function FlagCountrySelect({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-flag-select-menu]')) {
        setOpen(false);
      }
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  function toggleOpen() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen((v) => !v);
  }

  function choose(code) {
    setOpen(false);
    onChange?.(code);
  }

  return (
    <div
      ref={ref}
      className="flag"
      // .flag's shared CSS fixes width:76px, sized for the disabled origin
      // box ("IN"). Some destination codes ("AU", "NZ"...) render a touch
      // wider than "IN" in this font, crowding the fixed-position chevron
      // background-image with no gap — a few extra px here fixes that for
      // every code rather than just the one that happened to be showing.
      style={{ position: 'relative', cursor: disabled ? 'default' : 'pointer', width: 88 }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: '100%',
          background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <CountryFlag code={value} width={22} height={15} />
        <span>{value || ''}</span>
      </button>
      {open && !disabled && options?.length > 0 && menuPos && createPortal(
        <div
          data-flag-select-menu
          className="card"
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, marginTop: 0, padding: 4,
            width: Math.max(menuPos.width, 92), maxHeight: 220, overflowY: 'auto', zIndex: 500,
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
              <CountryFlag code={code} width={22} height={15} />
              <span>{code}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
