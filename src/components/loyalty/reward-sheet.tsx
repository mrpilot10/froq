"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Gift, Lock } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { BottomSheet } from "./bottom-sheet";
import { ProgressBlock } from "./progress-block";

interface RewardSheetProps {
  open: boolean;
  business: BusinessInfo;
  filled: number;
  redeemCode: string;
  isRedeemed?: boolean;
  onClose: () => void;
  onClaim?: () => void;
}

export function RewardSheet({
  open,
  business,
  filled,
  redeemCode,
  isRedeemed = false,
  onClose,
  onClaim,
}: RewardSheetProps) {
  const { totalStamps } = business;
  const isUnlocked = filled >= totalStamps;
  const left = totalStamps - filled;
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isUnlocked || isRedeemed) return;

    let active = true;
    const payload = `https://froq.io/redeem?code=${redeemCode}`;

    QRCode.toDataURL(payload, {
      margin: 1,
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });

    return () => {
      active = false;
    };
  }, [open, isUnlocked, isRedeemed, redeemCode]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      {isUnlocked ? (
        <>
          <div className="thanks-head">
            <div className="thanks-badge thanks-badge--gold" aria-hidden="true">
              <Gift size={26} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" color="#fff" />
            </div>
            <h3 className="thanks-title">
              {isRedeemed ? "Already redeemed" : "Reward unlocked"}
            </h3>
            <p className="thanks-sub">
              {isRedeemed
                ? "This reward has already been used. Enjoy your next visit!"
                : "Show this code to staff to redeem your free reward."}
            </p>
          </div>

          {!isRedeemed && (
            <div className="reward-qr-card">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="reward-qr-img"
                  src={qrUrl}
                  alt="Reward redemption QR code"
                  width={220}
                  height={220}
                />
              ) : (
                <div className="reward-qr-skeleton" aria-hidden="true" />
              )}
              <div className="reward-qr-code">{redeemCode}</div>
            </div>
          )}

          <button
            type="button"
            className="done-btn"
            onClick={() => {
              if (!isRedeemed && onClaim) onClaim();
              else onClose();
            }}
          >
            {isRedeemed ? "Close" : "Done"}
          </button>
        </>
      ) : (
        <>
          <div className="thanks-head">
            <div className="thanks-badge" aria-hidden="true">
              <Lock size={24} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" color="#fff" />
            </div>
            <h3 className="thanks-title">Almost there!</h3>
            <p className="thanks-sub">
              Keep collecting stamps to unlock your {business.rewardName.toLowerCase()}.
            </p>
          </div>

          <div className="reward-countdown">
            <span className="reward-countdown-num">{left}</span>
            <span className="reward-countdown-label">
              {left === 1 ? "stamp to be collected" : "stamps to be collected"}
            </span>
          </div>

          <ProgressBlock
            label={business.rewardName}
            countText={`${filled} / ${totalStamps}`}
            filled={filled}
            total={totalStamps}
          />

          <button type="button" className="done-btn" onClick={onClose}>
            Got it
          </button>
        </>
      )}
    </BottomSheet>
  );
}
