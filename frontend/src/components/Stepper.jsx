import { useNavigate } from 'react-router-dom';

const STEPS = [
  ['quote', 'Quote'],
  ['details', 'Details'],
  ['payment', 'Payment'],
  ['labels', 'Print Labels'],
];

export default function Stepper({ activeKey }) {
  const navigate = useNavigate();
  const activeIdx = STEPS.findIndex((s) => s[0] === activeKey);
  return (
    <div className="stepper">
      {STEPS.map(([key, label], i) => {
        const done = i < activeIdx;
        const cls = done ? 'done' : i === activeIdx ? 'active' : '';
        return (
          <div
            className={`step ${cls}${done ? ' clickable' : ''}`}
            key={key}
            onClick={done ? () => navigate(`/${key}`) : undefined}
            role={done ? 'button' : undefined}
            tabIndex={done ? 0 : undefined}
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
