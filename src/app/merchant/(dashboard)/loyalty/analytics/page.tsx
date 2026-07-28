"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TAB_HREF } from "@/lib/merchant/nav";

/** Loyalty analytics moved to the workspace analytics hub. */
export default function LoyaltyAnalyticsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(TAB_HREF.analytics);
  }, [router]);

  return null;
}
