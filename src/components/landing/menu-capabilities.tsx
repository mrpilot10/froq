"use client";

import {
  BadgePercent,
  ImagePlus,
  Languages,
  MessageSquareText,
  ShoppingCart,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./reveal";

/* ─────────────────────────────────────────────────────────────────────────
   Ask spotlight — the pitch on the left, what guests actually type on the right.
   ───────────────────────────────────────────────────────────────────────── */
const ASKS = [
  "What can I eat if I want something mild and vegetarian?",
  "मेरे पास ₹300 हैं, क्या अच्छा रहेगा?",
  "Is the biryani very spicy?",
  "Something light before a flight.",
];

export function MenuAskSpotlight() {
  return (
    <div className="am-ask">
      <div className="am-ask-copy">
        <span className="am-label">Ask anything</span>
        <h3 className="am-ask-title">Nobody wants to scroll forty dishes</h3>
        <p className="am-ask-lead">
          Guests don&apos;t search by dish name. They search by mood, budget and what they can
          actually eat — and when the menu can&apos;t answer, they either flag down a server or
          order the same safe thing they always do.
        </p>
        <p className="am-ask-lead">
          Froq answers at the table, in seconds, from the menu you already published.
        </p>
        <ul className="am-ask-points">
          <li>Replies in whichever language the guest asks in</li>
          <li>Only your real dishes, prices and descriptions — never invented</li>
          <li>Suggests the pairing your best server would have recommended</li>
        </ul>
      </div>

      <div className="am-ask-chat">
        {ASKS.map((q) => (
          <p key={q} className="am-ask-bubble">
            {q}
          </p>
        ))}
        <span className="am-ask-typing" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Capabilities — one uniform card system, no competing tones or CTAs.
   ───────────────────────────────────────────────────────────────────────── */
const CAPABILITIES: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: MessageSquareText,
    title: "Guests can just ask",
    desc: "No scrolling through forty dishes. Guests describe what they feel like eating and Froq recommends from your menu.",
  },
  {
    Icon: Upload,
    title: "Start from your PDF",
    desc: "Upload your existing menu or photos of it. AI reads it into a structured catalogue — names, prices, categories.",
  },
  {
    Icon: ImagePlus,
    title: "Descriptions and images",
    desc: "Generate dish copy, dietary tags and menu imagery in the editor. Nothing goes live until you approve it.",
  },
  {
    Icon: Languages,
    title: "In their language",
    desc: "English, Hindi, Marathi, Tamil and more, so guests never have to translate a menu before they can order.",
  },
  {
    Icon: ShoppingCart,
    title: "Pairings that fit",
    desc: "Suggest relevant sides and add-ons based on what is already in the cart — at the moment it is useful.",
  },
  {
    Icon: BadgePercent,
    title: "Offers and Loyalty Stamps",
    desc: "Show live offers while guests browse and connect the visit to Froq Loyalty Stamps. One QR, one journey.",
  },
];

export function MenuCapabilities() {
  return (
    <div className="am-grid">
      {CAPABILITIES.map(({ Icon, title, desc }, i) => (
        <Reveal key={title} className="am-card" delay={i * 50}>
          <span className="am-card-icon" aria-hidden="true">
            <Icon size={19} strokeWidth={2.1} />
          </span>
          <h3 className="am-card-title">{title}</h3>
          <p className="am-card-desc">{desc}</p>
        </Reveal>
      ))}
    </div>
  );
}
