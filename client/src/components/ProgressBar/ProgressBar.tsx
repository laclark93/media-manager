import './ProgressBar.css';

interface ProgressBarProps {
  have: number;
  total: number;
}

export function ProgressBar({ have, total }: ProgressBarProps) {
  const pct = total > 0 ? (have / total) * 100 : 0;
  let variant = 'good';
  if (pct < 50) variant = 'danger';
  else if (pct < 80) variant = 'warning';

  return (
    <div className="progress-bar">
      <div
        className={`progress-bar__fill progress-bar__fill--${variant}`}
        style={{ width: `${pct}%` }}
      />
      <span className="progress-bar__text">
        {have} / {total}
      </span>
    </div>
  );
}
