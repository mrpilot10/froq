"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Gift,
  LayoutDashboard,
  Play,
  QrCode,
  Stamp,
  X,
} from "lucide-react";
import { useInView } from "./use-in-view";
import { LoyaltyPassCard } from "./product-mockups";

const DEMO_URL = "/demo/stamp";

function StampPreview() {
  return (
    <div className="ls-shot" aria-hidden="true">
      <div className="ls-shot-top">
        <span className="ls-shot-mark">BC</span>
        <span className="ls-shot-brand">
          <strong>Bloom Coffee</strong>
          <em>Loyalty pass</em>
        </span>
      </div>
      <LoyaltyPassCard filled={6} total={10} className="ls-shot-pass" />
      <div className="ls-shot-foot">
        <span>
          <Stamp size={12} strokeWidth={2.4} />
          6 stamps collected
        </span>
        <span>4 to free coffee</span>
      </div>
    </div>
  );
}

function TryCallouts() {
  const cards = [
    {
      id: "scan",
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
          Guests scan your counter QR and open a pass in the browser — no app download.
        </p>
      ),
    },
    {
      id: "stamp",
      delay: 90,
      link: "M1 26 C 36 26, 70 18, 110 10",
      header: (
        <>
          <Stamp size={15} strokeWidth={2.3} />
          Collect every visit
        </>
      ),
      body: (
        <div className="ls-try-stamps" aria-hidden="true">
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-on" />
          <i className="is-next" />
          <i />
          <i />
          <i />
        </div>
      ),
    },
    {
      id: "reward",
      delay: 45,
      link: "M110 14 C 74 14, 40 22, 1 30",
      header: (
        <>
          <Gift size={15} strokeWidth={2.3} />
          Unlock rewards
        </>
      ),
      body: (
        <div className="ls-try-reward">
          <strong>Free coffee</strong>
          <em>Ready after 10 stamps</em>
        </div>
      ),
    },
    {
      id: "dash",
      delay: 135,
      link: "M110 26 C 74 26, 40 18, 1 10",
      header: (
        <>
          <LayoutDashboard size={15} strokeWidth={2.3} />
          See who returns
        </>
      ),
      body: (
        <p className="am-try-callout-lead">
          Stamps and redemptions update live so you know which guests are coming back.
        </p>
      ),
    },
  ] as const;

  return (
    <>
      {cards.map((card) => (
        <aside
          key={card.id}
          className={`am-try-callout am-try-callout--${card.id === "scan" ? "ask" : card.id === "stamp" ? "talk" : card.id === "reward" ? "pick" : "cart"}`}
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

function StampDemoModal({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="am-demo" role="dialog" aria-modal="true" aria-label="Live Froq stamp card">
      <div className="am-demo-bar">
        <span className="am-demo-label">
          <i aria-hidden="true" />
          Live stamp card
        </span>
        <div className="am-demo-actions">
          <a href="#pricing" className="am-demo-cta" onClick={onClose}>
            Get started
            <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <button type="button" className="am-demo-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="am-demo-body">
        {loaded ? null : (
          <div className="am-demo-loading">
            <span className="am-demo-spinner" aria-hidden="true" />
            <span className="am-demo-loading-text">Loading the stamp card…</span>
          </div>
        )}
        <iframe
          className="am-demo-frame"
          src={DEMO_URL}
          title="Live Froq Loyalty Stamps demo"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>,
    document.body,
  );
}

export function LoyaltyLiveEmbed() {
  const [open, setOpen] = useState(false);
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
              <StampPreview />
              <button type="button" className="am-try-play" onClick={() => setOpen(true)}>
                <span className="am-try-play-ring" aria-hidden="true">
                  <Play size={22} strokeWidth={2.4} fill="currentColor" />
                </span>
                <span className="am-try-play-label">Try a live stamp card</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {open ? <StampDemoModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
