import type { Metadata } from "next";
import { CheckoutExperience } from "@/components/landing/checkout-experience";
import { getPlanById } from "@/lib/merchant/pricing";

export const metadata: Metadata = {
  title: "Checkout — Froq",
  description: "Create your Froq business account and subscribe to a loyalty plan.",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planId } = await searchParams;
  const plan = getPlanById(planId ?? "growth");

  return <CheckoutExperience plan={plan} />;
}
