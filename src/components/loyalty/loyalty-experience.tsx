"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Plus } from "lucide-react";
import { toast } from "sonner";
import { requestStamp, type CardData } from "@/app/actions/customer";
import type { BusinessInfo, HistoryEntry, NavTab } from "@/lib/loyalty/types";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { BusinessHeader } from "./business-header";
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
  memberSince: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
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
  memberSince,
  customerName,
  customerPhone,
  customerEmail,
  onRefresh,
  onLogout,
}: LoyaltyExperienceProps) {
  const [activeTab, setActiveTab] = useState<NavTab>("collect");
  const [screen, setScreen] = useState<"card" | "success">("card");
  const [rewardSheetOpen, setRewardSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

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

  // Refetch on focus as a fallback to realtime.
  useEffect(() => {
    const onFocus = () => void onRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [onRefresh]);

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
      ? "Claim Reward"
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
                    : isClaimed
                      ? "Reward redeemed — collect again"
                      : "Show this screen to staff at checkout"}
                </div>
              </div>

              <SocialRow links={business.socialLinks} />
            </>
          )}

          {activeTab === "history" && <HistoryScreen entries={history} />}

          {activeTab === "profile" && (
            <ProfileScreen
              business={business}
              name={customerName}
              initials={initials}
              phone={customerPhone}
              email={customerEmail}
              filled={card.filled}
              memberSince={memberSince}
              onLogout={onLogout}
            />
          )}

          <div className="footer">
            Powered by <b>froq.io</b>
          </div>
        </div>
      </div>

      <FloatingNav activeTab={activeTab} onTabChange={handleTabChange} collectDisabled={card.pending} />

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

      <Confetti active={showConfetti} onComplete={() => setShowConfetti(false)} />
    </>
  );
}
