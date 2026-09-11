// Flat rectangular SVG flags (viewBox 0 0 60 40, a 3:2 rect) instead of the
// Unicode regional-indicator flag emoji — those render inconsistently across
// OS/fonts (e.g. as a generic waving-flag glyph instead of a flat rectangle
// when the platform has no compound flag glyph for that country), so a real
// vector shape is used everywhere a country flag needs to show up.
function IndiaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FF9933" />
      <rect y="13.3" width="60" height="13.3" fill="#FFFFFF" />
      <rect y="26.6" width="60" height="13.4" fill="#138808" />
      <circle cx="30" cy="20" r="5.6" fill="none" stroke="#00008B" strokeWidth="0.9" />
      <circle cx="30" cy="20" r="1.1" fill="#00008B" />
    </svg>
  );
}

function AustraliaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#00247D" />
      <rect x="0" y="0" width="30" height="20" fill="#00247D" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <rect x="12" y="0" width="6" height="20" fill="#FFFFFF" />
      <rect x="0" y="7" width="30" height="6" fill="#FFFFFF" />
      <rect x="13.5" y="0" width="3" height="20" fill="#CF142B" />
      <rect x="0" y="8.5" width="30" height="3" fill="#CF142B" />
      <circle cx="15" cy="29" r="3" fill="#FFFFFF" />
      <circle cx="46" cy="9" r="2.6" fill="#FFFFFF" />
      <circle cx="51" cy="18" r="2.6" fill="#FFFFFF" />
      <circle cx="46" cy="29" r="2.6" fill="#FFFFFF" />
      <circle cx="39" cy="24" r="2" fill="#FFFFFF" />
      <circle cx="41" cy="14" r="1.8" fill="#FFFFFF" />
    </svg>
  );
}

function CanadaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect x="0" y="0" width="15" height="40" fill="#D52B1E" />
      <rect x="45" y="0" width="15" height="40" fill="#D52B1E" />
      <path d="M30 8 L32 15 L38 13 L34 19 L39 22 L33 23 L34 30 L30 26 L26 30 L27 23 L21 22 L26 19 L22 13 L28 15 Z" fill="#D52B1E" />
    </svg>
  );
}

function NewZealandFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#00247D" />
      <rect x="0" y="0" width="30" height="20" fill="#00247D" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="4" />
      <line x1="0" y1="0" x2="30" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <line x1="30" y1="0" x2="0" y2="20" stroke="#CF142B" strokeWidth="1.6" />
      <rect x="12" y="0" width="6" height="20" fill="#FFFFFF" />
      <rect x="0" y="7" width="30" height="6" fill="#FFFFFF" />
      <rect x="13.5" y="0" width="3" height="20" fill="#CF142B" />
      <rect x="0" y="8.5" width="30" height="3" fill="#CF142B" />
      <circle cx="46" cy="9" r="2.8" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="52" cy="17" r="2.4" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="46" cy="27" r="2.8" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
      <circle cx="41" cy="20" r="2.2" fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.8" />
    </svg>
  );
}

function UKFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#00247D" />
      <line x1="0" y1="0" x2="60" y2="40" stroke="#FFFFFF" strokeWidth="7" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#FFFFFF" strokeWidth="7" />
      <line x1="0" y1="0" x2="60" y2="40" stroke="#CF142B" strokeWidth="3" />
      <line x1="60" y1="0" x2="0" y2="40" stroke="#CF142B" strokeWidth="3" />
      <rect x="24" y="0" width="12" height="40" fill="#FFFFFF" />
      <rect x="0" y="14" width="60" height="12" fill="#FFFFFF" />
      <rect x="27" y="0" width="6" height="40" fill="#CF142B" />
      <rect x="0" y="17" width="60" height="6" fill="#CF142B" />
    </svg>
  );
}

function USAFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect x="0" y="0" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="6.15" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="12.3" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="18.46" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="24.6" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="30.77" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="36.9" width="60" height="3.08" fill="#B22234" />
      <rect x="0" y="0" width="26" height="21.5" fill="#3C3B6E" />
    </svg>
  );
}

function GermanyFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#000000" />
      <rect y="13.33" width="60" height="13.34" fill="#DD0000" />
      <rect y="26.67" width="60" height="13.33" fill="#FFCE00" />
    </svg>
  );
}

function MalaysiaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={0} y={i * 5.71} width="60" height="2.86" fill="#CC0001" />
      ))}
      <rect width="34" height="20" fill="#010066" />
      <circle cx="17" cy="10" r="7" fill="#FFCC00" />
      <circle cx="19.5" cy="10" r="6" fill="#010066" />
      <path d="M24 10 L28 7.5 L26.5 10 L28 12.5 Z" fill="#FFCC00" />
    </svg>
  );
}

function SingaporeFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect width="60" height="20" fill="#EF3340" />
      <circle cx="14" cy="10" r="6.5" fill="#FFFFFF" />
      <circle cx="16.5" cy="10" r="5.5" fill="#EF3340" />
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = -90 + i * 72;
        const rad = (angle * Math.PI) / 180;
        const cx = 24 + 4.2 * Math.cos(rad);
        const cy = 10 + 4.2 * Math.sin(rad);
        return <circle key={i} cx={cx} cy={cy} r="1.3" fill="#FFFFFF" />;
      })}
    </svg>
  );
}

function SouthAfricaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect width="60" height="17.5" fill="#DE3831" />
      <rect y="22.5" width="60" height="17.5" fill="#002395" />
      <path d="M0 17.5 L24 20 L0 22.5 Z" fill="#FFFFFF" />
      <path d="M0 15.5 L27 20 L0 24.5 Z" fill="#000000" />
      <path d="M0 12.5 L30 20 L0 27.5 Z" fill="#007A4D" />
      <path d="M0 12.5 L30 20 L0 27.5 L0 12.5" fill="none" />
      <path d="M0 12 L31 20 L60 20 L60 40 L27 40 L0 27" fill="none" stroke="none" />
    </svg>
  );
}

function GenericFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="var(--slate-light, #d8dde5)" />
    </svg>
  );
}

const FLAGS_BY_CODE = {
  IN: IndiaFlag,
  AU: AustraliaFlag,
  CA: CanadaFlag,
  NZ: NewZealandFlag,
  GB: UKFlag,
  US: USAFlag,
};

export default function CountryFlag({ code, width = 20, height = 14, style, className }) {
  const Flag = FLAGS_BY_CODE[(code || '').toUpperCase()] || GenericFlag;
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: 2,
        overflow: 'hidden',
        flex: 'none',
        lineHeight: 0,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
        ...style,
      }}
    >
      <Flag />
    </span>
  );
}
