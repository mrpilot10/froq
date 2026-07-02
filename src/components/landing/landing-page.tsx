"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Database,
  Infinity as InfinityIcon,
  LayoutDashboard,
  Megaphone,
  Percent,
  QrCode,
  Search,
  Smartphone,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FroqFooter } from "@/components/shared/froq-footer";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { HowItWorks } from "./how-it-works";
import { ImagineScenario } from "./imagine-scenario";
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

const SPEND_CHANNELS: { Icon: LucideIcon; label: string }[] = [
  { Icon: ThumbsUp, label: "Facebook ads" },
  { Icon: Search, label: "Google ads" },
  { Icon: Percent, label: "Discount campaigns" },
  { Icon: Megaphone, label: "Influencer promotions" },
];

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

        {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
        <section className="lp-section" id="how">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">How it works</span>
            <h2 className="lp-h2">Repeat Customers In Three Simple Steps</h2>
            <p className="lp-section-lead">
              No paper cards, no app downloads — just a simple reason for customers to come back.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <HowItWorks />
          </Reveal>
        </section>

        {/* ── PROBLEM ───────────────────────────────────────────────── */}
        <section className="lp-section lp-section--problem">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">The problem</span>
            <h2 className="lp-h2">You&apos;re Spending Money On The Wrong Thing</h2>
            <p className="lp-section-lead">
              Most businesses pour their budget into chasing new customers — and ignore the ones
              they already have.
            </p>
          </Reveal>

          <div className="lp-prob-grid">
            <Reveal className="lp-prob-card lp-prob-card--spend" delay={40}>
              <div className="lp-prob-card-head">
                <span className="lp-prob-card-icon">
                  <Wallet size={18} strokeWidth={2.1} />
                </span>
                <div className="lp-prob-card-heading">
                  <span className="lp-prob-card-title">Where the budget goes</span>
                  <span className="lp-prob-card-sub">Spend, every month</span>
                </div>
              </div>
              <ul className="lp-spend-list">
                {SPEND_CHANNELS.map(({ Icon, label }) => (
                  <li key={label} className="lp-spend-item">
                    <span className="lp-spend-ico">
                      <Icon size={15} strokeWidth={2.1} />
                    </span>
                    <span className="lp-spend-name">{label}</span>
                    <span className="lp-spend-out">
                      <ArrowUpRight size={14} strokeWidth={2.6} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="lp-prob-note">
                All chasing first-time visitors — none of it brings them back.
              </p>
            </Reveal>

            <Reveal className="lp-prob-card lp-prob-card--cost" delay={120}>
              <div className="lp-cost-head">
                <span className="lp-cost-eyebrow">Cost per customer</span>
                <span className="lp-cost-badge">
                  <TrendingDown size={14} strokeWidth={2.6} />
                  9× cheaper to return
                </span>
              </div>
              <div className="lp-cost-rows">
                <div className="lp-cost-row">
                  <div className="lp-cost-row-head">
                    <span className="lp-cost-label">New customer</span>
                    <span className="lp-cost-val lp-cost-val--bad">₹350</span>
                  </div>
                  <span className="lp-cost-track">
                    <span className="lp-cost-fill lp-cost-fill--bad" style={{ width: "92%" }} />
                  </span>
                </div>
                <div className="lp-cost-row">
                  <div className="lp-cost-row-head">
                    <span className="lp-cost-label">Repeat visit</span>
                    <span className="lp-cost-val lp-cost-val--good">₹40</span>
                  </div>
                  <span className="lp-cost-track">
                    <span className="lp-cost-fill lp-cost-fill--good" style={{ width: "22%" }} />
                  </span>
                </div>
              </div>
              <p className="lp-prob-note">Cost to acquire vs. cost to bring back.</p>
            </Reveal>

            <Reveal className="lp-prob-card lp-prob-card--insight" delay={80}>
              <p className="lp-prob-insight">
                Getting a new customer is <strong>expensive</strong>. Bringing an existing one back
                is <strong>far easier</strong> — yet most businesses have <strong>no system</strong>{" "}
                to make it happen.
              </p>
              <p className="lp-prob-insight-sub">
                Customers buy once, then disappear. Without repeat visits, growth becomes an endless
                cycle of spending more on marketing.
              </p>
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
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Imagine this</span>
            <h2 className="lp-h2">Every Customer Chooses Where To Return</h2>
          </Reveal>
          <Reveal delay={60}>
            <ImagineScenario />
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
