import type { Metadata } from "next";
import { ProductPicker } from "@/components/landing/product-picker";
import { SupportChat } from "@/components/landing/support-chat";

export const metadata: Metadata = {
  title: "Froq — Loyalty and queue tools for local businesses",
  description:
    "Digital stamp cards and live waitlists for shops, cafés, and restaurants. Run loyalty and queue management from one dashboard.",
};

export default function Home() {
  return (
    <>
      <ProductPicker />
      <SupportChat />
    </>
  );
}
