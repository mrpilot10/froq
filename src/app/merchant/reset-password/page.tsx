import { Suspense } from "react";
import type { Metadata } from "next";
import { MerchantResetPassword } from "@/components/merchant/merchant-reset-password";
import { MerchantGateSplash } from "@/components/merchant/skeletons";

export const metadata: Metadata = {
  title: "Reset password — Froq for Business",
  description: "Choose a new password for your Froq merchant account.",
};

export default function MerchantResetPasswordPage() {
  return (
    <Suspense fallback={<MerchantGateSplash />}>
      <MerchantResetPassword />
    </Suspense>
  );
}
