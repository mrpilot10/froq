"use client";

import { Bell, CheckSquare, Gift, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import type { MerchantProduct, PendingApproval } from "@/lib/merchant/types";

interface MerchantNotificationsDrawerProps {
  open: boolean;
  product: MerchantProduct;
  approvals: PendingApproval[];
  onViewApprovals: () => void;
  onClose: () => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MerchantNotificationsDrawer({
  open,
  product,
  approvals,
  onViewApprovals,
  onClose,
}: MerchantNotificationsDrawerProps) {
  const isLoyalty = product === "loyalty";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="merchant-notif-title"
      className="merchant-theme"
    >
      <div className="merchant-notif">
        <div className="merchant-notif-head">
          <h3 id="merchant-notif-title" className="merchant-notif-title">
            Notifications
          </h3>
          <p className="merchant-notif-sub">
            {isLoyalty ? "Stamp requests & loyalty activity" : "Live waitlist activity"}
          </p>
        </div>

        {isLoyalty && approvals.length > 0 ? (
          <div className="merchant-notif-list">
            {approvals.map((approval) => (
              <button
                key={approval.id}
                type="button"
                className="merchant-notif-item"
                onClick={() => {
                  onViewApprovals();
                  onClose();
                }}
              >
                <span className="merchant-notif-avatar">
                  {getInitials(approval.customerName)}
                </span>
                <span className="merchant-notif-copy">
                  <span className="merchant-notif-item-title">
                    {approval.customerName} requested a stamp
                  </span>
                  <span className="merchant-notif-item-sub">
                    Stamp {approval.stampsBefore + 1} of {approval.totalStamps} ·{" "}
                    {approval.requestedAt}
                  </span>
                </span>
                <span className="merchant-notif-pill">Review</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="merchant-notif-empty">
            <span className="merchant-notif-empty-icon">
              {isLoyalty ? (
                <Gift size={22} strokeWidth={2.2} />
              ) : (
                <Bell size={22} strokeWidth={2.2} />
              )}
            </span>
            <p className="merchant-notif-empty-title">You&apos;re all caught up</p>
            <p className="merchant-notif-empty-sub">
              {isLoyalty
                ? "New stamp requests will show up here for quick approval."
                : "New guest joins and ready-to-seat alerts will show up here."}
            </p>
          </div>
        )}

        {isLoyalty && approvals.length > 0 && (
          <button
            type="button"
            className="cta-btn merchant-cta-accent merchant-notif-cta"
            onClick={() => {
              onViewApprovals();
              onClose();
            }}
          >
            <CheckSquare size={17} strokeWidth={2.3} />
            Review all approvals
          </button>
        )}

        {!isLoyalty && (
          <p className="merchant-notif-foot">
            <Sparkles size={13} strokeWidth={2.4} />
            Enable notifications in settings to get alerts on this device.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
