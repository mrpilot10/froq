"use client";

import { Bell, CheckSquare, Gift, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import type {
  MerchantInAppNotification,
  MerchantProduct,
  PendingApproval,
} from "@/lib/merchant/types";

interface MerchantNotificationsDrawerProps {
  open: boolean;
  product: MerchantProduct;
  approvals: PendingApproval[];
  notifications: MerchantInAppNotification[];
  onViewApprovals: () => void;
  onClose: () => void;
}

export function MerchantNotificationsDrawer({
  open,
  product,
  approvals,
  notifications,
  onViewApprovals,
  onClose,
}: MerchantNotificationsDrawerProps) {
  const isLoyalty = product === "loyalty";
  const hasNotifications = notifications.length > 0;
  const hasApprovals = isLoyalty && approvals.length > 0;
  const empty = !hasNotifications && !hasApprovals;

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

        {hasNotifications ? (
          <div className="merchant-notif-list">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`merchant-notif-item${item.read ? "" : " is-unread"}`}
                onClick={() => {
                  onViewApprovals();
                  onClose();
                }}
              >
                <span className="merchant-notif-avatar merchant-notif-avatar--bell" aria-hidden>
                  <Bell size={16} strokeWidth={2.3} />
                </span>
                <span className="merchant-notif-copy">
                  <span className="merchant-notif-item-title">{item.title}</span>
                  <span className="merchant-notif-item-sub">{item.message}</span>
                  <span className="merchant-notif-item-meta">{item.createdAt}</span>
                </span>
                <span className="merchant-notif-pill">{item.actionLabel}</span>
              </button>
            ))}
          </div>
        ) : null}

        {hasApprovals ? (
          <>
            {hasNotifications ? (
              <p className="merchant-notif-section-label">Waiting for review</p>
            ) : null}
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
          </>
        ) : null}

        {empty ? (
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
                ? "New stamp requests and escalation reminders will show up here."
                : "New guest joins and ready-to-seat alerts will show up here."}
            </p>
          </div>
        ) : null}

        {(hasApprovals || hasNotifications) && isLoyalty ? (
          <button
            type="button"
            className="cta-btn merchant-cta-accent merchant-notif-cta"
            onClick={() => {
              onViewApprovals();
              onClose();
            }}
          >
            <CheckSquare size={17} strokeWidth={2.3} />
            Review pending approvals
          </button>
        ) : null}

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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
