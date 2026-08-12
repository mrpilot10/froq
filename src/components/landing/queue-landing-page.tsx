"use client";

import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Bell,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SiteShell } from "./site-shell";
import { PricingTable } from "./pricing-table";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";
import { QueueHeroVisual } from "./product-mockups";
import {
  QueueCapabilities,
  QueueGuestSpotlight,
  QueueOpsSpotlight,
} from "./queue-capabilities";
import { QueueTryComposer } from "./queue-try-composer";
import { MenuTrustBar } from "./menu-trust-bar";
import { MenuVenues } from "./menu-venues";

const HOW_STEPS = [
  {
    id: "qr",
    title: "Place a QR",
    desc: "Put your waitlist QR at the door. Guests scan once — no app install.",
  },
  {
    id: "join",
    title: "Guests join",
    desc: "They pick a party size, grab a ticket, and leave the entrance free.",
  },
  {
    id: "wait",
    title: "They wait free",
    desc: "Live position and estimated wait stay on their phone while they roam.",
  },
  {
    id: "call",
    title: "You call",
    desc: "Tap to call — WhatsApp tells them the table is ready so they head back.",
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
      <div className="am-how-illu qs-how-illu--join" aria-hidden="true">
        <span className="qs-how-token">#08</span>
        <span className="qs-how-chip">Joined</span>
      </div>
    );
  }
  if (id === "wait") {
    return (
      <div className="am-how-illu qs-how-illu--wait" aria-hidden="true">
        <span className="qs-how-wait">
          <Users size={20} strokeWidth={2.2} />
          ~22m
        </span>
      </div>
    );
  }
  return (
    <div className="am-how-illu qs-how-illu--call" aria-hidden="true">
      <span className="qs-how-bell">
        <Bell size={22} strokeWidth={2.2} />
      </span>
      <span className="am-how-grow-chip">Ready</span>
    </div>
  );
}

function QueueHowItWorks() {
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
      "The entrance stays clear now. Guests wander, get a WhatsApp when ready, and we seat without shouting names.",
    name: "Rahul Mehra",
    initials: "RM",
    role: "Ops Lead, Oven Theory",
    place: "Pune",
  },
  {
    quote:
      "Party size on every ticket changed how we match tables. Less guesswork during the Friday rush.",
    name: "Ananya Desai",
    initials: "AD",
    role: "Owner, Coast & Crumb",
    place: "Mumbai",
  },
  {
    quote:
      "Hosts run the door from one list. Call, seat, done — paper clipboards are gone for good.",
    name: "Karthik Iyer",
    initials: "KI",
    role: "Founder, Green Bowl",
    place: "Bengaluru",
  },
];

const FAQS = [
  {
    q: "Do guests need an app?",
    a: "No. They scan your QR and join in the phone browser. WhatsApp alerts arrive when you call their party.",
  },
  {
    q: "How do WhatsApp alerts work?",
    a: "When a host marks a party as ready, Froq sends a WhatsApp notification so guests know to return to the restaurant.",
  },
  {
    q: "Can hosts still add walk-ins manually?",
    a: "Yes. Guests can self-join by QR, and your team can add parties from the live waitlist board when needed.",
  },
  {
    q: "Does it work with AI Digital Menu?",
    a: "Yes. While guests wait, you can invite them to browse your Froq AI Menu — one connected experience from queue to table.",
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

function QueueFaq() {
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

export function QueueLandingPage() {
  return (
    <SiteShell>
      <div className="am-landing qs-landing">
        <section className="lp-hero am-hero">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow">
              <Users size={13} strokeWidth={2.4} />
              Smart Queue
            </span>
            <h1 className="lp-hero-title">
              Clear the Doorway. Call Guests When the Table Is Ready.
            </h1>
            <p className="am-hero-sub">
              Guests scan to join your live waitlist, wait wherever they like, and get a WhatsApp
              alert the moment you seat them.
            </p>
            <p className="am-hero-desc">
              Froq replaces paper clipboards and shouted names with a door QR, a phone ticket, and a
              host board your team can actually run through the rush.
            </p>
            <div className="am-hero-actions">
              <a href="#pricing" className="lp-btn lp-btn--accent lp-btn--lg am-hero-cta">
                Get started
                <span className="am-hero-cta-price">₹799/mo</span>
                <ArrowRight size={20} strokeWidth={2.4} />
              </a>
              <a href="#try" className="lp-btn am-btn-ghost lp-btn--lg">
                See how it works
              </a>
            </div>
          </div>

          <QueueHeroVisual />
        </section>

        <Reveal className="am-trust-wrap">
          <MenuTrustBar />
        </Reveal>

        <section className="lp-section am-try" id="try">
          <Reveal className="lp-section-head">
            <span className="lp-kicker am-try-kicker">
              <i aria-hidden="true" />
              Guest ticket
            </span>
            <h2 className="lp-h2">A live ticket that walks with them.</h2>
            <p className="lp-section-lead">
              Position, party size, and estimated wait on one screen — plus a WhatsApp ping when
              you call.
            </p>
          </Reveal>
          <Reveal delay={60}>
            <QueueTryComposer />
          </Reveal>
        </section>

        <section className="lp-section" id="guest">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Guest experience</span>
            <h2 className="lp-h2">Waiting without occupying your entrance</h2>
          </Reveal>
          <Reveal delay={60}>
            <QueueGuestSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="ops">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Host tools</span>
            <h2 className="lp-h2">One list. Call, seat, clear.</h2>
          </Reveal>
          <Reveal delay={60}>
            <QueueOpsSpotlight />
          </Reveal>
        </section>

        <section className="lp-section" id="how">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">How it works</span>
            <h2 className="lp-h2">From door QR to seated party</h2>
            <p className="lp-section-lead">
              Guests self-join, wait free of the doorway, and return when WhatsApp says it&apos;s
              time.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <QueueHowItWorks />
          </Reveal>
        </section>

        <section className="lp-section" id="features">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Capabilities</span>
            <h2 className="lp-h2">Built for join, wait, and seat</h2>
            <p className="lp-section-lead">
              Everything that turns a chaotic entrance into a calm, trackable waitlist.
            </p>
          </Reveal>
          <QueueCapabilities />
        </section>

        <section className="lp-section lp-section--testimonials" id="stories">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">Testimonials</span>
            <h2 className="lp-h2">Restaurants are already clearing the door</h2>
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
            product="queue"
            title="Simple pricing. No surprises."
            subtitle="Subscribe with a 7-day money-back guarantee. Cancel anytime."
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
            title="Built for every restaurant that runs a wait."
          />
        </section>

        <section className="lp-section">
          <Reveal className="lp-section-head">
            <span className="lp-kicker">FAQ</span>
            <h2 className="lp-h2">Questions, answered</h2>
          </Reveal>
          <Reveal delay={60}>
            <QueueFaq />
          </Reveal>
        </section>

        <section className="lp-section lp-section--final">
          <Reveal className="lp-final">
            <div className="lp-final-glow" aria-hidden="true" />
            <h2 className="lp-final-title">Your doorway shouldn&apos;t be the waiting room.</h2>
            <p className="lp-final-sub">
              Give guests a QR that joins the line — and a WhatsApp that brings them back when
              you’re ready.
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
