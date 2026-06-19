import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Froq — Loyalty for local businesses",
  description:
    "Run digital stamps, rewards, and customer lifetime value from one dashboard. Built for shops, cafés, and local brands.",
};

export default function Home() {
  return <LandingPage />;
}
