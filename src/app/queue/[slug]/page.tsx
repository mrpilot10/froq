import type { Metadata } from "next";
import { resolveQueuePage } from "@/app/queue/actions";
import { QueueJoinScreen } from "@/components/queue/queue-join-screen";
import { FroqFooter } from "@/components/shared/froq-footer";

export const metadata: Metadata = {
  title: "Join the queue — Froq",
  description: "Add yourself to the waitlist and we'll text you when your table is ready.",
};

export default async function QueueJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveQueuePage(slug);

  if (!resolved.ok) {
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
    <QueueJoinScreen
      slug={merchant.slug}
      businessName={merchant.businessName}
      brandColor={merchant.brandColor}
      logoUrl={merchant.logoUrl}
      banner={merchant.banner}
      bannerLink={merchant.bannerLink}
      aiMenuEnabled={merchant.aiMenuEnabled}
      initialTicket={initialTicket}
    />
  );
}
