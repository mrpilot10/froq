"use client";

import {
  ArrowRight,
  BadgePercent,
  Check,
  FileText,
  ImagePlus,
  Languages,
  MessageSquareText,
  Mic,
  ShoppingCart,
  Sparkles,
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
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Get started free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="am-ask-chat">
        {ASKS.map((q) => (
          <p key={q} className="am-ask-bubble">
            {q}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Capabilities — one uniform card system, no competing tones or CTAs.
   ───────────────────────────────────────────────────────────────────────── */
type Tone = "deep" | "accent" | "plain";

const CAPABILITIES: {
  id: string;
  tone: Tone;
  Icon: LucideIcon;
  title: string;
  desc: string;
}[] = [
  {
    id: "ask",
    tone: "deep",
    Icon: MessageSquareText,
    title: "Chat or talk to the menu in local languages",
    desc: "Guests type a question or just speak it — in Hindi, Marathi, Tamil or English — and get a recommendation back from your menu in the same language.",
  },
  {
    id: "pdf",
    tone: "plain",
    Icon: Upload,
    title: "Upload. We’ll build your menu.",
    desc: "Drop in your PDF or menu photos and get a ready to use digital menu in seconds.",
  },
  {
    id: "img",
    tone: "plain",
    Icon: ImagePlus,
    title: "One click fills in every detail",
    desc: "Give AI a dish name and it writes the description and generates the photo, calories, spice level, cooking time and allergens. Nothing publishes until you approve it.",
  },
  {
    id: "lang",
    tone: "plain",
    Icon: Languages,
    title: "The whole menu, translated",
    desc: "Not just the chat — dish names, descriptions and tags all render in the language the guest picked.",
  },
  {
    id: "pair",
    tone: "plain",
    Icon: ShoppingCart,
    title: "Pairings that fit",
    desc: "Suggest relevant sides and add-ons based on what is already in the cart.",
  },
  {
    id: "offer",
    tone: "accent",
    Icon: BadgePercent,
    title: "Offers and Loyalty Stamps",
    desc: "Show live offers while guests browse and connect the visit to Froq Loyalty Stamps. One QR, one journey.",
  },
];

/** Everything one AI pass fills in — each maps to a real field on a menu item. */
const GENERATED_FIELDS = [
  "Photo",
  "Description",
  "Calories",
  "Spice level",
  "Cooking time",
  "Allergens",
];

/** The feature tiles carry a small visual; the rest stay icon-and-copy. */
function TileVisual({ id }: { id: string }) {
  if (id === "pdf") {
    return (
      <div className="am-tile-upload" aria-hidden="true">
        <div className="am-tile-upload-file">
          <span className="am-tile-upload-ico">
            <FileText size={16} strokeWidth={2.2} />
          </span>
          <span className="am-tile-upload-meta">
            <strong>dinner-menu.pdf</strong>
            <em>Reading · 24 dishes found</em>
          </span>
        </div>
        <span className="am-tile-upload-bar">
          <i />
        </span>
      </div>
    );
  }
  if (id === "img") {
    return (
      <div className="am-tile-gen" aria-hidden="true">
        <span className="am-tile-gen-btn">
          <Sparkles size={13} strokeWidth={2.5} />
          Generate with AI
        </span>
        <span className="am-tile-gen-chips">
          {GENERATED_FIELDS.map((field) => (
            <i key={field}>
              <Check size={11} strokeWidth={3} />
              {field}
            </i>
          ))}
        </span>
      </div>
    );
  }
  if (id === "ask") {
    return (
      <div className="am-tile-chat" aria-hidden="true">
        <span className="am-tile-chat-guest">
          <Mic size={13} strokeWidth={2.5} />
          कुछ हल्का और वेज बताओ?
        </span>
        <span className="am-tile-chat-reply">
          <b>पनीर स्लाइडर</b>
          <i>₹189</i>
        </span>
      </div>
    );
  }
  if (id === "offer") {
    return (
      <div className="am-tile-stamps" aria-hidden="true">
        <span className="am-tile-stamp-row">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} className={i < 4 ? "is-filled" : undefined} />
          ))}
        </span>
        <span className="am-tile-stamp-note">4 of 6 · free coffee at 6</span>
      </div>
    );
  }
  return null;
}

export function MenuCapabilities() {
  return (
    <div className="am-bento">
      {CAPABILITIES.map(({ id, tone, Icon, title, desc }, i) => (
        <Reveal
          key={id}
          className={`am-tile am-tile--${tone} am-tile--${id}`}
          delay={i * 50}
        >
          <span className="am-tile-icon" aria-hidden="true">
            <Icon size={19} strokeWidth={2.1} />
          </span>
          <h3 className="am-tile-title">{title}</h3>
          <p className="am-tile-desc">{desc}</p>
          <TileVisual id={id} />
        </Reveal>
      ))}
    </div>
  );
}
