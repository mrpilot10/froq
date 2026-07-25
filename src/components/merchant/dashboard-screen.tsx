"use client";

import { BarChart3, QrCode, ScanLine } from "lucide-react";
import type {
  MemberRole,
  MerchantCustomer,
  MerchantProduct,
  MerchantProfile,
  PendingApproval,
} from "@/lib/merchant/types";
import { canViewCustomerData } from "@/lib/merchant/roles";
import { ApprovalsList } from "./approvals-list";
import { CustomerStampSearch } from "./customer-stamp-search";
import type { RequestOfferStampOtpResult } from "./offer-stamp-otp";

interface DashboardScreenProps {
  profile: MerchantProfile;
  approvals: PendingApproval[];
  customers: MerchantCustomer[];
  role: MemberRole;
  onApprove: (id: string) => void | Promise<unknown>;
  onDisapprove: (id: string) => void | Promise<unknown>;
  onRequestOfferStampOtp: (customerId: string) => Promise<RequestOfferStampOtpResult>;
  onConfirmOfferStamp: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onShowQr?: (product?: MerchantProduct) => void;
  onRedeemCode?: () => void;
  onOpenAnalytics?: () => void;
}

export function DashboardScreen({
  profile,
  approvals,
  customers,
  role,
  onApprove,
  onDisapprove,
  onRequestOfferStampOtp,
  onConfirmOfferStamp,
  onShowQr,
  onRedeemCode,
  onOpenAnalytics,
}: DashboardScreenProps) {
  const businessName = profile.businessName;
  const pendingLabel =
    approvals.length === 0
      ? "All clear"
      : `${approvals.length} waiting`;

  return (
    <div className="tab-screen merchant-dashboard">
      <div className="merchant-home-intro">
        <div className="merchant-home-intro-copy">
          <p className="merchant-home-eyebrow">Loyalty desk</p>
          <h2 className="merchant-home-title">{businessName}</h2>
          <p className="merchant-home-sub">
            Show your QR, redeem rewards, or add a stamp for a customer.
          </p>
        </div>
        {onOpenAnalytics ? (
          <button
            type="button"
            className="merchant-home-analytics"
            onClick={onOpenAnalytics}
          >
            <BarChart3 size={15} strokeWidth={2.3} />
            Analytics
          </button>
        ) : null}
      </div>

      <section className="merchant-section">
        <div className="panel-card merchant-home-tools">
          <div className="merchant-quick-actions">
            <button type="button" className="queue-action" onClick={() => onShowQr?.("loyalty")}>
              <span className="queue-action-icon queue-action-icon--accent">
                <QrCode size={18} strokeWidth={2.2} />
              </span>
              Show QR
            </button>
            <button type="button" className="queue-action" onClick={() => onRedeemCode?.()}>
              <span className="queue-action-icon">
                <ScanLine size={18} strokeWidth={2.2} />
              </span>
              Redeem code
            </button>
          </div>

          <CustomerStampSearch
            customers={customers}
            role={role}
            embedded
            onRequestOfferStampOtp={onRequestOfferStampOtp}
            onConfirmOfferStamp={onConfirmOfferStamp}
          />
        </div>
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Pending approvals</h3>
          <span
            className={`merchant-section-meta${approvals.length > 0 ? " merchant-section-meta--accent" : ""}`}
          >
            {pendingLabel}
          </span>
        </div>
        <ApprovalsList
          approvals={approvals}
          hideContact={!canViewCustomerData(role)}
          onApprove={onApprove}
          onDisapprove={onDisapprove}
        />
      </section>
    </div>
  );
}
