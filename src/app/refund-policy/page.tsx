import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

export const metadata: Metadata = {
  title: "Refund Policy · Froq",
  description: "Froq’s 7-day money-back guarantee for first-time subscriptions.",
};

export default function RefundPolicyPage() {
  return (
    <SiteShell>
      <section className="lp-legal">
        <span className="lp-kicker">Policies</span>
        <h1 className="lp-h2">Refund Policy</h1>
        <p>
          First-time subscriptions include a <strong>7-day money-back guarantee</strong>. If Froq
          isn&apos;t right for you, request a refund within seven days of your first payment via{" "}
          <Link href="/help/ticket">Help</Link>.
        </p>
        <p>
          Renewals are generally outside the guarantee. You can cancel anytime to stop future
          renewals and keep access until the end of the paid period.
        </p>
      </section>
    </SiteShell>
  );
}
