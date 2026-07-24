import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { QueueJoinScreen } from "@/components/queue/queue-join-screen";
import { FroqFooter } from "@/components/shared/froq-footer";

export const metadata: Metadata = {
  title: "Join the queue — Froq",
  description: "Add yourself to the waitlist and we'll text you when your table is ready.",
};

export default async function QueueJoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const merchant = await (async () => {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("merchants")
        .select("business_name, brand_color, logo_url, slug, queue_banner, queue_banner_link")
        .eq("slug", slug)
        .maybeSingle();
      return data;
    } catch {
      return null;
    }
  })();

  if (!merchant) {
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

  return (
    <QueueJoinScreen
      slug={merchant.slug}
      businessName={merchant.business_name}
      brandColor={merchant.brand_color}
      logoUrl={merchant.logo_url}
      banner={merchant.queue_banner ?? ""}
      bannerLink={merchant.queue_banner_link ?? ""}
    />
  );
}
