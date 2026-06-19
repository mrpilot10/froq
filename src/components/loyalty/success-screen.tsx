"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Clock } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { BottomSheet } from "./bottom-sheet";
import { GoogleIcon } from "./icons";
import { ProgressBlock } from "./progress-block";
import { SocialRow } from "./social-row";

const LOADING_DELAY_MS = 1400;

interface SuccessScreenProps {
  open: boolean;
  business: BusinessInfo;
  filled: number;
  onBackToCard: () => void;
}

export function SuccessScreen({
  open,
  business,
  filled,
  onBackToCard,
}: SuccessScreenProps) {
  const { totalStamps } = business;
  const left = totalStamps - filled;
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), LOADING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onBackToCard}>
      {isLoading ? (
        <div className="thanks-loading" aria-live="polite" aria-busy="true">
          <div className="processing-spinner" aria-hidden="true" />
          <p className="processing-title">Recording your visit</p>
          <p className="processing-sub">Just a moment…</p>
        </div>
      ) : (
        <>
          <div className="thanks-head">
            <div className="thanks-badge" aria-hidden="true">
              <Clock size={26} strokeWidth={2.2} color="#fff" />
            </div>
            <h3 className="thanks-title">Thanks for visiting!</h3>
            <p className="thanks-sub">
              Your stamp request has been sent. It&apos;ll be added once the store
              approves your visit.
            </p>
            <div className="success-status" aria-live="polite">
              <span className="success-status-dot" aria-hidden="true" />
              Waiting for approval
            </div>
          </div>

          <ProgressBlock
            label={business.rewardName}
            countText={left <= 0 ? "Ready to redeem" : `${left} stamp${left === 1 ? "" : "s"} to go`}
            filled={filled}
            total={totalStamps}
            showPending
          />

          <div className="thanks-divider" />

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

          <SocialRow links={business.socialLinks} className="thanks-social-row" />

          <button type="button" className="done-btn" onClick={onBackToCard}>
            Done
          </button>
        </>
      )}
    </BottomSheet>
  );
}
