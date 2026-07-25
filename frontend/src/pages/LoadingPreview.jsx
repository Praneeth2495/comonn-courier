import LoadingLogo from '../components/LoadingLogo';

// Temporary side-by-side comparison of the two loading-animation designs —
// not linked from any nav, just directly navigable at /loading-preview so
// it can be reviewed and picked between without touching any real page's
// default. Safe to delete once a design is chosen.
export default function LoadingPreview() {
  return (
    <div className="wrap section-narrow" style={{ textAlign: 'center', paddingTop: 40, paddingBottom: 40 }}>
      <h1 className="h-lg" style={{ marginBottom: 8 }}>Loading animation — pick one</h1>
      <p className="lead" style={{ marginBottom: 30 }}>Design 1 is what's live everywhere today; Designs 2 and 3 are alternatives.</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 30, minWidth: 220 }}>
          <h3 className="h-md" style={{ marginBottom: 10 }}>Design 1 — Wipe</h3>
          <LoadingLogo variant="wipe" size={72} />
          <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 10 }}>Logo drawn in left-to-right, on a loop</p>
        </div>
        <div className="card" style={{ padding: 30, minWidth: 220 }}>
          <h3 className="h-md" style={{ marginBottom: 10 }}>Design 2 — Ring</h3>
          <LoadingLogo variant="ring" size={72} />
          <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 10 }}>Logo stays visible, orbited by a spinning arc</p>
        </div>
        <div className="card" style={{ padding: 30, minWidth: 220 }}>
          <h3 className="h-md" style={{ marginBottom: 10 }}>Design 3 — Bounce</h3>
          <LoadingLogo variant="bounce" size={72} />
          <p style={{ fontSize: 12.5, color: 'var(--slate-light)', marginTop: 10 }}>Logo hops over a squashing shadow</p>
        </div>
      </div>
    </div>
  );
}
