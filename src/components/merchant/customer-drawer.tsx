"use client";

import { useEffect, useState } from "react";
import { Ban, Calendar, Mail, Phone, ShieldCheck, Stamp, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { customerLtv, formatCurrency } from "@/lib/merchant/ltv";
import {
  canModerateCustomers,
  canViewCustomerData,
} from "@/lib/merchant/roles";
import type { MemberRole, MerchantCustomer } from "@/lib/merchant/types";
import { OfferStampOtp, type RequestOfferStampOtpResult } from "./offer-stamp-otp";

interface CustomerDrawerProps {
  customer: MerchantCustomer | null;
  avgOrderValue: number;
  role: MemberRole;
  onClose: () => void;
  onBan: (id: string) => void;
  onDelete: (id: string) => void;
  onRequestOfferStampOtp: (customerId: string) => Promise<RequestOfferStampOtpResult>;
  onConfirmOfferStamp: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

type ConfirmAction = "ban" | "delete" | null;

function statusLabel(status: MerchantCustomer["status"]) {
  if (status === "reward_ready") return "Reward ready";
  if (status === "claimed") return "Claimed";
  return "Active";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function CustomerDrawer({
  customer,
  avgOrderValue,
  role,
  onClose,
  onBan,
  onDelete,
  onRequestOfferStampOtp,
  onConfirmOfferStamp,
}: CustomerDrawerProps) {
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [offering, setOffering] = useState(false);
  const showData = canViewCustomerData(role);
  const canModerate = canModerateCustomers(role);

  useEffect(() => {
    setConfirm(null);
    setOffering(false);
  }, [customer?.id]);

  const badge = customer?.banned
    ? { label: "Banned", className: "merchant-badge--banned" }
    : {
        label: customer ? statusLabel(customer.status) : "",
        className: `merchant-badge--${customer?.status}`,
      };

  const canOfferStamp =
    !!customer &&
    !customer.banned &&
    customer.status !== "reward_ready" &&
    customer.status !== "claimed";

  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="customer-drawer-name"
      className="merchant-theme"
    >
      {customer && (
        <div className="merchant-drawer">
          <div className="merchant-drawer-head">
            <div className="merchant-avatar merchant-avatar--lg">{getInitials(customer.name)}</div>
            <div className="merchant-drawer-head-copy">
              <h3 id="customer-drawer-name" className="merchant-drawer-name">
                {customer.name}
              </h3>
              {showData ? (
                <span className={`merchant-badge ${badge.className}`}>{badge.label}</span>
              ) : (
                <span className="merchant-list-sub">Offer a stamp with OTP</span>
              )}
            </div>
          </div>

          {showData ? (
            <>
              <div className="merchant-drawer-stats">
                <div className="merchant-drawer-stat merchant-drawer-stat--accent">
                  <span className="merchant-drawer-stat-label">Lifetime value</span>
                  <span className="merchant-drawer-stat-value">
                    {formatCurrency(customerLtv(customer, avgOrderValue))}
                  </span>
                </div>
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Visits</span>
                  <span className="merchant-drawer-stat-value">{customer.lifetimeVisits}</span>
                </div>
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Stamps</span>
                  <span className="merchant-drawer-stat-value">
                    {customer.stamps}/{customer.totalStamps}
                  </span>
                </div>
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Rewards claimed</span>
                  <span className="merchant-drawer-stat-value">{customer.rewardsClaimed}</span>
                </div>
              </div>

              <div className="merchant-drawer-rows">
                <div className="profile-row">
                  <div className="profile-row-icon">
                    <Phone size={18} strokeWidth={2.2} />
                  </div>
                  <div className="profile-row-copy">
                    <div className="profile-row-label">Mobile</div>
                    <div className="profile-row-value">{formatPhoneDisplay(customer.phone)}</div>
                  </div>
                </div>

                {customer.email ? (
                  <div className="profile-row">
                    <div className="profile-row-icon">
                      <Mail size={18} strokeWidth={2.2} />
                    </div>
                    <div className="profile-row-copy">
                      <div className="profile-row-label">Email</div>
                      <div className="profile-row-value">{customer.email}</div>
                    </div>
                  </div>
                ) : null}

                <div className="profile-row">
                  <div className="profile-row-icon">
                    <Calendar size={18} strokeWidth={2.2} />
                  </div>
                  <div className="profile-row-copy">
                    <div className="profile-row-label">Member since</div>
                    <div className="profile-row-value">{customer.memberSince}</div>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {confirm && canModerate ? (
            <div className="merchant-confirm">
              <p className="merchant-confirm-text">
                {confirm === "delete"
                  ? `Delete ${customer.name}? This permanently removes their loyalty record.`
                  : `Ban ${customer.name}? They won't be able to earn or redeem stamps.`}
              </p>
              <div className="merchant-confirm-actions">
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--reject"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--danger"
                  onClick={() => {
                    if (confirm === "delete") onDelete(customer.id);
                    else onBan(customer.id);
                    setConfirm(null);
                  }}
                >
                  {confirm === "delete" ? "Delete" : "Ban"}
                </button>
              </div>
            </div>
          ) : offering && canOfferStamp ? (
            <OfferStampOtp
              customerName={customer.name}
              autoSend
              onRequestCode={() => onRequestOfferStampOtp(customer.id)}
              onConfirm={async (code) => {
                const result = await onConfirmOfferStamp(customer.id, code);
                if (result.ok) setOffering(false);
                return result;
              }}
              onCancel={() => setOffering(false)}
            />
          ) : (
            <div className="merchant-drawer-actions merchant-drawer-actions--stack">
              <button
                type="button"
                className="merchant-action-btn merchant-action-btn--approve merchant-action-btn--block"
                disabled={!canOfferStamp}
                title={
                  customer.status === "reward_ready"
                    ? "Redeem their reward before offering another stamp"
                    : customer.status === "claimed"
                      ? "This rewards program is complete"
                      : customer.banned
                        ? "Unban this customer first"
                        : undefined
                }
                onClick={() => setOffering(true)}
              >
                <Stamp size={16} strokeWidth={2.3} />
                Offer stamp
              </button>
              {canModerate ? (
                <div className="merchant-drawer-actions">
                  {customer.banned ? (
                    <button
                      type="button"
                      className="merchant-action-btn merchant-action-btn--reject"
                      onClick={() => onBan(customer.id)}
                    >
                      <ShieldCheck size={16} strokeWidth={2.3} />
                      Unban
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="merchant-action-btn merchant-action-btn--reject"
                      onClick={() => setConfirm("ban")}
                    >
                      <Ban size={16} strokeWidth={2.3} />
                      Ban
                    </button>
                  )}
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--danger"
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 size={16} strokeWidth={2.3} />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
