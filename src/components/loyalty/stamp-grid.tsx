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
  // The customer collects `total` stamps; the reward is the extra (total + 1)th
  // slot that unlocks once every stamp is collected.
  const cellCount = total + 1;
  // Keep the grid balanced: fall back to 6 columns when 5 would leave a single
  // lonely reward on its own row.
  const columns = cellCount % 5 === 1 ? 6 : 5;
  const rewardReady = filled >= total;

  return (
    <div
      className="stamp-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {Array.from({ length: cellCount }, (_, i) => {
        const isReward = i === total;
        const isFilled = !isReward && i < filled;
        const isPending = !isReward && pending && i === filled;
        const isNext = !isReward && i === filled && !pending && !isFilled;

        let className = "stamp";
        if (isReward) className += " reward";
        if (isFilled || (isReward && rewardReady)) className += " filled";
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
