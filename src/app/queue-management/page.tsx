import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PricingTable } from "@/components/landing/pricing-table";
import { SiteShell } from "@/components/landing/site-shell";
import { SupportChat } from "@/components/landing/support-chat";

export const metadata: Metadata = {
  title: "Queue Management — Froq",
  description:
    "A live digital waitlist for your entrance. Guests join by scanning a QR code and get a WhatsApp alert when their table is ready.",
};

export default function QueueManagementPage() {
  return (
    <>
      <SiteShell>
        <section className="lp-picker">
          <span className="lp-eyebrow">
            <Users size={13} strokeWidth={2.4} />
            Live waitlists
          </span>
          <h1 className="lp-picker-title">Queue Management</h1>
          <p className="lp-picker-sub">
            Guests scan to join your waitlist, wait wherever they like, and get a WhatsApp
            alert the moment their table is ready.
          </p>
        </section>

        <section className="lp-section lp-pricing-wrap" id="pricing">
          <PricingTable
            product="queue"
            title="Queue Management pricing"
            subtitle="Start with a 7-day free trial. No credit card required. Cancel anytime."
          />
        </section>
      </SiteShell>
      <SupportChat />
    </>
  );
}
