import logoIcon from '../assets/logo-icon.png';

// Animated stand-in for the "Loading…" text — the actual brand mark
// (logo-icon.png), wiped in from left to right on a loop like it's being
// drawn, instead of leaving the page blank or showing plain text.
export default function LoadingLogo({ size = 56, label, style }) {
  return (
    <div className="loading-logo-wrap" style={style}>
      <div className="loading-logo" style={{ width: size, height: size }}>
        <img src={logoIcon} width={size} height={size} alt={label || 'Loading'} />
      </div>
      {label && <p className="loading-logo-label">{label}</p>}
    </div>
  );
}
