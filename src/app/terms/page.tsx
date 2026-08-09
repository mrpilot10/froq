import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

export const metadata: Metadata = {
  title: "Terms of Service · Froq",
  description: "Terms that govern use of Froq products and services.",
};

export default function TermsPage() {
  return (
    <SiteShell>
      <section className="lp-legal">
        <span className="lp-kicker">Policies</span>
        <h1 className="lp-h2">Terms of Service</h1>
        <p>
          By using Froq you agree to use the products lawfully, keep account credentials secure, and
          pay for subscribed plans according to the pricing shown at checkout.
        </p>
        <p>
          This page is a short placeholder while the full terms are finalized. See also our{" "}
          <Link href="/refund-policy">Refund Policy</Link> and{" "}
          <Link href="/help">Help</Link> centre.
        </p>
      </section>
    </SiteShell>
  );
}
