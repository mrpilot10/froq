import type { Metadata } from "next";
import { ShopCardGate } from "@/components/auth/shop-card-gate";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your loyalty card — Froq",
  description: "Collect stamps and unlock rewards at your favourite local shop.",
};

export default async function ShopCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Fetch just the brand color up-front so the loading skeleton can render in
  // the merchant's brand immediately (no flash once the full card loads).
  let brandColor: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("merchants")
      .select("brand_color")
      .eq("slug", slug)
      .maybeSingle();
    brandColor = data?.brand_color ?? undefined;
  } catch {
    brandColor = undefined;
  }

  return <ShopCardGate slug={slug} brandColor={brandColor} />;
}
