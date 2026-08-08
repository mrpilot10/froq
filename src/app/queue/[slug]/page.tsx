import type { Metadata } from "next";
import { resolveQueuePage } from "@/app/queue/actions";
import { QueueJoinScreen } from "@/components/queue/queue-join-screen";
import { BrandThemeStyle } from "@/components/shared/brand-theme-style";
import { FroqFooter } from "@/components/shared/froq-footer";

export const metadata: Metadata = {
  title: "Join the queue — Froq",
  description: "Add yourself to the waitlist and we'll text you when your table is ready.",
};

export default async function QueueJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const { slug } = await params;
  const { b: branchSlug } = await searchParams;
  const resolved = await resolveQueuePage(slug, branchSlug ?? null);

  if (!resolved.ok) {
    // No merchant → no social links; Powered by only.
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen auth-screen">
          <div className="auth-card">
            <div className="auth-head">
              <h2 className="auth-title">Shop not found</h2>
              <p className="auth-sub">This queue link is invalid or has been removed.</p>
            </div>
          </div>
          <FroqFooter />
        </div>
      </div>
    );
  }

  const { merchant, initialTicket } = resolved;

  return (
    <>
      <BrandThemeStyle color={merchant.brandColor} />
      <QueueJoinScreen
        slug={merchant.slug}
        branchSlug={branchSlug ?? null}
        businessName={merchant.businessName}
        brandColor={merchant.brandColor}
        logoUrl={merchant.logoUrl}
        banner={merchant.banner}
        bannerLink={merchant.bannerLink}
        phone={merchant.phone}
        address={merchant.address}
        googleMapsUrl={merchant.googleMapsUrl}
        socialLinks={merchant.socialLinks}
        joinGate={merchant.joinGate}
        aiMenuEnabled={merchant.aiMenuEnabled}
        initialTicket={initialTicket}
      />
    </>
  );
}
