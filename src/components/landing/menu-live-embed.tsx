"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  ArrowRight,
  Globe2,
  MessageSquareText,
  Mic,
  Play,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useInView } from "./use-in-view";

/** A real published Froq menu — opened on demand rather than embedded on load. */
const MENU_URL = "https://www.froq.io/menu/jimis-burger-goregaon-delivery-exclusive";

/* ─────────────────────────────────────────────────────────────────────────
   Poster — SoftUI guest menu opening screen (sizes off phone width).
   ───────────────────────────────────────────────────────────────────────── */
function MenuPreview() {
  const dishes = [
    {
      name: "Classic Cheese Burger",
      meta: "Double patty · Cheddar · House sauce",
      price: "₹249",
      src: "/landing/menu-cart/biryani.jpg",
    },
    {
      name: "Peri Peri Fries",
      meta: "Crispy · Tossed in peri spice",
      price: "₹149",
      src: "/landing/menu-cart/naan.jpg",
    },
    {
      name: "Belgian Chocolate Shake",
      meta: "Thick · Dark cocoa · Whipped cream",
      price: "₹179",
      src: "/landing/menu-cart/raita.jpg",
    },
  ] as const;

  return (
    <div className="am-shot" aria-hidden="true">
      <div className="am-shot-hero">
        <div className="am-shot-top">
          <span className="am-shot-mark">JB</span>
          <span className="am-shot-brand">
            <strong>JIMIS BURGER</strong>
            <em>Open 12:01 am – 10:00 pm</em>
          </span>
          <span className="am-shot-lang">
            <Globe2 size={10} strokeWidth={2.4} />
            EN
          </span>
        </div>

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
          <i>
            <Sparkles size={12} strokeWidth={2.4} />
          </i>
          <em>Ask the menu anything…</em>
          <Mic size={12} strokeWidth={2.4} />
          <b>
            <ArrowRight size={11} strokeWidth={2.8} />
          </b>
        </span>

        <span className="am-shot-chips">
          <span>What offers are on?</span>
          <span>What&apos;s the spiciest?</span>
        </span>
      </div>

      <div className="am-shot-body">
        <div className="am-shot-section">
          <span className="am-shot-section-title">Chef&apos;s choice</span>
          <span className="am-shot-section-tag">
            <Star size={9} strokeWidth={2.6} />
            PICKS
          </span>
        </div>

        {dishes.map((dish) => (
          <div className="am-shot-dish" key={dish.name}>
            <span className="am-shot-dish-photo">
              <Image src={dish.src} alt="" fill sizes="66px" />
            </span>
            <span className="am-shot-dish-copy">
              <strong>
                {dish.name}
                <b>{dish.price}</b>
              </strong>
              <em>{dish.meta}</em>
              <span className="am-shot-dish-actions">
                <i>Ask</i>
                <i className="is-add">
                  <Plus size={12} strokeWidth={2.6} />
                </i>
              </span>
            </span>
          </div>
        ))}
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
          <MessageSquareText size={15} strokeWidth={2.3} />
          Ask anything
        </>
      ),
      body: (
        <div className="am-try-chat">
          <p className="is-user">What do you recommend for a light dinner?</p>
          <p className="is-ai">
            Try the <strong>Grilled Chicken Bowl</strong> — light, high protein, ₹289.
          </p>
        </div>
      ),
    },
    {
      id: "talk",
      delay: 90,
      link: "M1 26 C 36 26, 70 18, 110 10",
      header: (
        <>
          <Globe2 size={15} strokeWidth={2.3} />
          Talk your way
        </>
      ),
      body: (
        <>
          <p className="am-try-callout-lead">Chat or talk in your preferred language</p>
          <div className="am-try-langs">
            <span className="is-active">English</span>
            <span>Hindi</span>
            <span>Marathi</span>
            <span>Tamil</span>
          </div>
        </>
      ),
    },
    {
      id: "pick",
      delay: 45,
      link: "M110 14 C 74 14, 40 22, 1 30",
      header: (
        <>
          <Sparkles size={15} strokeWidth={2.3} />
          AI pick for you
        </>
      ),
      body: (
        <div className="am-try-pick">
          <span className="am-try-pick-photo">
            <Image src="/landing/menu-cart/biryani.jpg" alt="" fill sizes="64px" />
          </span>
          <span className="am-try-pick-meta">
            <em>Based on your taste</em>
            <strong>Grilled Chicken Bowl</strong>
            <b>₹289</b>
          </span>
        </div>
      ),
    },
    {
      id: "cart",
      delay: 135,
      link: "M110 26 C 74 26, 40 18, 1 10",
      header: (
        <>
          <ShoppingCart size={15} strokeWidth={2.3} />
          Smart cart
        </>
      ),
      body: (
        <div className="am-try-cart">
          <div className="am-try-cart-row">
            <span className="am-try-cart-thumbs">
              <i>
                <Image src="/landing/menu-cart/biryani.jpg" alt="" fill sizes="28px" />
              </i>
              <i>
                <Image src="/landing/menu-cart/naan.jpg" alt="" fill sizes="28px" />
              </i>
              <i>
                <Image src="/landing/menu-cart/raita.jpg" alt="" fill sizes="28px" />
              </i>
            </span>
            <span>
              <strong>3 items</strong>
              <em>₹520</em>
            </span>
          </div>
          <div className="am-try-cart-promo">You&apos;re ₹203 away from free cheesy fries!</div>
        </div>
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
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });

  return (
    <div className="am-try-stage">
      <div className="am-try-glow" aria-hidden="true" />

      <div ref={ref} className={`am-try-compose${inView ? " is-in" : ""}`}>
        <TryCallouts />

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
      </div>

      {open ? <MenuDemoModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
