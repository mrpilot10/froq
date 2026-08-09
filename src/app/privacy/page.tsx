import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/landing/site-shell";

export const metadata: Metadata = {
  title: "Privacy Policy · Froq",
  description: "How Froq collects, uses, and protects information.",
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <section className="lp-legal">
        <span className="lp-kicker">Policies</span>
        <h1 className="lp-h2">Privacy Policy</h1>
        <p>
          Froq processes merchant and guest information to run Loyalty Stamps, Smart Queue, and AI
          Digital Menu. We use data to deliver the product, send service messages, and improve
          reliability — not to sell personal data.
        </p>
        <p>
          This page is a short placeholder while the full policy is finalized. For questions, email{" "}
          <a href="mailto:hello@froq.io">hello@froq.io</a> or visit{" "}
          <Link href="/help">Help</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
