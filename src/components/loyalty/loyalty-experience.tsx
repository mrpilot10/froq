"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gift, Plus } from "lucide-react";
import { toast } from "sonner";
import { requestStamp, type CardData } from "@/app/actions/customer";
import { DeleteAccountDrawer } from "@/components/shared/delete-account-drawer";
import { FroqFooter } from "@/components/shared/froq-footer";
import { cooldownUnlockCopy } from "@/lib/loyalty/rules";
import type { BusinessInfo, HistoryEntry, NavTab, RewardCardGroup } from "@/lib/loyalty/types";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { BusinessHeader } from "./business-header";
import { ClaimedCelebration } from "./claimed-celebration";
import { Confetti } from "./confetti";
import { FloatingNav } from "./floating-nav";
import { HistoryScreen } from "./history-screen";
import { ProfileScreen } from "./profile-screen";
import { RewardSheet } from "./reward-sheet";
import { SocialRow } from "./social-row";
import { SuccessScreen } from "./success-screen";
import { WalletPass } from "./wallet-pass";

interface LoyaltyExperienceProps {
  business: BusinessInfo;
  card: CardData;
  history: HistoryEntry[];
  rewardCards: RewardCardGroup[];
  totalStampsCollected: number;
  memberSince: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
  onDeleteAccount: () => Promise<{ ok: boolean; error?: string }>;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function LoyaltyExperience({
  business,
  card,
  history,
  rewardCards,
  totalStampsCollected,
  memberSince,
  customerName,
  customerPhone,
  customerEmail,
  onRefresh,
  onLogout,
  onDeleteAccount,
}: LoyaltyExperienceProps) {
  const [activeTab, setActiveTab] = useState<NavTab>("collect");
  const [screen, setScreen] = useState<"card" | "success">("card");
  const [rewardSheetOpen, setRewardSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showClaimed, setShowClaimed] = useState(false);

  useBrandTheme(business.brandColor);

  const initials = getInitials(customerName);
  const isRewardReady = card.status === "reward_ready";
  const isClaimed = card.status === "claimed";
  const canRestart = business.restartAfterReward !== false;
  const qrUnlockAt = card.rewardStatus === "waiting" ? card.rewardUnlockAt ?? null : null;
  const lockMessage = useMemo(() => {
    if (isClaimed && !canRestart) return "You've completed this rewards program";
    if (isRewardReady) return null;
    return cooldownUnlockCopy(card.cooldownUntil);
  }, [isClaimed, canRestart, card.cooldownUntil, isRewardReady]);
  const isLocked = Boolean(lockMessage) && !isRewardReady;
  const redeemCode = card.rewardCode || `FROQ-${card.customerId.slice(0, 5).toUpperCase()}`;

  // Live updates: stamp approve/redeem updates loyalty_cards; claim also inserts
  // a redemptions row (works even before replica-identity migrations land).
  const filter = `customer_id=eq.${card.customerId}`;
  useRealtime("approvals", filter, onRefresh);
  useRealtime("loyalty_cards", filter, onRefresh);
  useRealtime("redemptions", filter, onRefresh);

  // Celebrate when a stamp lands (filled increased while we were on the card).
  const [prevFilled, setPrevFilled] = useState(card.filled);
  useEffect(() => {
    if (card.filled > prevFilled) setShowConfetti(true);
    setPrevFilled(card.filled);
  }, [card.filled, prevFilled]);

  // Celebrate when the merchant redeems: status leaves reward_ready, or stamps
  // reset to 0 after a full card (restart_after_reward keeps status as active).
  const [prevStatus, setPrevStatus] = useState(card.status);
  useEffect(() => {
    const leftRewardReady =
      prevStatus === "reward_ready" && card.status !== "reward_ready";
    const stampsResetAfterReward =
      prevStatus === "reward_ready" && card.filled === 0 && prevFilled > 0;
    if (leftRewardReady || stampsResetAfterReward) {
      setRewardSheetOpen(false);
      setShowClaimed(true);
      setShowConfetti(true);
      setScreen("card");
      // Land on Rewards so the new claimed entry is visible and highlighted.
      setActiveTab("history");
    }
    setPrevStatus(card.status);
  }, [card.status, card.filled, prevStatus, prevFilled]);

  // Safety net when the realtime socket is suspended (phone lock) or blocked.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const REFRESH_THROTTLE_MS = 8_000;
    const POLL_MS = 20_000;

    const maybeRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      void onRefresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") maybeRefresh();
    };

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = setInterval(maybeRefresh, POLL_MS);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(poll);
    };
  }, [onRefresh]);

  // Jump to the top (no animation) on tab switch so each page starts at its header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const handleCollect = useCallback(async () => {
    if (isRewardReady || isLocked || card.pending || submitting) return;
    setSubmitting(true);
    const res = await requestStamp(card.customerId);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit your request");
      return;
    }
    setScreen("success");
    await onRefresh();
  }, [isRewardReady, isLocked, card.pending, card.customerId, submitting, onRefresh]);

  const handlePrimaryAction = useCallback(() => {
    if (card.pending || submitting || isLocked) return;
    if (isRewardReady) {
      setRewardSheetOpen(true);
      return;
    }
    void handleCollect();
  }, [card.pending, submitting, isLocked, isRewardReady, handleCollect]);

  const handleTabChange = useCallback(
    (tab: NavTab) => {
      if (tab === "collect" && activeTab === "collect") {
        handlePrimaryAction();
        return;
      }
      setActiveTab(tab);
    },
    [activeTab, handlePrimaryAction],
  );

  const ctaLabel = card.pending
    ? "Awaiting approval…"
    : isRewardReady
      ? "Show reward to staff"
      : isLocked
        ? lockMessage || "Card locked"
        : "Collect Stamp";

  return (
    <>
      <div className={`loyalty-page${activeTab === "collect" ? " loyalty-page--collect" : ""}`}>
        <div className={`loyalty-screen${activeTab === "collect" ? " loyalty-screen--collect" : ""}`}>
          {activeTab === "collect" && (
            <div className="loyalty-collect">
              <div className="hero-section">
                <BusinessHeader business={business} />

                <WalletPass
                  business={business}
                  filled={card.filled}
                  pending={card.pending && screen === "card"}
                  customerName={customerName}
                  customerInitials={initials}
                  onRewardClick={() => setRewardSheetOpen(true)}
                  lockMessage={lockMessage}
                />
              </div>

              <div className="cta-block">
                <button
                  type="button"
                  className="cta-btn"
                  disabled={card.pending || submitting || (isLocked && !isRewardReady)}
                  onClick={handlePrimaryAction}
                >
                  {isRewardReady ? (
                    <Gift size={17} strokeWidth={2.2} color="#fff" />
                  ) : (
                    <Plus size={17} strokeWidth={2.2} color="#fff" />
                  )}
                  {ctaLabel}
                </button>
                <div className="cta-note">
                  {card.pending
                    ? "Staff will approve your stamp shortly"
                    : isRewardReady
                      ? "Show your reward QR to staff"
                      : isLocked
                        ? lockMessage
                        : "Show this screen to staff at checkout"}
                </div>
              </div>

              <SocialRow links={business.socialLinks} />
            </div>
          )}

          {activeTab === "history" && (
            <HistoryScreen entries={history} rewardCards={rewardCards} />
          )}

          {activeTab === "profile" && (
            <ProfileScreen
              business={business}
              name={customerName}
              initials={initials}
              phone={customerPhone}
              email={customerEmail}
              filled={card.filled}
              totalStampsCollected={totalStampsCollected}
              memberSince={memberSince}
              onLogout={onLogout}
              onDeleteAccount={() => setDeleteOpen(true)}
            />
          )}

          <FroqFooter />
        </div>
      </div>

      <FloatingNav activeTab={activeTab} onTabChange={handleTabChange} />

      <SuccessScreen
        open={screen === "success"}
        business={business}
        filled={card.filled}
        onBackToCard={() => {
          setScreen("card");
          setActiveTab("collect");
        }}
      />

      <RewardSheet
        open={rewardSheetOpen}
        business={business}
        filled={card.filled}
        redeemCode={redeemCode}
        isRedeemed={isClaimed}
        cooldownUntil={qrUnlockAt}
        forceLocked={card.rewardStatus === "waiting"}
        onClose={() => setRewardSheetOpen(false)}
        onClaim={() => setRewardSheetOpen(false)}
      />

      <ClaimedCelebration
        open={showClaimed}
        business={business}
        canRestart={canRestart}
        cooldownUntil={card.cooldownUntil}
        onStartAgain={() => {
          setShowClaimed(false);
          setScreen("card");
          setActiveTab("history");
        }}
      />

      <Confetti active={showConfetti} onComplete={() => setShowConfetti(false)} />

      <DeleteAccountDrawer
        open={deleteOpen}
        accountName={customerName}
        description={`This permanently removes your loyalty card at ${business.name}, including stamps and history.`}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDeleteAccount}
      />
    </>
  );
}
