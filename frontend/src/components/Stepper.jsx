const STEPS = [
  ['quote', 'Quote'],
  ['details', 'Details'],
  ['payment', 'Payment'],
  ['labels', 'Print Labels'],
];

export default function Stepper({ activeKey }) {
  const activeIdx = STEPS.findIndex((s) => s[0] === activeKey);
  return (
    <div className="stepper">
      {STEPS.map(([key, label], i) => {
        const cls = i < activeIdx ? 'done' : i === activeIdx ? 'active' : '';
        return (
          <div className={`step ${cls}`} key={key}>
            <div className="num">{i < activeIdx ? '✓' : i + 1}</div>
            <div className="label">{label}</div>
            {i < STEPS.length - 1 && <div className="track" />}
          </div>
        );
      })}
    </div>
  );
}
