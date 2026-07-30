import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { SupportChat } from "@/components/landing/support-chat";

export const metadata: Metadata = {
  title: "Loyalty Stamps — Froq",
  description:
    "Run digital stamps and rewards from one dashboard. Built for shops, cafés, and local brands.",
};

export default function LoyaltyStampsPage() {
  return (
    <>
      <LandingPage />
      <SupportChat />
    </>
  );
}
