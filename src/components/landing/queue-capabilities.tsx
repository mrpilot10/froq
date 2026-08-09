"use client";

import {
  ArrowRight,
  Bell,
  LayoutDashboard,
  MessageCircle,
  QrCode,
  Timer,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./reveal";
import { QueueTicketCard } from "./product-mockups";

export function QueueGuestSpotlight() {
  return (
    <div className="am-ask">
      <div className="am-ask-copy">
        <span className="am-label">Guest experience</span>
        <h3 className="am-ask-title">They wait wherever they like — not in your doorway.</h3>
        <p className="am-ask-lead">
          Guests scan, join the waitlist, and get a live ticket on their phone. When the table is
          ready, WhatsApp brings them back.
        </p>
        <p className="am-ask-lead">
          No app download. No cramped entrance. Your host stays focused on seating, not chasing
          names.
        </p>
        <ul className="am-ask-points">
          <li>Self-serve join by QR at the door</li>
          <li>Live position and estimated wait</li>
          <li>WhatsApp alert the moment they&apos;re up</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="qs-ask-visual" aria-hidden="true">
        <QueueTicketCard className="qs-ask-ticket" />
      </div>
    </div>
  );
}

export function QueueOpsSpotlight() {
  return (
    <div className="am-ask am-import qs-ops">
      <div className="am-ask-copy">
        <span className="am-label">Host tools</span>
        <h3 className="am-ask-title">Run the door from one live list.</h3>
        <p className="am-ask-lead">
          Call the next party, mark seated, and see party sizes without a paper clipboard that
          goes missing mid-service.
        </p>
        <p className="am-ask-lead">
          Wait-time insights help you set expectations — and know when the line is about to spike.
        </p>
        <ul className="am-ask-points">
          <li>Live waitlist with party size and status</li>
          <li>One-tap call / seat / no-show flows</li>
          <li>Analytics on waits and seating rates</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="qs-ops-visual" aria-hidden="true">
        <div className="qs-ops-board">
          <header>
            <strong>Tonight&apos;s waitlist</strong>
            <em>12 waiting</em>
          </header>
          {[
            { n: "06", name: "Arjun", party: 2, wait: "Ready", tone: "ready" },
            { n: "07", name: "Neha", party: 4, wait: "~8m", tone: "next" },
            { n: "08", name: "Priya", party: 3, wait: "~22m", tone: "wait" },
            { n: "09", name: "Kabir", party: 2, wait: "~28m", tone: "wait" },
          ].map((row) => (
            <div key={row.n} className={`qs-ops-row is-${row.tone}`}>
              <b>#{row.n}</b>
              <span>
                <strong>{row.name}</strong>
                <em>Party of {row.party}</em>
              </span>
              <i>{row.wait}</i>
            </div>
          ))}
        </div>
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
    title: "QR self-join",
    desc: "Guests join from a door QR — no host typing every name mid-rush.",
  },
  {
    id: "wa",
    tone: "plain",
    Icon: MessageCircle,
    title: "WhatsApp ready alerts",
    desc: "When you call a party, they get a WhatsApp ping to head back.",
  },
  {
    id: "live",
    tone: "deep",
    Icon: LayoutDashboard,
    title: "Live host board",
    desc: "See who’s waiting, who’s been called, and who’s seated — in real time.",
  },
  {
    id: "wait",
    tone: "plain",
    Icon: Timer,
    title: "Wait-time clarity",
    desc: "Estimated waits set expectations so guests relax instead of hovering.",
  },
  {
    id: "party",
    tone: "plain",
    Icon: Users,
    title: "Party-aware seating",
    desc: "Party size rides with every ticket so the right table finds the right group.",
  },
  {
    id: "menu",
    tone: "accent",
    Icon: UtensilsCrossed,
    title: "Pairs with AI Menu",
    desc: "While guests wait, invite them to browse your Froq AI Menu — one QR journey.",
    cta: "Get started",
  },
];

function TileVisual({ id }: { id: string }) {
  if (id === "qr") {
    return (
      <div className="qs-tile-qr" aria-hidden="true">
        <span className="qs-tile-qr-frame">
          <QrCode size={36} strokeWidth={1.7} />
        </span>
        <em>Scan to join</em>
      </div>
    );
  }
  if (id === "wa") {
    return (
      <div className="qs-tile-wa" aria-hidden="true">
        <span className="qs-tile-wa-bubble">
          <Bell size={14} strokeWidth={2.4} />
          Table ready — #08
        </span>
        <span className="qs-tile-wa-reply">Coming in!</span>
      </div>
    );
  }
  if (id === "live") {
    return (
      <div className="qs-tile-live" aria-hidden="true">
        <span>
          <b>12</b>
          <em>Waiting</em>
        </span>
        <span>
          <b>3</b>
          <em>Called</em>
        </span>
        <span>
          <b>41</b>
          <em>Seated tonight</em>
        </span>
      </div>
    );
  }
  if (id === "wait") {
    return (
      <div className="qs-tile-wait" aria-hidden="true">
        <strong>~18 min</strong>
        <em>Average wait today</em>
        <span className="qs-tile-wait-bar">
          <i style={{ width: "62%" }} />
        </span>
      </div>
    );
  }
  if (id === "party") {
    return (
      <div className="qs-tile-party" aria-hidden="true">
        <span>
          <Users size={14} strokeWidth={2.3} />2
        </span>
        <span className="is-on">
          <Users size={14} strokeWidth={2.3} />4
        </span>
        <span>
          <Users size={14} strokeWidth={2.3} />3
        </span>
      </div>
    );
  }
  if (id === "menu") {
    return (
      <div className="qs-tile-menu" aria-hidden="true">
        <span className="qs-tile-menu-pill">View AI menu while you wait</span>
        <span className="qs-tile-menu-pill is-dim">Ask · Browse · Order ideas</span>
      </div>
    );
  }
  return null;
}

export function QueueCapabilities() {
  return (
    <div className="am-bento">
      {CAPABILITIES.map(({ id, tone, Icon, title, desc, cta }, i) => (
        <Reveal key={id} className={`am-tile am-tile--${tone}`} delay={i * 50}>
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
