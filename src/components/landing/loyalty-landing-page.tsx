"use client";

import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Gift,
  Plus,
  QrCode,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { SiteShell } from "./site-shell";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";
import { LoyaltyHeroVisual } from "./product-mockups";
import {
  LoyaltyCapabilities,
  LoyaltyScanSpotlight,
  LoyaltySetupSpotlight,
} from "./loyalty-capabilities";
import { LoyaltyLiveEmbed } from "./loyalty-live-embed";
import { MenuTrustBar } from "./menu-trust-bar";
import { MenuVenues } from "./menu-venues";

const HOW_STEPS = [
  {
    id: "qr",
    title: "Place a QR",
    desc: "Put your Froq QR on the counter or receipt. Guests scan once — no app install.",
  },
  {
    id: "join",
    title: "Guests join",
    desc: "They open a digital stamp card in the browser and become part of your loyalty program.",
  },
  {
    id: "collect",
    title: "Collect",
    desc: "Every visit adds a stamp. Progress stays on their phone so they know how close they are.",
  },
  {
    id: "return",
    title: "They return",
    desc: "Rewards give first-timers a real reason to come back — and turn them into regulars.",
  },
] as const;

function HowStepVisual({ id }: { id: (typeof HOW_STEPS)[number]["id"] }) {
  if (id === "qr") {
    return (
      <div className="am-how-illu am-how-illu--live" aria-hidden="true">
        <span className="am-how-qr">
          <i />
          <i />
          <i />
          <i />
          <span className="am-how-qr-scan" />
        </span>
      </div>
    );
  }
  if (id === "join") {
    return (
      <div className="am-how-illu ls-how-illu--join" aria-hidden="true">
        <span className="ls-how-phone">
          <QrCode size={22} strokeWidth={2} />
        </span>
        <span className="ls-how-chip">Joined</span>
      </div>
    );
  }
  if (id === "collect") {
    return (
      <div className="am-how-illu am-how-illu--grow" aria-hidden="true">
        <span className="am-how-stamps">
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i />
          <i />
        </span>
      </div>
    );
  }
  return (
    <div className="am-how-illu ls-how-illu--return" aria-hidden="true">
      <span className="ls-how-gift">
        <Gift size={22} strokeWidth={2.2} />
      </span>
      <span className="am-how-grow-chip">Free</span>
    </div>
  );
}

function LoyaltyHowItWorks() {
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.15 });
  return (
    <ol ref={ref} className={`am-how${inView ? " is-in" : ""}`}>
      {HOW_STEPS.map(({ id, title, desc }, i) => (
        <li key={id} className="am-how-step" style={{ "--i": i } as CSSProperties}>
          <HowStepVisual id={id} />
          <span className="am-how-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="am-how-title">{title}</span>
          <span className="am-how-desc">{desc}</span>
          {i < HOW_STEPS.length - 1 ? (
            <span className="am-how-arrow" aria-hidden="true">
              <ArrowRight size={16} strokeWidth={2.4} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const TESTIMONIALS = [
  {
    quote:
      "We dropped plastic cards. Guests scan once and keep coming back for the free coffee — stamps just work.",
    name: "Meera Shah",
    initials: "MS",
    role: "Owner, Bloom Counter",
    place: "Ahmedabad",
  },
  {
    quote:
      "Setup took an afternoon. Now we can see who is returning without chasing spreadsheets after close.",
    name: "Dev Patel",
    initials: "DP",
    role: "Ops, Crumb & Co.",
    place: "Surat",
  },
  {
    quote:
      "The reward is simple and guests actually remember it. Repeat visits are up without running loud discounts.",
    name: "Sana Kapoor",
    initials: "SK",
    role: "Founder, Salt Studio",
    place: "Delhi",
  },
];

const FAQS = [
  {
    q: "Do customers need an app?",
    a: "No. Guests scan your QR and open their stamp card in the phone browser. Nothing to download.",
  },
  {
    q: "How fast can we go live?",
    a: "Most businesses set a reward, stamp goal, and QR in a few minutes. Print or show the code at checkout and start collecting the same day.",
  },
  {
    q: "Can I customize rewards?",
    a: "Yes. Choose the reward, how many stamps unlock it, and your branding so the pass matches your shop.",
  },
  {
    q: "What businesses is this for?",
    a: "Any local business that wants repeat visits — cafés, restaurants, bakeries, salons, retail, and more.",
  },
  {
    q: "Is there a contract?",
    a: "No. Choose monthly or yearly billing and cancel when you want.",
  },
  {
    q: "What if it isn’t right for us?",
    a: "Try it with confidence. You’re covered by our 7-Day Money Back Guarantee.",
  },
];

function LoyaltyFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp-faq am-faq">
      {FAQS.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div key={faq.q} className={`lp-faq-item${isOpen ? " lp-faq-item--open" : ""}`}>
            <button
              type="button"
              className="lp-faq-q"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{faq.q}</span>
              <span className="lp-faq-icon">
                <Plus size={16} strokeWidth={2.6} />
              </span>
            </button>
            <div className="lp-faq-a" hidden={!isOpen}>
              <p>{faq.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LoyaltyLandingPage() {
  return (
    <SiteShell>
      <div className="am-landing ls-landing">
        <section className="lp-hero am-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <Stamp size={13} strokeWidth={2.4} />
              Digital Loyalty Stamps
            </span>
            <h1 className="lp-hero-title">
              Turn First Visits Into Customers Who Come Back.
            </h1>
            <p className="am-hero-sub">
              Run digital stamp cards from a QR at your counter — guests collect on every visit and
              unlock rewards without downloading an app.
            </p>
            <p className="am-hero-desc">
              Froq replaces plastic punches and forgotten loyalty schemes with a pass that lives on
              the phone. You track stamps, rewards, and returning guests from one dashboard.
            </p>
            <div className="am-hero-actions">
              <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg am-hero-cta">
                Get started
                <span className="am-hero-cta-price">₹299/mo</span>
                <ArrowRight size={20} strokeWidth={2.4} />
              </a>
              <a href="#try" className="lp-btn am-btn-ghost lp-btn--lg">
                Try a stamp card
              </a>
            </div>
          </div>

          <LoyaltyHeroVisual />
        </section>

        <Reveal className="am-trust-wrap">
          <MenuTrustBar />
        </Reveal>

        <section className="lp-section am-try" id="try">
          <Reveal className="lp-section-head">
            <span className="lp-kicker am-try-kicker">
              <i aria-hidden="true" />
              Live demo
            </span>
            <h2 className="lp-h2">Go ahead. Try the stamp card.</h2>
            <p className="lp-section-lead">
              Open a real Froq loyalty pass, see stamps fill, and feel the same experience guests
              get after checkout.
            </p>
          </Reveal>
          <Reveal delay={60}>
            <LoyaltyLiveEmbed />
          </Reveal>
        </section>

        <section className="lp-section" id="guest">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Guest experience</span>
            <h2 className="lp-h2">A loyalty card that stays on their phone</h2>
          </Reveal>
          <Reveal delay={60}>
            <LoyaltyScanSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="setup">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Merchant setup</span>
            <h2 className="lp-h2">Your program. Your reward. Live today.</h2>
          </Reveal>
          <Reveal delay={60}>
            <LoyaltySetupSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="how">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">How it works</span>
            <h2 className="lp-h2">From counter QR to repeat visits</h2>
            <p className="lp-section-lead">
              No paper cards, no app downloads — just a simple reason for customers to come back.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <LoyaltyHowItWorks />
          </Reveal>
        </section>

        <section className="lp-section" id="features">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Capabilities</span>
            <h2 className="lp-h2">Built for enrollment, rewards and return visits</h2>
            <p className="lp-section-lead">
              Everything that turns a one-time visit into a habit — without another app for your
              customers.
            </p>
          </Reveal>
          <LoyaltyCapabilities />
        </section>

        <section className="lp-section lp-section--testimonials" id="stories">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Testimonials</span>
            <h2 className="lp-h2">Local businesses are already bringing guests back</h2>
          </Reveal>
          <div className="am-quotes">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} className="am-quote" delay={i * 70}>
                <span className="am-quote-mark" aria-hidden="true">
                  &rdquo;
                </span>
                <p className="am-quote-text">{t.quote}</p>
                <div className="am-quote-meta">
                  <span className="am-quote-avatar" aria-hidden="true">
                    {t.initials}
                  </span>
                  <span className="am-quote-who">
                    <strong>{t.name}</strong>
                    <em>
                      {t.role} · {t.place}
                    </em>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="lp-section lp-pricing-wrap" id="pricing">
          <PricingTable
            product="loyalty"
            title="Simple pricing. No surprises."
            subtitle="Start small. Grow when you need to."
          />
          <p className="am-pricing-guarantee">
            <ShieldCheck size={16} strokeWidth={2.3} aria-hidden="true" />
            <span>
              <strong>7-day money-back guarantee</strong>
              on first-time subscriptions. Cancel anytime.
            </span>
          </p>
        </section>

        <section className="lp-section" id="venues">
          <MenuVenues
            kicker="Works for"
            title="Built for every local business that wants return visits."
          />
        </section>

        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">FAQ</span>
            <h2 className="lp-h2">Questions, answered</h2>
          </Reveal>
          <Reveal delay={60}>
            <LoyaltyFaq />
          </Reveal>
        </section>

        <section className="lp-section lp-section--final">
          <Reveal className="lp-final">
            <div className="lp-final-glow" aria-hidden="true" />
            <h2 className="lp-final-title">Your next customer shouldn&apos;t be their last visit.</h2>
            <p className="lp-final-sub">
              Give every guest a QR that earns stamps — and a reward worth coming back for.
            </p>
            <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg">
              Get started
              <ArrowRight size={18} strokeWidth={2.4} />
            </a>
            <p className="lp-final-note">7-Day Money Back Guarantee</p>
          </Reveal>
        </section>
      </div>
    </SiteShell>
  );
}
