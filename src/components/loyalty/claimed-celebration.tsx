"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { cooldownRestartButtonCopy } from "@/lib/loyalty/rules";
import { BottomSheet } from "./bottom-sheet";

interface ClaimedCelebrationProps {
  open: boolean;
  business: BusinessInfo;
  onStartAgain: () => void;
  /** When false, hide the "start again" messaging. */
  canRestart?: boolean;
  /** Post-redeem stamp lock; drives live CTA countdown only. */
  cooldownUntil?: string | null;
}

export function ClaimedCelebration({
  open,
  business,
  onStartAgain,
  canRestart = true,
  cooldownUntil = null,
}: ClaimedCelebrationProps) {
  const rewardName = business.rewardName?.trim() || "reward";
  const [restartLabel, setRestartLabel] = useState(() =>
    cooldownRestartButtonCopy(cooldownUntil),
  );

  useEffect(() => {
    if (!open || !cooldownUntil) {
      setRestartLabel(cooldownRestartButtonCopy(cooldownUntil));
      return;
    }
    const tick = () => setRestartLabel(cooldownRestartButtonCopy(cooldownUntil));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, cooldownUntil]);

  const ctaLabel = !canRestart
    ? "Done"
    : restartLabel ?? "Back to card";

  return (
    <BottomSheet open={open} onClose={onStartAgain} labelledBy="claimed-title">
      <div className="claimed-celebrate">
        <div className="claimed-thumb-wrap">
          <span className="claimed-thumb-glow" aria-hidden="true" />
          <div className="claimed-thumb">
            <Image
              src={business.rewardImage}
              alt={rewardName}
              width={96}
              height={96}
              unoptimized
            />
          </div>
          <span className="claimed-thumb-badge" aria-hidden="true">
            <Sparkles size={16} strokeWidth={2.6} />
          </span>
        </div>

        <h3 id="claimed-title" className="claimed-title">
          Reward claimed! 🎉
        </h3>
        <p className="claimed-sub">
          Enjoy your <strong>{rewardName}</strong> from {business.name}!
          {canRestart && !restartLabel
            ? " Your card’s been wiped clean — start collecting stamps again and your next reward is already on its way."
            : !canRestart
              ? " You’ve completed this rewards program."
              : null}
        </p>

        <button type="button" className="done-btn" onClick={onStartAgain}>
          {ctaLabel}
        </button>
      </div>
    </BottomSheet>
  );
}
