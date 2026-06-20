"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Database,
  Gauge,
  Infinity as InfinityIcon,
  LayoutDashboard,
  QrCode,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { FroqFooter } from "@/components/shared/froq-footer";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { CustomerJourney } from "./customer-journey";
import { RevenueCalculator } from "./revenue-calculator";
import { ExperienceTabs } from "./experience-tabs";
import { BusinessTypes } from "./business-types";
import { FaqAccordion } from "./faq-accordion";
import {
  FloatingStat,
  GrowthChartMockup,
  LoyaltyPhoneMockup,
  MerchantDashboardMockup,
  QrOnboardingMockup,
} from "./product-mockups";

const FEATURES = [
  { Icon: QrCode, title: "QR Code Enrollment", desc: "Customers join in seconds." },
  { Icon: Sparkles, title: "Reward Engine", desc: "Create offers customers actually care about." },
  { Icon: Database, title: "Customer Database", desc: "Know how many customers are returning." },
  { Icon: LayoutDashboard, title: "Merchant Dashboard", desc: "Everything in one place." },
  { Icon: Zap, title: "Instant Setup", desc: "No technical knowledge required." },
  { Icon: InfinityIcon, title: "Unlimited Customers", desc: "Grow without restrictions." },
  { Icon: Smartphone, title: "Mobile Friendly", desc: "Works beautifully on any phone." },
  { Icon: BarChart3, title: "Business Insights", desc: "Understand how your loyalty program performs." },
];

export function LandingPage() {
  return (
    <div className="lp merchant-theme">
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-nav-brand">
            <Image src="/froq-logo.png" alt="Froq" width={32} height={32} priority />
            <span>Froq</span>
          </div>
          <nav className="lp-nav-links">
            <a href="#how" className="lp-nav-link">How it works</a>
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="https://froq.tawk.help/" target="_blank" rel="noopener noreferrer" className="lp-nav-link">
              Help
            </a>
          </nav>
          <div className="lp-nav-actions">
            <Link href="/merchant" className="lp-nav-login">Log in</Link>
            <a href="#pricing" className="lp-btn lp-btn--accent lp-nav-cta">Get Started</a>
          </div>
        </div>
      </header>

      <main className="lp-main">
        {/* ── HERO ───────────────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <Sparkles size={13} strokeWidth={2.4} />
              Repeat customer marketing
            </span>
            <h1 className="lp-hero-title">The Easiest Way To Get More Repeat Customers</h1>
            <p className="lp-hero-lead">Most customers visit once and never return.</p>
            <p className="lp-hero-sub">
              Froq helps local businesses turn first-time visitors into regular customers with a
              simple scan at checkout.
            </p>
            <ul className="lp-hero-bullets">
              <li>No apps to build.</li>
              <li>No complicated software.</li>
              <li>Just more customers coming back.</li>
            </ul>
            <div className="lp-hero-actions">
              <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg">
                Get Started
                <ArrowRight size={18} strokeWidth={2.4} />
              </a>
            </div>
            <ul className="lp-trust">
              <li>Setup in 5 minutes</li>
              <li>Works for any local business</li>
              <li>7-Day Money Back Guarantee</li>
            </ul>
          </div>

          <div className="lp-hero-visual">
            <div className="lp-hero-glow" aria-hidden="true" />
            <div className="lp-hero-stage">
              <LoyaltyPhoneMockup />
              <FloatingStat
                className="lp-float-a"
                icon={<Sparkles size={14} strokeWidth={2.4} />}
                label="Reward unlocked"
                value="Free coffee"
              />
              <FloatingStat
                className="lp-float-b"
                label="Repeat visits"
                value="+38%"
                trend="this month"
              />
              <FloatingStat
                className="lp-float-c"
                icon={<QrCode size={14} strokeWidth={2.4} />}
                label="QR scanned"
                value="642 today"
              />
            </div>
          </div>
        </section>

        {/* ── INTERACTIVE #1: JOURNEY ───────────────────────────────── */}
        <section className="lp-section" id="how">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">The journey</span>
            <h2 className="lp-h2">What Happens After A Customer Leaves?</h2>
          </Reveal>

          <Reveal delay={80}>
            <CustomerJourney />
          </Reveal>

          <div className="lp-compare">
            <Reveal className="lp-compare-card lp-compare-card--bad" delay={40}>
              <span className="lp-compare-tag">Most businesses</span>
              <p className="lp-compare-flow">Customer visits → Leaves → Forgets about you.</p>
            </Reveal>
            <Reveal className="lp-compare-card lp-compare-card--good" delay={120}>
              <span className="lp-compare-tag lp-compare-tag--good">With Froq</span>
              <p className="lp-compare-flow">
                Customer visits → Scans → Joins → Returns → Earns rewards → Returns again.
              </p>
            </Reveal>
          </div>
          <Reveal className="lp-section-tail" delay={60}>
            <p>
              The difference? <strong>A reason to come back.</strong>
            </p>
          </Reveal>
        </section>

        {/* ── PROBLEM ───────────────────────────────────────────────── */}
        <section className="lp-section lp-section--problem">
          <div className="lp-problem">
            <Reveal className="lp-problem-copy">
              <span className="lp-kicker">The problem</span>
              <h2 className="lp-h2">You&apos;re Spending Money On The Wrong Thing</h2>
              <p className="lp-body">Most businesses focus entirely on getting new customers.</p>
              <div className="lp-problem-chips">
                {["Facebook ads", "Google ads", "Discount campaigns", "Influencer promotions"].map(
                  (chip) => (
                    <span key={chip} className="lp-problem-chip">{chip}</span>
                  ),
                )}
              </div>
              <p className="lp-body">
                Getting a new customer is expensive. Getting an existing customer to return is far
                easier. Yet most businesses have no system to encourage repeat visits.
              </p>
              <p className="lp-body lp-body--muted">
                Customers buy once. Then disappear. Without repeat customers, growth becomes an
                endless cycle of spending more money on marketing.
              </p>
            </Reveal>

            <Reveal className="lp-problem-visual" delay={100}>
              <div className="lp-leak-card">
                <div className="lp-leak-head">
                  <span className="lp-leak-title">Cost to acquire</span>
                  <span className="lp-leak-bad">High</span>
                </div>
                <div className="lp-leak-bars">
                  <div className="lp-leak-bar">
                    <span className="lp-leak-bar-label">New customer</span>
                    <span className="lp-leak-bar-track">
                      <span className="lp-leak-bar-fill lp-leak-bar-fill--bad" style={{ width: "92%" }} />
                    </span>
                    <span className="lp-leak-bar-val">₹350</span>
                  </div>
                  <div className="lp-leak-bar">
                    <span className="lp-leak-bar-label">Repeat visit</span>
                    <span className="lp-leak-bar-track">
                      <span className="lp-leak-bar-fill lp-leak-bar-fill--good" style={{ width: "22%" }} />
                    </span>
                    <span className="lp-leak-bar-val">₹40</span>
                  </div>
                </div>
                <p className="lp-leak-note">Repeat customers cost a fraction to bring back.</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── REVENUE CALCULATOR ────────────────────────────────────── */}
        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Revenue impact</span>
            <h2 className="lp-h2">See What Repeat Visits Are Worth</h2>
          </Reveal>
          <Reveal delay={60}>
            <RevenueCalculator />
          </Reveal>
        </section>

        {/* ── SOLUTION ──────────────────────────────────────────────── */}
        <section className="lp-section lp-section--solution">
          <div className="lp-solution">
            <Reveal className="lp-solution-copy">
              <span className="lp-kicker">The solution</span>
              <h2 className="lp-h2">Meet Froq</h2>
              <p className="lp-body">
                Froq helps businesses create a simple rewards experience customers actually use.
              </p>
              <ol className="lp-solution-steps">
                <li><span>1</span>Place a QR code at your counter.</li>
                <li><span>2</span>Customers scan once.</li>
                <li><span>3</span>They&apos;re now part of your loyalty program.</li>
                <li><span>4</span>Every future visit moves them closer to rewards.</li>
              </ol>
              <p className="lp-body lp-body--muted">
                No paper cards. No complicated setup. No learning curve for customers. Just a simple
                reason to return.
              </p>
            </Reveal>
            <Reveal className="lp-solution-visual" delay={100}>
              <div className="lp-qr-stage">
                <QrOnboardingMockup />
                <FloatingStat
                  className="lp-float-qr"
                  icon={<Sparkles size={14} strokeWidth={2.4} />}
                  label="Joined"
                  value="In 1 scan"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── INTERACTIVE #2: EXPERIENCE TABS ───────────────────────── */}
        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">One platform</span>
            <h2 className="lp-h2">Built For Customers, Merchants &amp; Growth</h2>
          </Reveal>
          <Reveal delay={60}>
            <ExperienceTabs />
          </Reveal>
        </section>

        {/* ── DASHBOARD SHOWCASE ────────────────────────────────────── */}
        <section className="lp-section lp-section--showcase">
          <div className="lp-showcase">
            <Reveal className="lp-showcase-copy">
              <span className="lp-kicker">Merchant dashboard</span>
              <h2 className="lp-h2">Watch Repeat Customers Grow In Real Time</h2>
              <p className="lp-body">
                Every scan, stamp, and redemption updates your dashboard instantly — so you always
                know how many customers are coming back.
              </p>
            </Reveal>
            <Reveal className="lp-showcase-visual" delay={80}>
              <div className="lp-showcase-stage">
                <MerchantDashboardMockup />
                <div className="lp-showcase-side">
                  <GrowthChartMockup />
                  <FloatingStat
                    label="Customer growth"
                    value="2.4× repeat rate"
                    trend="6 months"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── FEATURE SHOWCASE ──────────────────────────────────────── */}
        <section className="lp-section" id="features">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Features</span>
            <h2 className="lp-h2">Everything Needed To Increase Repeat Customers</h2>
          </Reveal>
          <div className="lp-features">
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <Reveal key={title} className="lp-feature" delay={i * 50}>
                <span className="lp-feature-icon">
                  <Icon size={18} strokeWidth={2.3} />
                </span>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-desc">{desc}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── SOCIAL PROOF: IMAGINE THIS ────────────────────────────── */}
        <section className="lp-section lp-section--imagine">
          <Reveal className="lp-imagine">
            <span className="lp-kicker lp-kicker--on-dark">Imagine this</span>
            <div className="lp-imagine-story">
              <p>A customer visits your cafe. They enjoy their coffee. They leave.</p>
              <p>Two weeks later they&apos;re deciding where to go.</p>
              <div className="lp-imagine-split">
                <div className="lp-imagine-choice lp-imagine-choice--forgotten">
                  <Gauge size={18} strokeWidth={2.2} />
                  <span className="lp-imagine-choice-label">One business</span>
                  <span className="lp-imagine-choice-state">is forgotten</span>
                </div>
                <div className="lp-imagine-vs">vs</div>
                <div className="lp-imagine-choice lp-imagine-choice--reward">
                  <Sparkles size={18} strokeWidth={2.2} />
                  <span className="lp-imagine-choice-label">The other</span>
                  <span className="lp-imagine-choice-state">offers a reward</span>
                </div>
              </div>
              <p className="lp-imagine-q">Which one do they choose?</p>
              <p className="lp-imagine-tail">That&apos;s the power of repeat customer marketing.</p>
            </div>
          </Reveal>
        </section>

        {/* ── WHO USES FROQ ─────────────────────────────────────────── */}
        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Who uses Froq</span>
            <h2 className="lp-h2">Built For Every Local Business</h2>
            <p className="lp-section-lead">Tap a business to preview its loyalty program.</p>
          </Reveal>
          <Reveal delay={60}>
            <BusinessTypes />
          </Reveal>
        </section>

        {/* ── PRICING ───────────────────────────────────────────────── */}
        <section className="lp-section lp-pricing-wrap" id="pricing">
          <PricingTable />
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────── */}
        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">FAQ</span>
            <h2 className="lp-h2">Questions, Answered</h2>
          </Reveal>
          <Reveal delay={60}>
            <FaqAccordion />
          </Reveal>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────────── */}
        <section className="lp-section lp-section--final">
          <Reveal className="lp-final">
            <div className="lp-final-glow" aria-hidden="true" />
            <h2 className="lp-final-title">Your Next Customer Shouldn&apos;t Be Their Last Visit</h2>
            <p className="lp-final-sub">
              Every customer who walks through your door is an opportunity for future revenue. Give
              them a reason to come back.
            </p>
            <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg">
              Get Started
              <ArrowRight size={18} strokeWidth={2.4} />
            </a>
            <p className="lp-final-note">7-Day Money Back Guarantee</p>
          </Reveal>
        </section>

        <FroqFooter className="lp-footer" />
      </main>
    </div>
  );
}
