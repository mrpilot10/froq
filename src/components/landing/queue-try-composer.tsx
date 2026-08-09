"use client";

import type { CSSProperties } from "react";
import {
  Bell,
  LayoutDashboard,
  MessageCircle,
  QrCode,
  Users,
} from "lucide-react";
import { useInView } from "./use-in-view";
import { QueueTicketCard } from "./product-mockups";

function QueuePreview() {
  return (
    <div className="qs-shot" aria-hidden="true">
      <div className="qs-shot-top">
        <span className="qs-shot-mark">OT</span>
        <span className="qs-shot-brand">
          <strong>Oven Theory</strong>
          <em>Live waitlist</em>
        </span>
      </div>
      <QueueTicketCard className="qs-shot-ticket" />
      <div className="qs-shot-foot">
        <span>
          <Bell size={12} strokeWidth={2.4} />
          WhatsApp when ready
        </span>
        <span>#08 · party of 3</span>
      </div>
    </div>
  );
}

function TryCallouts() {
  const cards = [
    {
      id: "ask",
      delay: 0,
      link: "M1 14 C 36 14, 70 22, 110 30",
      header: (
        <>
          <QrCode size={15} strokeWidth={2.3} />
          Scan to join
        </>
      ),
      body: (
        <p className="am-try-callout-lead">
          Guests scan the door QR and join in seconds — no host clipboard.
        </p>
      ),
    },
    {
      id: "talk",
      delay: 90,
      link: "M1 26 C 36 26, 70 18, 110 10",
      header: (
        <>
          <Users size={15} strokeWidth={2.3} />
          Live position
        </>
      ),
      body: (
        <div className="qs-try-pos">
          <strong>#08</strong>
          <em>~22 min est. wait</em>
        </div>
      ),
    },
    {
      id: "pick",
      delay: 45,
      link: "M110 14 C 74 14, 40 22, 1 30",
      header: (
        <>
          <MessageCircle size={15} strokeWidth={2.3} />
          WhatsApp ping
        </>
      ),
      body: (
        <div className="qs-try-wa">
          <strong>Table ready</strong>
          <em>Party of 3 — please head back</em>
        </div>
      ),
    },
    {
      id: "cart",
      delay: 135,
      link: "M110 26 C 74 26, 40 18, 1 10",
      header: (
        <>
          <LayoutDashboard size={15} strokeWidth={2.3} />
          Host board
        </>
      ),
      body: (
        <p className="am-try-callout-lead">
          Call, seat, and clear no-shows from one live list.
        </p>
      ),
    },
  ] as const;

  return (
    <>
      {cards.map((card) => (
        <aside
          key={card.id}
          className={`am-try-callout am-try-callout--${card.id}`}
          style={{ "--try-delay": `${card.delay}ms` } as CSSProperties}
        >
          <span className="am-try-link" aria-hidden="true">
            <svg viewBox="0 0 112 40" fill="none" preserveAspectRatio="none">
              <path d={card.link} pathLength={100} />
            </svg>
          </span>
          <header>{card.header}</header>
          {card.body}
        </aside>
      ))}
    </>
  );
}

/** Visual try compose — callouts + phone. No live iframe. */
export function QueueTryComposer() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div className="am-try-stage">
      <div className="am-try-glow" aria-hidden="true" />

      <div ref={ref} className={`am-try-compose${inView ? " is-in" : ""}`}>
        <TryCallouts />

        <div className="am-try-device">
          <div className="am-try-phone">
            <span className="am-try-btn am-try-btn--vol" aria-hidden="true" />
            <span className="am-try-btn am-try-btn--vol2" aria-hidden="true" />
            <span className="am-try-btn am-try-btn--power" aria-hidden="true" />
            <div className="am-try-screen">
              <QueuePreview />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
