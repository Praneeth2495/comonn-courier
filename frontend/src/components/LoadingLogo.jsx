// Embedded as a base64 data URI (see assets/logoIconData.js) rather than a
// plain file import — this is the universal "something is loading"
// indicator shown across the whole site, so it must render the instant
// the page's JS has run, with no extra network round-trip that could
// stall or fail on a poor connection.
import logoIcon from '../assets/logoIconData';

// Animated stand-in for the "Loading…" text — the actual brand mark
// (logo-icon.png), instead of leaving the page blank or showing plain text.
// variant="bounce" (default, "Design 3"): the logo hops up and down over a
// squashing shadow, like a parcel bouncing. variant="wipe" ("Design 1"):
// wiped in left-to-right on a loop, like it's being drawn. variant="ring"
// ("Design 2"): logo stays fully visible with a gentle breathing pulse,
// orbited by a rotating brand-color arc — a more classic spinner feel.
export default function LoadingLogo({ size = 56, label, style, variant = 'bounce' }) {
  return (
    <div className="loading-logo-wrap" style={style}>
      <div className={`loading-logo ${variant}`} style={{ width: size, height: size }}>
        <img src={logoIcon} width={size} height={size} alt={label || 'Loading'} />
      </div>
      {label && <p className="loading-logo-label">{label}</p>}
    </div>
  );
}
