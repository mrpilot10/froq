"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Gift, Lock } from "lucide-react";
import {
  formatCooldownClock,
  isCooldownActive,
} from "@/lib/loyalty/rules";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { BottomSheet } from "./bottom-sheet";
import { ProgressBlock } from "./progress-block";

interface RewardSheetProps {
  open: boolean;
  business: BusinessInfo;
  filled: number;
  redeemCode: string;
  isRedeemed?: boolean;
  /** ISO timestamp — when set in the future, QR stays blurred until then. */
  cooldownUntil?: string | null;
  /** Keep QR locked even after the countdown hits zero (waiting for cron unlock). */
  forceLocked?: boolean;
  onClose: () => void;
  onClaim?: () => void;
}

export function RewardSheet({
  open,
  business,
  filled,
  redeemCode,
  isRedeemed = false,
  cooldownUntil = null,
  forceLocked = false,
  onClose,
  onClaim,
}: RewardSheetProps) {
  const { totalStamps } = business;
  const isUnlocked = filled >= totalStamps;
  const left = totalStamps - filled;
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatCooldownClock(cooldownUntil));
  const qrLocked = forceLocked || (isCooldownActive(cooldownUntil) && Boolean(clock));
  const lockLabel = clock ?? (forceLocked ? "Unlocking…" : null);

  useEffect(() => {
    if (!open || !isUnlocked || isRedeemed) {
      setQrUrl(null);
      return;
    }

    let active = true;
    // Locked: decoy payload so the blurred preview can't be redeemed.
    // Unlocked: real redeem URL.
    const payload = qrLocked
      ? `https://froq.io/locked?t=${encodeURIComponent(cooldownUntil ?? "wait")}`
      : `https://froq.io/redeem?code=${redeemCode}`;

    QRCode.toDataURL(payload, {
      margin: 1,
      width: 320,
      color: { dark: "#111111", light: "#ffffff" },
      errorCorrectionLevel: "M",
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
  }, [open, isUnlocked, isRedeemed, redeemCode, qrLocked, cooldownUntil]);

  useEffect(() => {
    if (!open || !cooldownUntil) {
      setClock(null);
      return;
    }
    const tick = () => setClock(formatCooldownClock(cooldownUntil));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, cooldownUntil]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      {isUnlocked ? (
        <>
          <div className="thanks-head">
            <div
              className={`thanks-badge${qrLocked ? "" : " thanks-badge--gold"}`}
              aria-hidden="true"
            >
              {qrLocked ? (
                <Lock size={24} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" color="#fff" />
              ) : (
                <Gift size={26} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" color="#fff" />
              )}
            </div>
            <h3 className="thanks-title">
              {isRedeemed
                ? "Already redeemed"
                : qrLocked
                  ? "Reward locked"
                  : "Reward unlocked"}
            </h3>
            <p className="thanks-sub">
              {isRedeemed
                ? "This reward has already been used. Enjoy your next visit!"
                : qrLocked
                  ? "Come back when the timer ends to show your QR to staff."
                  : "Show this code to staff to redeem your free reward."}
            </p>
          </div>

          {!isRedeemed && (
            <div className={`reward-qr-card${qrLocked ? " reward-qr-card--locked" : ""}`}>
              <div className="reward-qr-frame">
                {qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={`reward-qr-img${qrLocked ? " reward-qr-img--blurred" : ""}`}
                    src={qrUrl}
                    alt={qrLocked ? "Blurred reward QR" : "Reward redemption QR code"}
                    width={220}
                    height={220}
                    draggable={false}
                  />
                ) : (
                  <div className="reward-qr-skeleton" aria-hidden="true" />
                )}

                {qrLocked && lockLabel ? (
                  <div className="reward-qr-frost" role="status" aria-live="polite">
                    <div className="reward-qr-lock-pill">
                      <Lock size={15} strokeWidth={2.6} aria-hidden="true" />
                      <span className="reward-qr-lock-time">{lockLabel}</span>
                    </div>
                    <span className="reward-qr-lock-label">until unlock</span>
                  </div>
                ) : null}
              </div>

              <div className={`reward-qr-code${qrLocked ? " reward-qr-code--locked" : ""}`}>
                {qrLocked ? "Code hidden until unlock" : redeemCode}
              </div>
            </div>
          )}

          <button
            type="button"
            className="done-btn"
            onClick={() => {
              if (!isRedeemed && !qrLocked && onClaim) onClaim();
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
