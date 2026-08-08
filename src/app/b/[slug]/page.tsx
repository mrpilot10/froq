import type { Metadata } from "next";
import { resolveHubName, resolveHubPage } from "@/app/b/actions";
import { HubScreen } from "@/components/hub/hub-screen";
import { BrandThemeStyle } from "@/components/shared/brand-theme-style";
import { FroqFooter } from "@/components/shared/froq-footer";

/** The one QR a merchant prints — every guest-facing product behind one link. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await resolveHubName(slug);
  if (!name) return { title: "Froq" };

  return {
    title: `${name} — Froq`,
    description: `Menu, rewards, waitlist and bookings for ${name}, all in one place.`,
  };
}

export default async function BusinessHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b: branchSlug } = await searchParams;
  const resolved = await resolveHubPage(slug, branchSlug ?? null);

  if (!resolved.ok) {
    // No merchant → no social links; Powered by only.
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen auth-screen">
          <div className="auth-card">
            <div className="auth-head">
              <h2 className="auth-title">Shop not found</h2>
              <p className="auth-sub">This link is invalid or has been removed.</p>
            </div>
          </div>
          <FroqFooter />
        </div>
      </div>
    );
  }

  return (
    <>
      <BrandThemeStyle color={resolved.merchant.brandColor} />
      <HubScreen merchant={resolved.merchant} />
    </>
  );
}
