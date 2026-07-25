import { useNavigate } from 'react-router-dom';

const STEPS = [
  ['quote', 'Quote'],
  ['details', 'Details'],
  ['payment', 'Payment'],
  ['labels', 'Print Labels'],
];

// interactive=false disables click-to-navigate on completed steps entirely
// (used on the Print Labels page — once a label is printed, the order is
// done, so jumping back to re-quote/re-enter details/re-pay doesn't make sense).
export default function Stepper({ activeKey, interactive = true }) {
  const navigate = useNavigate();
  const activeIdx = STEPS.findIndex((s) => s[0] === activeKey);
  return (
    <div className="stepper">
      {STEPS.map(([key, label], i) => {
        const done = i < activeIdx;
        const clickable = done && interactive;
        const cls = done ? 'done' : i === activeIdx ? 'active' : '';
        return (
          <div
            className={`step ${cls}${clickable ? ' clickable' : ''}`}
            key={key}
            onClick={clickable ? () => navigate(`/${key}`) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <div className="num">{done ? '✓' : i + 1}</div>
            <div className="label">{label}</div>
            {i < STEPS.length - 1 && <div className="track" />}
          </div>
        );
      })}
    </div>
  );
}
