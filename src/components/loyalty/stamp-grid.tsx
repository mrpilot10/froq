import { Clock, Gift, Lock, Unlock } from "lucide-react";

interface StampGridProps {
  total: number;
  filled: number;
  pending?: boolean;
  onRewardClick?: () => void;
}

function StampIcon({
  isReward,
  isFilled,
  isPending,
}: {
  isReward: boolean;
  isFilled: boolean;
  isPending: boolean;
}) {
  const boldIconProps = {
    size: 18,
    strokeWidth: 2.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const iconProps = {
    size: 17,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (isReward) {
    return <Gift {...boldIconProps} />;
  }

  if (isPending) {
    return <Clock {...iconProps} />;
  }

  if (isFilled) {
    return <Unlock {...boldIconProps} />;
  }

  return <Lock {...boldIconProps} />;
}

export function StampGrid({
  total,
  filled,
  pending = false,
  onRewardClick,
}: StampGridProps) {
  return (
    <div className="stamp-grid">
      {Array.from({ length: total }, (_, i) => {
        const isReward = i === total - 1;
        const isFilled = i < filled;
        const isPending = pending && i === filled;
        const isNext = i === filled && !pending && !isFilled;

        let className = "stamp";
        if (isReward) className += " reward";
        if (isFilled) className += " filled";
        if (isPending) className += " pending";
        if (isNext) className += " next";

        const icon = (
          <StampIcon
            isReward={isReward}
            isFilled={isFilled}
            isPending={isPending}
          />
        );

        if (isReward && onRewardClick) {
          return (
            <button
              key={i}
              type="button"
              className={`${className} stamp-btn`}
              onClick={onRewardClick}
              aria-label="View your reward"
            >
              {icon}
            </button>
          );
        }

        return (
          <div key={i} className={className}>
            {icon}
          </div>
        );
      })}
    </div>
  );
}

export function StampProgressLabel({
  filled,
  total,
}: {
  filled: number;
  total: number;
}) {
  if (filled >= total) {
    return <span className="pass-bottom-value celebrate">Reward ready 🎉</span>;
  }

  return (
    <span className="pass-bottom-value">
      {filled} / {total} Collected
    </span>
  );
}
