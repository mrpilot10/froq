"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { cooldownRestartButtonCopy } from "@/lib/loyalty/rules";
import { BottomSheet } from "./bottom-sheet";
import { GoogleIcon } from "./icons";
import { FollowUs } from "./social-row";

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

        {business.socialLinks.googleReviews ? (
          <div className="claimed-grow">
            <div className="thanks-section-label">Help us grow</div>
            <a
              className="review-btn"
              href={business.socialLinks.googleReviews}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="review-btn-icon">
                <GoogleIcon />
              </div>
              <div className="review-btn-text">
                <div className="review-btn-title">Leave a Google review</div>
                <div className="review-btn-sub">Takes less than a minute</div>
              </div>
              <div className="review-btn-arrow">
                <ChevronRight size={14} strokeWidth={2.4} color="#fff" />
              </div>
            </a>
          </div>
        ) : null}

        <button type="button" className="done-btn" onClick={onStartAgain}>
          {ctaLabel}
        </button>

        <FollowUs links={business.socialLinks} className="follow-us follow-us--footer" />
      </div>
    </BottomSheet>
  );
}
