// Animated stand-in for the "Loading…" text — draws the brand checkmark
// (stroke-dasharray/dashoffset) in a loop instead of leaving the page
// blank or showing plain text while data is fetched.
export default function LoadingLogo({ size = 56, label, style }) {
  return (
    <div className="loading-logo-wrap" style={style}>
      <svg className="loading-logo" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label || 'Loading'}>
        <circle className="loading-logo-circle" cx="50" cy="50" r="46" fill="#F0871E" />
        <polyline className="loading-logo-tick" points="28,52 43,68 74,30" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label && <p className="loading-logo-label">{label}</p>}
    </div>
  );
}
