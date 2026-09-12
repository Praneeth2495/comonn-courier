// Flat rectangular SVG flags (viewBox 0 0 60 40, a 3:2 rect) instead of the
// Unicode regional-indicator flag emoji — those render inconsistently across
// OS/fonts (e.g. as a generic waving-flag glyph instead of a flat rectangle
// when the platform has no compound flag glyph for that country), so a real
// vector shape is used everywhere a country flag needs to show up.
// N-pointed star polygon `points` string, centered at (cx,cy) — real
// pointed stars (not circles/dots) for every flag below that carries one.
function starPoints(cx, cy, outerR, innerR, points = 5, rotationDeg = -90) {
  const pts = [];
  const halfStep = 180 / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = ((rotationDeg + i * halfStep) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

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
  // 14 alternating stripes (7 red, 7 white — the real count, representing
  // the 13 states + federal government) and a blue canton covering exactly
  // the top half, with a crescent + 14-point star (rendered as a radiating
  // burst, which reads correctly at icon size — a literal 14-point star
  // polygon is indistinguishable from a circle this small).
  const stripeH = 40 / 14;
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      {Array.from({ length: 14 }, (_, i) => i % 2 === 0 && (
        <rect key={i} x={0} y={i * stripeH} width="60" height={stripeH} fill="#CC0001" />
      ))}
      <rect width="30" height="20" fill="#010066" />
      <circle cx="13" cy="10" r="6.5" fill="#FFCC00" />
      <circle cx="15.5" cy="10" r="5.5" fill="#010066" />
      <g transform="translate(22,10)" stroke="#FFCC00" strokeWidth="1.3" strokeLinecap="round">
        {Array.from({ length: 14 }, (_, i) => {
          const angle = (i * 360) / 14;
          const rad = (angle * Math.PI) / 180;
          return <line key={i} x1="0" y1="0" x2={(5 * Math.cos(rad)).toFixed(2)} y2={(5 * Math.sin(rad)).toFixed(2)} />;
        })}
      </g>
      <circle cx="22" cy="10" r="1.6" fill="#FFCC00" />
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
        const cx = 25 + 4.6 * Math.cos(rad);
        const cy = 10 + 4.6 * Math.sin(rad);
        return <polygon key={i} points={starPoints(cx, cy, 1.7, 0.68)} fill="#FFFFFF" />;
      })}
    </svg>
  );
}

function SouthAfricaFlag() {
  // The Y-shaped "pall" design, built the same way the AU/NZ/UK flags above
  // draw their diagonal crosses: a wide white stroke underneath (the
  // border) with a narrower colored stroke on top, just split into a
  // black hoist wedge and a green band beyond it, per the real flag.
  const apex = [13, 20 * (13 / 24)]; // point where the black wedge gives way to green, along the same diagonal
  const junction = [24, 20]; // where both arms meet the horizontal band
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <polygon points="0,0 60,0 60,20 0,20" fill="#DE3831" />
      <polygon points="0,40 60,40 60,20 0,20" fill="#002395" />
      <polyline points={`0,0 ${apex[0]},${apex[1].toFixed(2)} ${junction[0]},${junction[1]} 60,20`} fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinejoin="round" />
      <polyline points={`0,40 ${apex[0]},${40 - apex[1]} ${junction[0]},${junction[1]}`} fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinejoin="round" />
      <polyline points={`0,0 ${apex[0]},${apex[1].toFixed(2)}`} fill="none" stroke="#000000" strokeWidth="6" />
      <polyline points={`0,40 ${apex[0]},${40 - apex[1]}`} fill="none" stroke="#000000" strokeWidth="6" />
      <polyline points={`${apex[0]},${apex[1].toFixed(2)} ${junction[0]},${junction[1]} 60,20`} fill="none" stroke="#007A4D" strokeWidth="6" strokeLinejoin="round" />
      <polyline points={`${apex[0]},${40 - apex[1]} ${junction[0]},${junction[1]}`} fill="none" stroke="#007A4D" strokeWidth="6" />
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
  DE: GermanyFlag,
  MY: MalaysiaFlag,
  SG: SingaporeFlag,
  ZA: SouthAfricaFlag,
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
