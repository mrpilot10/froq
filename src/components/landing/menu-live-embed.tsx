"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Mic, Play, Search, Star, X } from "lucide-react";

/** A real published Froq menu — opened on demand rather than embedded on load. */
const MENU_URL = "https://www.froq.io/menu/jimis-burger-goregaon-delivery-exclusive";

/* ─────────────────────────────────────────────────────────────────────────
   Poster — a still of the guest menu's opening screen. Everything sizes off
   the phone width, so it stays sharp at whatever scale the device lands on.
   ───────────────────────────────────────────────────────────────────────── */
function MenuPreview() {
  return (
    <div className="am-shot" aria-hidden="true">
      <div className="am-shot-top">
        <span className="am-shot-mark" />
        <span className="am-shot-brand">
          <strong>JIMIS BURGER ® – Goregaon</strong>
          <em>Open 12:01 am – 10:00 pm</em>
        </span>
        <span className="am-shot-lang">EN</span>
      </div>

      <div className="am-shot-hero">
        <span className="am-shot-hero-title">
          Your Personal AI
          <br />
          Menu Assistant
        </span>
        <span className="am-shot-hero-sub">
          Get instant answers, personalised recommendations, and everything you need before you
          order.
        </span>

        <span className="am-shot-ask">
          <Search size={11} strokeWidth={2.4} />
          <em>Ask the menu anything…</em>
          <Mic size={11} strokeWidth={2.4} />
          <b>
            <ArrowRight size={10} strokeWidth={3} />
          </b>
        </span>

        <span className="am-shot-chips">
          <span>What offers are on?</span>
          <span>What&apos;s the spiciest?</span>
        </span>
      </div>

      <div className="am-shot-section">
        <span className="am-shot-section-title">Chef&apos;s choice</span>
        <span className="am-shot-section-tag">
          <Star size={9} strokeWidth={2.6} />
          PICKS
        </span>
      </div>

      <div className="am-shot-dish">
        <span className="am-shot-dish-photo" />
        <span className="am-shot-dish-copy">
          <strong>Classic Cheese Burger</strong>
          <em>Double patty · Cheddar · House sauce</em>
          <b>₹249</b>
        </span>
      </div>
      <div className="am-shot-dish">
        <span className="am-shot-dish-photo am-shot-dish-photo--b" />
        <span className="am-shot-dish-copy">
          <strong>Peri Peri Fries</strong>
          <em>Crispy · Tossed in peri spice</em>
          <b>₹149</b>
        </span>
      </div>
      <div className="am-shot-dish">
        <span className="am-shot-dish-photo am-shot-dish-photo--c" />
        <span className="am-shot-dish-copy">
          <strong>Smoky BBQ Wings</strong>
          <em>Six pieces · Charred · Sticky glaze</em>
          <b>₹279</b>
        </span>
      </div>
      <div className="am-shot-dish">
        <span className="am-shot-dish-photo am-shot-dish-photo--d" />
        <span className="am-shot-dish-copy">
          <strong>Belgian Chocolate Shake</strong>
          <em>Thick · Dark cocoa · Whipped cream</em>
          <b>₹179</b>
        </span>
      </div>

      <div className="am-shot-section">
        <span className="am-shot-section-title">Bestsellers</span>
      </div>

      <div className="am-shot-dish">
        <span className="am-shot-dish-photo am-shot-dish-photo--b" />
        <span className="am-shot-dish-copy">
          <strong>Paneer Tikka Burger</strong>
          <em>Char-grilled paneer · Mint mayo</em>
          <b>₹229</b>
        </span>
      </div>
      <div className="am-shot-dish">
        <span className="am-shot-dish-photo" />
        <span className="am-shot-dish-copy">
          <strong>Loaded Nachos</strong>
          <em>Jalapeño · Cheese sauce · Salsa</em>
          <b>₹199</b>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Full-screen demo — the actual menu, with a way back out.
   ───────────────────────────────────────────────────────────────────────── */
function MenuDemoModal({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  // Escape closes, and the page behind must not scroll while the demo is up.
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

  // Rendered on document.body: the Reveal wrapper above this carries a
  // transform, which would otherwise make it the containing block and stop the
  // overlay from going full screen.
  return createPortal(
    <div className="am-demo" role="dialog" aria-modal="true" aria-label="Live Froq AI Menu">
      <div className="am-demo-bar">
        <span className="am-demo-label">
          <i aria-hidden="true" />
          Live menu
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
            <span className="am-demo-loading-text">Loading the menu…</span>
          </div>
        )}
        <iframe
          className="am-demo-frame"
          src={MENU_URL}
          title="Live Froq AI Menu — Jimi's Burger, Goregaon"
          onLoad={() => setLoaded(true)}
          /* The menu's voice search needs the mic once this is served from froq.io. */
          allow="microphone"
        />
      </div>
    </div>,
    document.body,
  );
}

export function MenuLiveEmbed() {
  const [open, setOpen] = useState(false);

  return (
    <div className="am-try-stage">
      <div className="am-try-glow" aria-hidden="true" />

      {/* iPhone 15/16 proportions (393 x 852pt), sized in CSS to fit the screen. */}
      <div className="am-try-device">
        <div className="am-try-phone">
          <span className="am-try-btn am-try-btn--vol" aria-hidden="true" />
          <span className="am-try-btn am-try-btn--vol2" aria-hidden="true" />
          <span className="am-try-btn am-try-btn--power" aria-hidden="true" />
          <div className="am-try-screen">
            <MenuPreview />
            <button type="button" className="am-try-play" onClick={() => setOpen(true)}>
              <span className="am-try-play-ring" aria-hidden="true">
                <Play size={22} strokeWidth={2.4} fill="currentColor" />
              </span>
              <span className="am-try-play-label">Try the live menu</span>
            </button>
          </div>
        </div>
      </div>

      {open ? <MenuDemoModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
