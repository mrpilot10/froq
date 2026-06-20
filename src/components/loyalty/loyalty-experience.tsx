"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Plus } from "lucide-react";
import { toast } from "sonner";
import { requestStamp, type CardData } from "@/app/actions/customer";
import { DeleteAccountDrawer } from "@/components/shared/delete-account-drawer";
import { FroqFooter } from "@/components/shared/froq-footer";
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
  const redeemCode = `FROQ-${card.customerId.slice(0, 5).toUpperCase()}`;

  // Live updates: refetch when the merchant approves a stamp or redeems.
  const filter = `customer_id=eq.${card.customerId}`;
  useRealtime("approvals", filter, onRefresh);
  useRealtime("loyalty_cards", filter, onRefresh);

  // Celebrate when a stamp lands (filled increased while we were on the card).
  const [prevFilled, setPrevFilled] = useState(card.filled);
  useEffect(() => {
    if (card.filled > prevFilled) setShowConfetti(true);
    setPrevFilled(card.filled);
  }, [card.filled, prevFilled]);

  // Celebrate when the merchant redeems: the card transitions out of
  // reward_ready (the DB resets it to active with 0 stamps). Show the claimed
  // celebration + confetti and close any open reward sheet so the customer never
  // sees the "almost there" state right after their reward was approved.
  const [prevStatus, setPrevStatus] = useState(card.status);
  useEffect(() => {
    if (prevStatus === "reward_ready" && card.status !== "reward_ready") {
      setRewardSheetOpen(false);
      setShowClaimed(true);
      setShowConfetti(true);
    }
    setPrevStatus(card.status);
  }, [card.status, prevStatus]);

  // Refetch on focus as a fallback to realtime.
  useEffect(() => {
    const onFocus = () => void onRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [onRefresh]);

  // Jump to the top (no animation) on tab switch so each page starts at its header.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  const handleCollect = useCallback(async () => {
    if (isRewardReady || card.pending || submitting) return;
    setSubmitting(true);
    const res = await requestStamp(card.customerId);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not submit your request");
      return;
    }
    setScreen("success");
    await onRefresh();
  }, [isRewardReady, card.pending, card.customerId, submitting, onRefresh]);

  const handlePrimaryAction = useCallback(() => {
    if (card.pending || submitting) return;
    if (isRewardReady) {
      setRewardSheetOpen(true);
      return;
    }
    void handleCollect();
  }, [card.pending, submitting, isRewardReady, handleCollect]);

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
      : "Collect Stamp";

  return (
    <>
      <div className="loyalty-page">
        <div className="loyalty-screen">
          {activeTab === "collect" && (
            <>
              <div className="hero-section">
                <BusinessHeader business={business} />

                <WalletPass
                  business={business}
                  filled={card.filled}
                  pending={card.pending && screen === "card"}
                  customerName={customerName}
                  customerInitials={initials}
                  onRewardClick={() => setRewardSheetOpen(true)}
                />
              </div>

              <div className="cta-block">
                <button
                  type="button"
                  className="cta-btn"
                  disabled={card.pending || submitting}
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
                      ? "Staff must redeem this reward before you can start a new card"
                      : "Show this screen to staff at checkout"}
                </div>
              </div>

              <SocialRow links={business.socialLinks} />
            </>
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
        onClose={() => setRewardSheetOpen(false)}
        onClaim={() => setRewardSheetOpen(false)}
      />

      <ClaimedCelebration
        open={showClaimed}
        business={business}
        onStartAgain={() => {
          setShowClaimed(false);
          setScreen("card");
          setActiveTab("collect");
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
