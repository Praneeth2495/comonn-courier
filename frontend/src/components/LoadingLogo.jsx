import logoIcon from '../assets/logo-icon.png';

// Animated stand-in for the "Loading…" text — the actual brand mark
// (logo-icon.png), instead of leaving the page blank or showing plain text.
// variant="wipe" (default, "Design 1"): wiped in left-to-right on a loop,
// like it's being drawn. variant="ring" ("Design 2"): logo stays fully
// visible with a gentle breathing pulse, orbited by a rotating brand-color
// arc — a more classic spinner feel.
export default function LoadingLogo({ size = 56, label, style, variant = 'wipe' }) {
  return (
    <div className="loading-logo-wrap" style={style}>
      <div className={`loading-logo ${variant}`} style={{ width: size, height: size }}>
        <img src={logoIcon} width={size} height={size} alt={label || 'Loading'} />
      </div>
      {label && <p className="loading-logo-label">{label}</p>}
    </div>
  );
}
