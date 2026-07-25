"use client";

import { ApprovalsList } from "./approvals-list";
import type { PendingApproval } from "@/lib/merchant/types";

interface ApprovalsScreenProps {
  approvals: PendingApproval[];
  onApprove: (id: string) => void | Promise<unknown>;
  onDisapprove: (id: string) => void | Promise<unknown>;
}

/** @deprecated Approvals live on Home; kept for deep-link redirect page. */
export function ApprovalsScreen({ approvals, onApprove, onDisapprove }: ApprovalsScreenProps) {
  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Approvals</h2>
        <p className="tab-sub">Review stamp requests from customers</p>
      </div>
      <ApprovalsList
        approvals={approvals}
        onApprove={onApprove}
        onDisapprove={onDisapprove}
      />
    </div>
  );
}
