import { Check, X } from "lucide-react";
import type { PendingApproval } from "@/lib/merchant/types";

interface ApprovalsScreenProps {
  approvals: PendingApproval[];
  onApprove: (id: string) => void;
  onDisapprove: (id: string) => void;
}

export function ApprovalsScreen({ approvals, onApprove, onDisapprove }: ApprovalsScreenProps) {
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
          {approvals.map((approval) => (
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
                  onClick={() => onDisapprove(approval.id)}
                >
                  <X size={16} strokeWidth={2.4} />
                  Disapprove
                </button>
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--approve"
                  onClick={() => onApprove(approval.id)}
                >
                  <Check size={16} strokeWidth={2.4} />
                  Approve
                </button>
              </div>
            </div>
          ))}
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
