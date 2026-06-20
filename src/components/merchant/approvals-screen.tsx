"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { PendingApproval } from "@/lib/merchant/types";

interface ApprovalsScreenProps {
  approvals: PendingApproval[];
  onApprove: (id: string) => void | Promise<unknown>;
  onDisapprove: (id: string) => void | Promise<unknown>;
}

type BusyState = { id: string; action: "approve" | "disapprove" } | null;

export function ApprovalsScreen({ approvals, onApprove, onDisapprove }: ApprovalsScreenProps) {
  const [busy, setBusy] = useState<BusyState>(null);

  async function run(id: string, action: "approve" | "disapprove") {
    if (busy) return;
    setBusy({ id, action });
    try {
      await (action === "approve" ? onApprove(id) : onDisapprove(id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Approvals</h2>
        <p className="tab-sub">Review stamp requests from customers</p>
      </div>

      {approvals.length === 0 ? (
        <div className="panel-card merchant-empty">
          <p className="merchant-empty-title">All caught up</p>
          <p className="merchant-empty-sub">No pending stamp requests right now.</p>
        </div>
      ) : (
        <div className="merchant-approval-list">
          {approvals.map((approval) => {
            const isBusy = busy?.id === approval.id;
            const isApproving = isBusy && busy?.action === "approve";
            const isRejecting = isBusy && busy?.action === "disapprove";
            return (
              <div key={approval.id} className="panel-card merchant-approval-card">
                <div className="merchant-approval-top">
                  <div className="merchant-avatar">{getInitials(approval.customerName)}</div>
                  <div className="merchant-approval-copy">
                    <div className="merchant-list-title">{approval.customerName}</div>
                    <div className="merchant-list-sub">{approval.phone}</div>
                    <div className="merchant-approval-meta">
                      Stamp {approval.stampsBefore + 1} of {approval.totalStamps} ·{" "}
                      {approval.requestedAt}
                    </div>
                  </div>
                </div>
                <div className="merchant-approval-actions">
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--reject"
                    disabled={isBusy}
                    onClick={() => void run(approval.id, "disapprove")}
                  >
                    {isRejecting ? (
                      <span className="merchant-btn-spinner" aria-hidden="true" />
                    ) : (
                      <X size={16} strokeWidth={2.4} />
                    )}
                    {isRejecting ? "Working…" : "Disapprove"}
                  </button>
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--approve"
                    disabled={isBusy}
                    onClick={() => void run(approval.id, "approve")}
                  >
                    {isApproving ? (
                      <span className="merchant-btn-spinner" aria-hidden="true" />
                    ) : (
                      <Check size={16} strokeWidth={2.4} />
                    )}
                    {isApproving ? "Approving…" : "Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
