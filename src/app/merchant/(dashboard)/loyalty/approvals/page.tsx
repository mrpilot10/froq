"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TAB_HREF } from "@/lib/merchant/nav";

/** Approvals now live on Home — keep this route as a redirect for old links. */
export default function LoyaltyApprovalsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(TAB_HREF.dashboard);
  }, [router]);
  return null;
}
