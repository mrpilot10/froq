import type { Metadata } from "next";
import { ShopCardGate } from "@/components/auth/shop-card-gate";

export const metadata: Metadata = {
  title: "Your loyalty card — Froq",
  description: "Collect stamps and unlock rewards at your favourite local shop.",
};

export default async function ShopCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShopCardGate slug={slug} />;
}
