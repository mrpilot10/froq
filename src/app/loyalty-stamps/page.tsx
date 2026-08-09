import type { Metadata } from "next";
import { LoyaltyLandingPage } from "@/components/landing/loyalty-landing-page";

export const metadata: Metadata = {
  title: "Loyalty Stamps — Froq",
  description:
    "Digital stamp cards guests collect with a QR scan — no app to download. Rewards that bring customers back, from one dashboard.",
};

export default function LoyaltyStampsPage() {
  return <LoyaltyLandingPage />;
}
