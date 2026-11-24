import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CountryFlag from './CountryFlag';

// Phone dial-code equivalent of FlagCountrySelect — same reasoning: a real
// rectangular SVG flag instead of the Unicode flag emoji, which several
// mobile platforms render as a generic wavy-flag glyph (not a flat
// rectangle) rather than failing to render at all, so it's easy to miss
// that it's even broken until you compare it side by side with a working
// one. Shows the dial code ("+91"), not the bare country code
// FlagCountrySelect shows — this field is about which number format is
// expected, not which country. `options` is the full PHONE_OPTIONS array
// ({ code, dial, flag, digits }), not bare code strings.
export default function PhoneDialSelect({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const ref = useRef(null);

  const current = options.find((o) => o.code === value);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-flag-select-menu]')) {
        setOpen(false);
      }
    }
    function onScrollOrResize(e) {
      if (e?.target?.closest?.('[data-flag-select-menu]')) return;
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
    <div ref={ref} className="flag" style={{ position: 'relative', cursor: disabled ? 'default' : 'pointer' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', height: '100%', background: 'none', border: 'none', padding: '0 26px 0 10px',
          font: 'inherit', color: 'inherit', cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <CountryFlag code={value} width={20} height={14} />
        <span>{current?.dial || ''}</span>
      </button>
      {open && !disabled && options?.length > 0 && menuPos && createPortal(
        <div
          data-flag-select-menu
          className="card"
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, marginTop: 0, padding: 4,
            width: Math.max(menuPos.width, 140), maxHeight: 260, overflowY: 'auto', zIndex: 500,
          }}
        >
          {options.map((o) => (
            <button
              type="button"
              key={o.code}
              className="acct-menu-item"
              onClick={() => choose(o.code)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
            >
              <CountryFlag code={o.code} width={20} height={14} />
              <span>{o.code} {o.dial}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
