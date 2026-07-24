import type { ReactNode } from "react";
import { MerchantGate } from "@/components/merchant/merchant-gate";

export default function MerchantDashboardLayout({ children }: { children: ReactNode }) {
  return <MerchantGate>{children}</MerchantGate>;
}
