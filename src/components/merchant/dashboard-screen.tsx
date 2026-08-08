"use client";

import { useMemo } from "react";
import {
  BarChart3,
  Clock3,
  History,
  QrCode,
  ScanLine,
  Stamp,
  Users,
} from "lucide-react";
import type { PendingApproval } from "@/lib/merchant/types";
import { canViewCustomerData } from "@/lib/merchant/roles";
import { ApprovalsList } from "./approvals-list";
import { CustomerStampSearch } from "./customer-stamp-search";
import { useMerchantWorkspace } from "./merchant-workspace-context";

export function DashboardScreen() {
  const {
    profile,
    dashboardStats,
    approvals,
    customers,
    role,
    branches,
    activeBranchId,
    onApprove,
    onDisapprove,
    onRequestOfferStampOtp,
    onConfirmOfferStamp,
    onShowQr,
    onRedeemCode,
    goToTab,
  } = useMerchantWorkspace();

  const allBranches = activeBranchId === null && branches.length > 1;
  const businessName = profile.businessName;
  const pendingLabel =
    approvals.length === 0
      ? "All clear"
      : `${approvals.length} waiting`;

  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const approvalsByBranch = useMemo(() => {
    if (!allBranches) return null;
    const groups = new Map<string, { name: string; items: PendingApproval[] }>();
    for (const approval of approvals) {
      const key = approval.branchId ?? "unknown";
      const name =
        approval.branchName ??
        (approval.branchId ? branchNameById.get(approval.branchId) : null) ??
        "Unknown branch";
      const existing = groups.get(key);
      if (existing) existing.items.push(approval);
      else groups.set(key, { name, items: [approval] });
    }
    return [...groups.entries()]
      .map(([id, group]) => ({ id, ...group }))
      .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [allBranches, approvals, branchNameById]);

  const metrics = [
    {
      id: "members",
      label: "Members",
      value: dashboardStats.totalCustomers,
      Icon: Users,
      accent: true,
    },
    {
      id: "stamps",
      label: "Stamps today",
      value: dashboardStats.stampsToday,
      Icon: Stamp,
      accent: false,
    },
    {
      id: "pending",
      label: "Pending",
      value: approvals.length,
      Icon: Clock3,
      accent: approvals.length > 0,
    },
  ] as const;

  return (
    <div className="tab-screen merchant-dashboard">
      <div className="merchant-home-intro">
        <div className="merchant-home-intro-copy">
          <p className="merchant-home-eyebrow">
            {allBranches ? "All branches" : "Loyalty desk"}
          </p>
          <h2 className="merchant-home-title">{businessName}</h2>
          <p className="merchant-home-sub">
            {allBranches
              ? "Review activity across every branch. Pick a branch to show QR, redeem, or add stamps."
              : "Show your QR, redeem rewards, or add a stamp for a customer."}
          </p>
        </div>
        <button
          type="button"
          className="merchant-home-analytics"
          onClick={() => goToTab("analytics")}
        >
          <BarChart3 size={15} strokeWidth={2.3} />
          Analytics
        </button>
      </div>

      <section className="merchant-section">
        <div className="merchant-home-metrics" aria-label="Loyalty metrics">
          {metrics.map(({ id, label, value, Icon, accent }) => (
            <div
              key={id}
              className={`merchant-home-metric${accent ? " merchant-home-metric--accent" : ""}`}
            >
              <span className="merchant-home-metric-icon" aria-hidden>
                <Icon size={16} strokeWidth={2.3} />
              </span>
              <span className="merchant-home-metric-value">{value}</span>
              <span className="merchant-home-metric-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="merchant-section">
        <div className="panel-card merchant-home-tools">
          {allBranches ? (
            <div className="merchant-quick-actions merchant-quick-actions--all">
              <button
                type="button"
                className="queue-action"
                onClick={() => goToTab("analytics")}
              >
                <span className="queue-action-icon queue-action-icon--accent">
                  <BarChart3 size={18} strokeWidth={2.2} />
                </span>
                Analytics
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => goToTab("loyalty-history")}
              >
                <span className="queue-action-icon">
                  <History size={18} strokeWidth={2.2} />
                </span>
                History
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => goToTab("loyalty-customers")}
              >
                <span className="queue-action-icon">
                  <Users size={18} strokeWidth={2.2} />
                </span>
                Customers
              </button>
            </div>
          ) : (
            <div className="merchant-quick-actions">
              <button
                type="button"
                className="queue-action"
                onClick={() => onShowQr("loyalty")}
              >
                <span className="queue-action-icon queue-action-icon--accent">
                  <QrCode size={18} strokeWidth={2.2} />
                </span>
                Show QR
              </button>
              <button type="button" className="queue-action" onClick={() => onRedeemCode()}>
                <span className="queue-action-icon">
                  <ScanLine size={18} strokeWidth={2.2} />
                </span>
                Redeem code
              </button>
              <button
                type="button"
                className="queue-action"
                onClick={() => goToTab("loyalty-history")}
              >
                <span className="queue-action-icon">
                  <History size={18} strokeWidth={2.2} />
                </span>
                History
              </button>
            </div>
          )}

          <CustomerStampSearch
            customers={customers}
            role={role}
            embedded
            allowStamp={!allBranches}
            showBranchBadge={allBranches}
            branchNameById={branchNameById}
            label={allBranches ? "Find a customer" : "Add a stamp"}
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
        {allBranches && approvalsByBranch && approvalsByBranch.length > 0 ? (
          <div className="merchant-approval-groups">
            {approvalsByBranch.map((group) => (
              <div key={group.id} className="merchant-approval-group">
                <div className="merchant-approval-group-head">
                  <span className="merchant-branch-badge">{group.name}</span>
                  <span className="merchant-approval-group-count">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "approval" : "approvals"}
                  </span>
                </div>
                <ApprovalsList
                  approvals={group.items}
                  hideContact={!canViewCustomerData(role)}
                  showBranchBadge={false}
                  onApprove={onApprove}
                  onDisapprove={onDisapprove}
                />
              </div>
            ))}
          </div>
        ) : (
          <ApprovalsList
            approvals={approvals}
            hideContact={!canViewCustomerData(role)}
            showBranchBadge={false}
            onApprove={onApprove}
            onDisapprove={onDisapprove}
          />
        )}
      </section>
    </div>
  );
}
