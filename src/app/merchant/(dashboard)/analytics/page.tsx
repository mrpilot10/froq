"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GlobalAnalyticsScreen } from "@/components/merchant/global-analytics-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { PRODUCT_DEFAULT_TAB, TAB_HREF } from "@/lib/merchant/nav";

export default function AnalyticsPage() {
  const router = useRouter();
  const { role } = useMerchantWorkspace();

  useEffect(() => {
    if (role !== "owner") {
      router.replace(TAB_HREF[PRODUCT_DEFAULT_TAB.loyalty]);
    }
  }, [role, router]);

  if (role !== "owner") return null;
  return <GlobalAnalyticsScreen />;
}
