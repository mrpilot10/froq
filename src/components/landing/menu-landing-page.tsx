"use client";

import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SiteShell } from "./site-shell";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";
import { MenuHeroVisual } from "./product-mockups";
import { MenuAskSpotlight, MenuCapabilities, MenuImportSpotlight } from "./menu-capabilities";
import { MenuLiveEmbed } from "./menu-live-embed";
import { MenuTrustBar } from "./menu-trust-bar";
import { MenuVenues } from "./menu-venues";

const HOW_STEPS = [
  {
    id: "import",
    title: "Import",
    desc: "Drop in your PDF or dish photos. Froq reads your existing menu into a structured catalogue.",
  },
  {
    id: "generate",
    title: "Generate",
    desc: "Fill in descriptions, dietary tags and imagery with AI. Review everything before it goes live.",
  },
  {
    id: "live",
    title: "Go live",
    desc: "Put a QR on every table. Guests scan and browse — no app, no download, no waiting.",
  },
  {
    id: "grow",
    title: "Grow",
    desc: "Turn interest into orders with recommendations, offers and Loyalty Stamps.",
  },
] as const;

function HowStepVisual({ id }: { id: (typeof HOW_STEPS)[number]["id"] }) {
  if (id === "import") {
    return (
      <div className="am-how-illu am-how-illu--import" aria-hidden="true">
        <span className="am-how-doc">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="am-how-badge">PDF</span>
      </div>
    );
  }
  if (id === "generate") {
    return (
      <div className="am-how-illu am-how-illu--generate" aria-hidden="true">
        <span className="am-how-card am-how-card--a">
          <b />
          <em />
          <Sparkles size={12} strokeWidth={2.5} />
        </span>
        <span className="am-how-card am-how-card--b">
          <b />
          <em />
          <Sparkles size={12} strokeWidth={2.5} />
        </span>
        <span className="am-how-card am-how-card--c">
          <b />
          <em />
          <Sparkles size={12} strokeWidth={2.5} />
        </span>
      </div>
    );
  }
  if (id === "live") {
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
      <span className="am-how-grow-chip">+₹120</span>
    </div>
  );
}

function MenuHowItWorks() {
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
      "Guests ask the menu in Marathi and Hindi now. Our staff spend less time explaining every dish.",
    name: "Ananya Desai",
    initials: "AD",
    role: "Owner, Coast & Crumb",
    place: "Mumbai",
  },
  {
    quote:
      "We uploaded our old printed menu and had descriptions and AI images ready the same afternoon.",
    name: "Rahul Mehra",
    initials: "RM",
    role: "Ops Lead, Oven Theory",
    place: "Pune",
  },
  {
    quote:
      "The cart suggestions show pairings we used to miss. Our average ticket improved without constantly pushing discounts.",
    name: "Karthik Iyer",
    initials: "KI",
    role: "Founder, Green Bowl",
    place: "Bengaluru",
  },
];

const FAQS = [
  {
    q: "Do customers need an app?",
    a: "No. Guests scan your QR code and open the menu directly in their phone browser. Nothing to download.",
  },
  {
    q: "Can we use our existing PDF menu?",
    a: "Yes. Upload your PDF or menu photos and Froq uses AI to turn them into a structured digital catalogue. You review the content before publishing.",
  },
  {
    q: "Which languages are supported?",
    a: "Froq supports English, Hindi, Marathi, Tamil and more. Guests can browse and interact with the menu in supported languages.",
  },
  {
    q: "Can it work with Loyalty Stamps?",
    a: "Yes. Your AI Menu and Froq Loyalty Stamps can work together, giving guests one connected experience from discovery to reward.",
  },
  {
    q: "Is there a contract?",
    a: "No. Choose monthly or yearly billing and cancel when you want.",
  },
  {
    q: "What if it isn’t right for us?",
    a: "Subscribe with confidence. First-time plans include a 7-day money-back guarantee — full refund if it isn’t a fit.",
  },
];

function MenuFaq() {
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

export function MenuLandingPage() {
  return (
    <SiteShell>
      <div className="am-landing">
        <section className="lp-hero am-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <Sparkles size={13} strokeWidth={2.4} />
              AI Powered Digital Menu
            </span>
            <h1 className="lp-hero-title">
              Turn Your Menu Into an AI That Answers Questions and Drives More Orders.
            </h1>
            <p className="am-hero-sub">
              Let guests chat or talk to your menu in their own language and get personalised recommendations while they order.
            </p>
            <p className="am-hero-desc">
              Guests can ask questions, discover dishes, and get AI powered suggestions without waiting for your staff. AI insights inside the cart help guests make better choices, while live order totals make it easy to see exactly what they are spending.
            </p>
            <div className="am-hero-actions">
              <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg am-hero-cta">
                Get started
                <span className="am-hero-cta-price">₹699/mo</span>
                <ArrowRight size={20} strokeWidth={2.4} />
              </a>
              <a href="#try" className="lp-btn am-btn-ghost lp-btn--lg">
                Try a live menu
              </a>
            </div>
          </div>

          <MenuHeroVisual />
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
            <h2 className="lp-h2">Go ahead. Try the menu.</h2>
            <p className="lp-section-lead">
              Explore a real Froq menu, ask the AI what to eat, and add something to your cart.
              It’s the same experience your guests get at the table.
            </p>
          </Reveal>
          <Reveal delay={60}>
            <MenuLiveEmbed />
          </Reveal>
        </section>

        <section className="lp-section" id="understand">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Guest experience</span>
            <h2 className="lp-h2">A menu that understands what guests mean</h2>
          </Reveal>
          <Reveal delay={60}>
            <MenuAskSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="import">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Menu setup</span>
            <h2 className="lp-h2">Import once. AI fills in the rest.</h2>
          </Reveal>
          <Reveal delay={60}>
            <MenuImportSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="how">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">How it works</span>
            <h2 className="lp-h2">From your existing menu to an AI menu</h2>
            <p className="lp-section-lead">
              You don&apos;t rebuild anything. Import what you already have and give every table a
              menu that can answer back.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <MenuHowItWorks />
          </Reveal>
        </section>

        <section className="lp-section" id="features">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Capabilities</span>
            <h2 className="lp-h2">Built for discovery, ordering and return visits</h2>
            <p className="lp-section-lead">
              Everything that turns a printed menu into a guest experience you can actually
              improve.
            </p>
          </Reveal>
          <MenuCapabilities />
        </section>

        <section className="lp-section lp-section--testimonials" id="stories">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Testimonials</span>
            <h2 className="lp-h2">Restaurants are already letting guests ask</h2>
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
            product="menu"
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
          <MenuVenues />
        </section>

        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">FAQ</span>
            <h2 className="lp-h2">Questions, answered</h2>
          </Reveal>
          <Reveal delay={60}>
            <MenuFaq />
          </Reveal>
        </section>

        <section className="lp-section lp-section--final">
          <Reveal className="lp-final">
            <div className="lp-final-glow" aria-hidden="true" />
            <h2 className="lp-final-title">Your menu should answer back.</h2>
            <p className="lp-final-sub">
              Give every table a QR that does more than display dishes — let guests ask, discover
              and order with confidence.
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
