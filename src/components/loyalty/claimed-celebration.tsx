"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { BottomSheet } from "./bottom-sheet";

interface ClaimedCelebrationProps {
  open: boolean;
  business: BusinessInfo;
  onStartAgain: () => void;
}

export function ClaimedCelebration({ open, business, onStartAgain }: ClaimedCelebrationProps) {
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
          Enjoy your <strong>{rewardName}</strong> from {business.name}! Your card&apos;s been wiped
          clean — start collecting stamps again and your next reward is already on its way.
        </p>

        <button type="button" className="done-btn" onClick={onStartAgain}>
          Start a new card
        </button>
      </div>
    </BottomSheet>
  );
}
