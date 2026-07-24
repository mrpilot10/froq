"use client";

import { CustomersScreen } from "@/components/merchant/customers-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function CustomersPage() {
  const { customers, avgOrderValue, onBanCustomer, onDeleteCustomer, onOfferStamp } =
    useMerchantWorkspace();
  return (
    <CustomersScreen
      customers={customers}
      avgOrderValue={avgOrderValue}
      onBanCustomer={onBanCustomer}
      onDeleteCustomer={onDeleteCustomer}
      onOfferStamp={onOfferStamp}
    />
  );
}
