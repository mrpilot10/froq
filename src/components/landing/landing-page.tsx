import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, QrCode, Stamp, Users } from "lucide-react";
import { PricingTable } from "./pricing-table";
import { FroqFooter } from "@/components/shared/froq-footer";

const FEATURES = [
  {
    Icon: BarChart3,
    title: "Customer LTV",
    desc: "See lifetime value in your dashboard and on every customer profile.",
  },
  {
    Icon: Stamp,
    title: "Stamp approvals",
    desc: "Review requests from your phone and approve stamps in one tap.",
  },
  {
    Icon: QrCode,
    title: "QR join",
    desc: "Customers scan your shop QR to join — no app download required.",
  },
  {
    Icon: Users,
    title: "Your customers",
    desc: "Sort, export, and manage your loyalty members from one place.",
  },
];

export function LandingPage() {
  return (
    <div className="landing-page merchant-theme">
      <div className="landing-screen">
        <header className="landing-header">
          <div className="landing-brand">
            <Image src="/froq-logo.png" alt="Froq" width={36} height={36} priority />
            <span className="landing-brand-name">Froq</span>
          </div>
          <div className="landing-header-actions">
            <Link href="#pricing" className="landing-login-link">
              Pricing
            </Link>
            <a
              href="https://froq.tawk.help/"
              target="_blank"
              rel="noopener noreferrer"
              className="landing-login-link"
            >
              Help
            </a>
            <Link href="/merchant" className="landing-login-link">
              Log in
            </Link>
          </div>
        </header>

        <section className="landing-hero">
          <div className="landing-hero-badge">For local businesses</div>
          <h1 className="landing-hero-title">
            Loyalty that shows you what each customer is worth
          </h1>
          <p className="landing-hero-sub">
            Run stamps, rewards, and approvals from one dashboard. Track lifetime value,
            approve stamps on the go, and grow repeat visits.
          </p>
          <Link href="#pricing" className="cta-btn merchant-cta-accent landing-hero-cta">
            View plans
            <ArrowRight size={17} strokeWidth={2.4} />
          </Link>
          <p className="landing-hero-note">
            New accounts are created at checkout · Store setup starts after payment.
          </p>
        </section>

        <PricingTable />

        <section className="landing-features">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="panel-card landing-feature-card">
              <div className="landing-feature-icon">
                <Icon size={20} strokeWidth={2.2} />
              </div>
              <h2 className="landing-feature-title">{title}</h2>
              <p className="landing-feature-desc">{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-cta-block">
          <div className="panel-card landing-cta-card">
            <h2 className="landing-cta-title">Already on Froq?</h2>
            <p className="landing-cta-sub">
              Log in with your registered business number to manage your store.
            </p>
            <Link href="/merchant" className="cta-btn merchant-cta-accent landing-cta-btn">
              Business log in
            </Link>
          </div>
        </section>

        <FroqFooter className="landing-footer" />
      </div>
    </div>
  );
}
