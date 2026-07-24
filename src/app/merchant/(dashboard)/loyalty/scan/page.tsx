"use client";

import { ScannerScreen } from "@/components/merchant/scanner-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";

export default function LoyaltyScanPage() {
  const { onRedeem } = useMerchantWorkspace();
  return <ScannerScreen onRedeem={onRedeem} />;
}
