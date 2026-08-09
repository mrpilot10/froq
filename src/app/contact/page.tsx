import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

export const metadata: Metadata = {
  title: "Contact us · Froq",
  description: "Get in touch with the Froq team.",
};

export default function ContactPage() {
  return (
    <SiteShell>
      <section className="lp-legal">
        <span className="lp-kicker">Contact</span>
        <h1 className="lp-h2">Contact us</h1>
        <p>
          Questions about product, pricing, or onboarding? Reach us at{" "}
          <a href="mailto:hello@froq.io">hello@froq.io</a>.
        </p>
        <p>
          For account or billing help, open a ticket from{" "}
          <Link href="/help/ticket">Help</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
