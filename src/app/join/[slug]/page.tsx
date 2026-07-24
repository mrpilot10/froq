import { createClient } from "@/lib/supabase/server";
import { JoinScreen } from "@/components/loyalty/join-screen";
import { FroqFooter } from "@/components/shared/froq-footer";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ b?: string; next?: string }>;
}) {
  const { slug } = await params;
  const { b: branchSlug, next } = await searchParams;
  const nextPath =
    typeof next === "string" && next.startsWith("/c/") ? next : null;

  const merchant = await (async () => {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("merchants")
        .select(
          "business_name, brand_color, logo_url, reward_title, reward_name, total_stamps, slug",
        )
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
              <p className="auth-sub">This loyalty link is invalid or has been removed.</p>
            </div>
          </div>
          <FroqFooter />
        </div>
      </div>
    );
  }

  return (
    <JoinScreen
      slug={merchant.slug}
      branchSlug={branchSlug ?? null}
      businessName={merchant.business_name}
      rewardTitle={merchant.reward_title}
      rewardName={merchant.reward_name}
      totalStamps={merchant.total_stamps}
      brandColor={merchant.brand_color}
      logoUrl={merchant.logo_url}
      nextPath={nextPath}
    />
  );
}
