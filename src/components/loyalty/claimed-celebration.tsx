"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { BottomSheet } from "./bottom-sheet";

interface ClaimedCelebrationProps {
  open: boolean;
  business: BusinessInfo;
  onStartAgain: () => void;
  /** When false, hide the "start again" messaging. */
  canRestart?: boolean;
  /** Optional cooldown message after claim. */
  cooldownMessage?: string | null;
}

export function ClaimedCelebration({
  open,
  business,
  onStartAgain,
  canRestart = true,
  cooldownMessage = null,
}: ClaimedCelebrationProps) {
  const rewardName = business.rewardName?.trim() || "reward";

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
          {canRestart
            ? cooldownMessage
              ? ` ${cooldownMessage}.`
              : " Your card’s been wiped clean — start collecting stamps again and your next reward is already on its way."
            : " You’ve completed this rewards program."}
        </p>

        <button type="button" className="done-btn" onClick={onStartAgain}>
          {canRestart ? "Back to card" : "Done"}
        </button>
      </div>
    </BottomSheet>
  );
}
