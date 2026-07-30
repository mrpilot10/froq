"use client";

import { CustomersScreen } from "@/components/merchant/customers-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyCustomersPage() {
  const {
    customers,
    role,
    onBanCustomer,
    onDeleteCustomer,
    onSaveCustomerNotes,
    onRequestOfferStampOtp,
    onConfirmOfferStamp,
  } = useMerchantWorkspace();
  return (
    <CustomersScreen
      customers={customers}
      role={role}
      onBanCustomer={onBanCustomer}
      onDeleteCustomer={onDeleteCustomer}
      onSaveCustomerNotes={onSaveCustomerNotes}
      onRequestOfferStampOtp={onRequestOfferStampOtp}
      onConfirmOfferStamp={onConfirmOfferStamp}
    />
  );
}
