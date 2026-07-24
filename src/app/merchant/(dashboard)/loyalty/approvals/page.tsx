"use client";

import { ApprovalsScreen } from "@/components/merchant/approvals-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyApprovalsPage() {
  const { approvals, onApprove, onDisapprove } = useMerchantWorkspace();
  return (
    <ApprovalsScreen
      approvals={approvals}
      onApprove={onApprove}
      onDisapprove={onDisapprove}
    />
  );
}
