interface ProgressBlockProps {
  label: string;
  countText: string;
  filled: number;
  total: number;
  showPending?: boolean;
  className?: string;
}

export function ProgressBlock({
  label,
  countText,
  filled,
  total,
  showPending = false,
  className,
}: ProgressBlockProps) {
  const pct = Math.min(100, (filled / total) * 100);

  return (
    <div className={`progress-block${className ? ` ${className}` : ""}`}>
      <div className="progress-block-top">
        <span className="progress-block-label">{label}</span>
        <span className="progress-block-count">{countText}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }}>
          <div className="progress-knob" />
        </div>
      </div>
      <div className="progress-stamps-row">
        {Array.from({ length: total }, (_, i) => {
          let dotClass = "progress-stamp-dot";
          if (i < filled) dotClass += " on";
          else if (showPending && i === filled) dotClass += " pending";
          return <div key={i} className={dotClass} />;
        })}
      </div>
    </div>
  );
}
