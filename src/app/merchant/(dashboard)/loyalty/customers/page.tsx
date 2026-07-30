"use client";

import { useMemo } from "react";
import { CustomersScreen } from "@/components/merchant/customers-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyCustomersPage() {
  const {
    customers,
    role,
    branches,
    activeBranchId,
    onBanCustomer,
    onDeleteCustomer,
    onSaveCustomerNotes,
    onRequestOfferStampOtp,
    onConfirmOfferStamp,
  } = useMerchantWorkspace();

  const allBranches = activeBranchId === null;
  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  return (
    <CustomersScreen
      customers={customers}
      role={role}
      showBranchBadge={allBranches}
      branchNameById={branchNameById}
      hideOfferStamp={allBranches}
      onBanCustomer={onBanCustomer}
      onDeleteCustomer={onDeleteCustomer}
      onSaveCustomerNotes={onSaveCustomerNotes}
      onRequestOfferStampOtp={onRequestOfferStampOtp}
      onConfirmOfferStamp={onConfirmOfferStamp}
    />
  );
}
