"use client";

import {
  ArrowRight,
  BarChart3,
  Gift,
  LayoutDashboard,
  QrCode,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./reveal";
import { LoyaltyPassCard, QrOnboardingMockup } from "./product-mockups";

export function LoyaltyScanSpotlight() {
  return (
    <div className="am-ask">
      <div className="am-ask-copy">
        <span className="am-label">Guest experience</span>
        <h3 className="am-ask-title">No app. One scan. A stamp card they actually keep.</h3>
        <p className="am-ask-lead">
          Guests join from a QR at your counter — their digital pass lives in the phone browser, so
          every visit moves them closer to a real reward.
        </p>
        <p className="am-ask-lead">
          No plastic cards. No downloads. Just a reason to come back.
        </p>
        <ul className="am-ask-points">
          <li>Join in seconds from any phone</li>
          <li>Progress and rewards always visible</li>
          <li>Works for cafés, shops, salons, and more</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="ls-ask-visual" aria-hidden="true">
        <LoyaltyPassCard filled={6} total={10} className="ls-ask-pass" />
      </div>
    </div>
  );
}

export function LoyaltySetupSpotlight() {
  return (
    <div className="am-ask am-import ls-setup">
      <div className="am-ask-copy">
        <span className="am-label">Merchant setup</span>
        <h3 className="am-ask-title">Live in minutes. Rewards you choose.</h3>
        <p className="am-ask-lead">
          Set your stamp goal, reward, and brand once. Print or show a QR at checkout — customers
          enroll themselves.
        </p>
        <p className="am-ask-lead">
          Your dashboard tracks every stamp, redemption, and returning guest without spreadsheet
          busywork.
        </p>
        <ul className="am-ask-points">
          <li>Custom rewards and stamp counts</li>
          <li>QR enrollment with no staff training</li>
          <li>Customer list and visit insights built in</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="ls-setup-visual" aria-hidden="true">
        <QrOnboardingMockup />
      </div>
    </div>
  );
}

type CapTone = "plain" | "deep" | "accent";

interface Capability {
  id: string;
  tone: CapTone;
  Icon: LucideIcon;
  title: string;
  desc: string;
  cta?: string;
}

const CAPABILITIES: Capability[] = [
  {
    id: "qr",
    tone: "plain",
    Icon: QrCode,
    title: "QR enrollment",
    desc: "Customers join in one scan at the counter. No app, no form marathon.",
  },
  {
    id: "reward",
    tone: "plain",
    Icon: Gift,
    title: "Reward engine",
    desc: "Offer free items, discounts, or visits that match how your business runs.",
  },
  {
    id: "dash",
    tone: "deep",
    Icon: LayoutDashboard,
    title: "Merchant dashboard",
    desc: "See stamps, redemptions, and who is coming back — all in one place.",
  },
  {
    id: "insights",
    tone: "plain",
    Icon: BarChart3,
    title: "Business insights",
    desc: "Understand repeat rates and which rewards actually pull people back.",
  },
  {
    id: "mobile",
    tone: "plain",
    Icon: Smartphone,
    title: "Mobile-first passes",
    desc: "Stamps look crisp on every phone. Guests never re-download anything.",
  },
  {
    id: "connect",
    tone: "accent",
    Icon: UtensilsCrossed,
    title: "Works with AI Menu",
    desc: "Connect Loyalty Stamps to Froq AI Menu so browsing and rewards stay one journey.",
    cta: "Get started",
  },
];

function TileVisual({ id }: { id: string }) {
  if (id === "qr") {
    return (
      <div className="ls-tile-qr" aria-hidden="true">
        <span className="ls-tile-qr-frame">
          <QrCode size={36} strokeWidth={1.7} />
        </span>
        <em>Scan to join</em>
      </div>
    );
  }
  if (id === "reward") {
    return (
      <div className="ls-tile-reward" aria-hidden="true">
        <span className="ls-tile-stamps">
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-next" />
        </span>
        <strong>Free coffee after 10</strong>
      </div>
    );
  }
  if (id === "dash") {
    return (
      <div className="ls-tile-dash" aria-hidden="true">
        <span className="ls-tile-dash-row">
          <b>94</b>
          <em>Stamps today</em>
        </span>
        <span className="ls-tile-dash-row">
          <b>12</b>
          <em>Rewards claimed</em>
        </span>
        <span className="ls-tile-dash-row">
          <b>2.4×</b>
          <em>Repeat rate</em>
        </span>
      </div>
    );
  }
  if (id === "insights") {
    return (
      <div className="ls-tile-insights" aria-hidden="true">
        <span className="ls-tile-insights-stat">
          <b>+38%</b>
          <em>repeat visits</em>
        </span>
        <span className="ls-tile-insights-bars">
          <i style={{ height: "42%" }} />
          <i style={{ height: "58%" }} />
          <i style={{ height: "51%" }} />
          <i style={{ height: "74%" }} />
          <i style={{ height: "68%" }} />
          <i style={{ height: "90%" }} />
          <i style={{ height: "100%" }} />
        </span>
      </div>
    );
  }
  if (id === "mobile") {
    return (
      <div className="ls-tile-mobile" aria-hidden="true">
        <span className="ls-tile-mobile-pill">
          <Zap size={12} strokeWidth={2.5} />
          Instant setup
        </span>
        <span className="ls-tile-mobile-pill is-dim">
          <Sparkles size={12} strokeWidth={2.5} />
          No app required
        </span>
      </div>
    );
  }
  if (id === "connect") {
    return (
      <div className="am-tile-loyalty" aria-hidden="true">
        <span className="am-tile-loyalty-brand">
          <Gift size={12} strokeWidth={2.3} />
          Bloom Coffee
        </span>
        <span className="am-tile-loyalty-flow">
          <span className="am-tile-loyalty-step">
            <span className="am-tile-loyalty-node is-scan">
              <QrCode size={22} strokeWidth={1.9} />
            </span>
            <em>Scan</em>
          </span>
          <span className="am-tile-loyalty-rail is-a" />
          <span className="am-tile-loyalty-step">
            <span className="am-tile-loyalty-collect">
              <i className="is-on" />
              <i className="is-on" />
              <i className="is-on" />
              <i className="is-on" />
              <i className="is-next" />
            </span>
            <em>Collect</em>
          </span>
          <span className="am-tile-loyalty-rail is-b" />
          <span className="am-tile-loyalty-step">
            <span className="am-tile-loyalty-node is-reward">
              <Gift size={20} strokeWidth={2.1} />
            </span>
            <em>Reward</em>
          </span>
        </span>
      </div>
    );
  }
  return null;
}

export function LoyaltyCapabilities() {
  return (
    <div className="am-bento">
      {CAPABILITIES.map(({ id, tone, Icon, title, desc, cta }, i) => (
        <Reveal
          key={id}
          className={`am-tile am-tile--${tone}`}
          delay={i * 50}
        >
          <span className="am-tile-icon" aria-hidden="true">
            <Icon size={18} strokeWidth={2.3} />
          </span>
          <h3 className="am-tile-title">{title}</h3>
          <p className="am-tile-desc">{desc}</p>
          <TileVisual id={id} />
          {cta ? (
            <a href="#pricing" className="am-tile-cta">
              {cta}
              <ArrowRight size={14} strokeWidth={2.5} />
            </a>
          ) : null}
        </Reveal>
      ))}
    </div>
  );
}
