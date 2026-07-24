import { Suspense } from "react";
import type { Metadata } from "next";
import { MerchantAcceptInvite } from "@/components/merchant/merchant-accept-invite";
import { MerchantGateSplash } from "@/components/merchant/skeletons";

export const metadata: Metadata = {
  title: "Accept invite — Froq for Business",
  description: "Join your team's Froq account.",
};

export default function MerchantAcceptInvitePage() {
  return (
    <Suspense fallback={<MerchantGateSplash />}>
      <MerchantAcceptInvite />
    </Suspense>
  );
}
