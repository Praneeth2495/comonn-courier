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
  // Southern Cross (4 seven-pointed stars + 1 smaller five-pointed one) and
  // the Commonwealth Star below the canton — real pointed stars, not the
  // plain circles this used to render as.
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
      <polygon points={starPoints(15, 30, 3.4, 1.5, 7)} fill="#FFFFFF" />
      <polygon points={starPoints(46, 9, 2.8, 1.25, 7)} fill="#FFFFFF" />
      <polygon points={starPoints(51, 19, 2.8, 1.25, 7)} fill="#FFFFFF" />
      <polygon points={starPoints(46, 29, 2.8, 1.25, 7)} fill="#FFFFFF" />
      <polygon points={starPoints(39, 24, 2.1, 0.95, 7)} fill="#FFFFFF" />
      <polygon points={starPoints(41.5, 14, 1.6, 0.7, 5)} fill="#FFFFFF" />
    </svg>
  );
}

// 11-point maple leaf silhouette (tiered lobes tapering to a stem) instead
// of the plain 8-point-star blob this used to render as.
const MAPLE_LEAF_PATH = 'M0,-16 L2,-11 L7,-13.5 L5.5,-7.5 L12,-6.5 L7.5,-2.5 L10.5,0.5 L4,1 L1.5,9.5 L-1.5,9.5 L-4,1 L-10.5,0.5 L-7.5,-2.5 L-12,-6.5 L-5.5,-7.5 L-7,-13.5 L-2,-11 Z';

function CanadaFlag() {
  return (
    <svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ display: 'block' }}>
      <rect width="60" height="40" fill="#FFFFFF" />
      <rect x="0" y="0" width="15" height="40" fill="#D52B1E" />
      <rect x="45" y="0" width="15" height="40" fill="#D52B1E" />
      <path transform="translate(30,20)" d={MAPLE_LEAF_PATH} fill="#D52B1E" />
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
      <polygon points={starPoints(46, 9, 3.2, 1.4, 5)} fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.6" />
      <polygon points={starPoints(52, 18, 2.7, 1.15, 5)} fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.6" />
      <polygon points={starPoints(46, 29, 3.2, 1.4, 5)} fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.6" />
      <polygon points={starPoints(40, 22, 2.5, 1.05, 5)} fill="#CF142B" stroke="#FFFFFF" strokeWidth="0.6" />
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

// A 5-row (6/5/6/5/6) star field — the real 9-and-8 alternating pattern
// simplified slightly, since 50 individual stars is more than this renders
// legibly at icon size, but a plain solid canton (no stars at all, as this
// used to be) reads as nothing like the US flag.
function usStarField() {
  const stars = [];
  for (let row = 0; row < 5; row++) {
    const cols = row % 2 === 0 ? 6 : 5;
    const cy = 2.4 + row * 4.2;
    for (let col = 0; col < cols; col++) {
      const cx = row % 2 === 0 ? 2.3 + col * 4.3 : 4.4 + col * 4.3;
      stars.push(<polygon key={`${row}-${col}`} points={starPoints(cx, cy, 1.15, 0.48)} fill="#FFFFFF" />);
    }
  }
  return stars;
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
      {usStarField()}
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
