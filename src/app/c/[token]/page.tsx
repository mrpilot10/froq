import type { Metadata } from "next";
import { resolveCustomerBrandColor } from "@/app/actions/customer";
import { CustomerHubGate } from "@/components/auth/customer-hub-gate";
import { BrandThemeStyle } from "@/components/shared/brand-theme-style";

export const metadata: Metadata = {
  title: "Your Froq — customer hub",
  description: "Your loyalty card, waitlist, and reservations for this business — one permanent link.",
};

/**
 * Permanent customer hub: https://froq.io/c/{publicToken}
 * publicToken is the Customer × Business relationship token (frq_…).
 * The page dynamically loads loyalty / waitlist / reservations for that token.
 */
export default async function CustomerHubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Paint the shop's colour before the card arrives, so the skeleton isn't green.
  const brandColor = await resolveCustomerBrandColor(token);

  return (
    <>
      <BrandThemeStyle color={brandColor} />
      <CustomerHubGate token={token} />
    </>
  );
}
