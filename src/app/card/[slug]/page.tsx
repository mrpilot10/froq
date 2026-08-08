import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCustomerBrandColor } from "@/app/actions/customer";
import { loyaltyHubRedirectPath } from "@/lib/customer/hub";
import { ShopCardGate } from "@/components/auth/shop-card-gate";
import { BrandThemeStyle } from "@/components/shared/brand-theme-style";

export const metadata: Metadata = {
  title: "Your loyalty card — Froq",
  description: "Collect stamps and unlock rewards at your favourite local shop.",
};

export default async function ShopCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hubRedirect = loyaltyHubRedirectPath(slug);
  if (hubRedirect) redirect(hubRedirect);

  const brandColor = await resolveCustomerBrandColor(slug);

  return (
    <>
      <BrandThemeStyle color={brandColor} />
      <ShopCardGate slug={slug} />
    </>
  );
}
