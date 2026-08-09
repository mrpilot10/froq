"use client";

import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Plus,
  QrCode,
  ShoppingCart,
  Sparkles,
  Upload,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { SiteShell } from "./site-shell";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";
import { MenuAskSpotlight, MenuCapabilities } from "./menu-capabilities";
import { MenuLiveEmbed } from "./menu-live-embed";

const HOW_STEPS: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: Upload,
    title: "Import",
    desc: "Drop in your PDF or dish photos. Froq reads your existing menu into a structured catalogue.",
  },
  {
    Icon: Wand2,
    title: "Generate",
    desc: "Fill in descriptions, dietary tags and imagery with AI. Review everything before it goes live.",
  },
  {
    Icon: QrCode,
    title: "Go live",
    desc: "Put a QR on every table. Guests scan and browse — no app, no download, no waiting.",
  },
  {
    Icon: ShoppingCart,
    title: "Grow",
    desc: "Turn interest into orders with recommendations, offers and Loyalty Stamps.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Guests ask the menu in Marathi and Hindi now. Our staff spend less time explaining every dish.",
    name: "Ananya Desai",
    role: "Owner, Coast & Crumb · Mumbai",
  },
  {
    quote:
      "We uploaded our old printed menu and had descriptions and AI images ready the same afternoon.",
    name: "Rahul Mehra",
    role: "Ops Lead, Oven Theory · Pune",
  },
  {
    quote:
      "The cart suggestions show pairings we used to miss. Our average ticket improved without constantly pushing discounts.",
    name: "Karthik Iyer",
    role: "Founder, Green Bowl · Bengaluru",
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
    a: "Try it with confidence. You’re covered by our 7-Day Money Back Guarantee.",
  },
];

function MenuHowItWorks() {
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.2 });
  return (
    <ol ref={ref} className={`lp-how${inView ? " is-in" : ""}`}>
      <span className="lp-how-line" aria-hidden="true" />
      {HOW_STEPS.map(({ Icon, title, desc }, i) => (
        <li key={title} className="lp-how-step" style={{ "--i": i } as CSSProperties}>
          <span className="lp-how-num" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="lp-how-icon" aria-hidden="true">
            <Icon size={22} strokeWidth={2.1} />
          </span>
          <span className="lp-how-body">
            <span className="lp-how-title">{title}</span>
            <span className="lp-how-desc">{desc}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

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
      <>
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
              <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg">
                Get started
                <ArrowRight size={18} strokeWidth={2.4} />
              </a>
              <a href="#try" className="lp-btn am-btn-ghost lp-btn--lg">
                Try a live menu
              </a>
            </div>
            <ul className="am-hero-proof">
              <li>No app for guests</li>
              <li>Works from your PDF menu</li>
              <li>7-day money back</li>
            </ul>
          </div>
        </section>

        <section className="lp-section am-try" id="try">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Try it yourself</span>
            <h2 className="lp-h2">This is a real Froq menu</h2>
            <p className="lp-section-lead">
              Hit play to open the real thing — browse it, ask it what to eat, add something to
              the cart. Exactly what your guests see after they scan the QR at the table.
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
          <div className="lp-quotes">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} className="lp-quote" delay={i * 70}>
                <p className="lp-quote-text">&ldquo;{t.quote}&rdquo;</p>
                <div className="lp-quote-meta">
                  <span className="lp-quote-name">{t.name}</span>
                  <span className="lp-quote-role">{t.role}</span>
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
      </>
    </SiteShell>
  );
}
