"use client";

import Image from "next/image";
import {
  ArrowRight,
  BadgePercent,
  Check,
  Coffee,
  FileText,
  ImagePlus,
  Languages,
  MessageSquareText,
  Mic,
  Plus,
  QrCode,
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
        <h3 className="am-ask-title">Stop making your staff answer the same questions.</h3>
        <p className="am-ask-lead">
          Guests can ask about spice, ingredients, dietary preferences, prices, portions, or
          what to order. Froq answers instantly using your actual menu.
        </p>
        <p className="am-ask-lead">
          Less time explaining the menu. More time serving guests.
        </p>
        <ul className="am-ask-points">
          <li>Answers in the guest&apos;s language</li>
          <li>Uses your real dishes, prices and descriptions</li>
          <li>Recommends dishes based on what guests want</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
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
   Import spotlight — upload once; AI fills photo, copy, nutrition, allergens.
   ───────────────────────────────────────────────────────────────────────── */
const IMPORT_FIELDS = [
  "Photo",
  "Description",
  "Calories",
  "Cooking time",
  "Spice",
  "Allergens",
] as const;

export function MenuImportSpotlight() {
  return (
    <div className="am-ask am-import">
      <div className="am-ask-copy">
        <span className="am-label">1-click import</span>
        <h3 className="am-ask-title">Stop typing every dish by hand.</h3>
        <p className="am-ask-lead">
          Import your PDF or menu photos. AI writes the description, generates the image, and
          fills allergens, cooking time, calories and spice — everything in one click.
        </p>
        <p className="am-ask-lead">
          You review and publish. Nothing goes live until you approve it.
        </p>
        <ul className="am-ask-points">
          <li>Import from PDF or menu photos in seconds</li>
          <li>AI fills photo, description and nutrition in one click</li>
          <li>Allergens, cooking time and spice ready for every dish</li>
        </ul>
        <a href="#pricing" className="lp-btn lp-btn--accent am-ask-cta">
          Try Froq free for 7 days
          <ArrowRight size={17} strokeWidth={2.4} />
        </a>
      </div>

      <div className="am-import-visual" aria-hidden="true">
        <div className="am-import-file">
          <span className="am-import-file-ico">
            <FileText size={18} strokeWidth={2.2} />
          </span>
          <span className="am-import-file-meta">
            <strong>dinner-menu.pdf</strong>
            <em>24 dishes imported</em>
          </span>
          <span className="am-import-file-badge">Ready</span>
        </div>

        <div className="am-import-dish">
          <span className="am-import-dish-photo">
            <Image
              src="/landing/menu-cart/biryani.jpg"
              alt=""
              fill
              sizes="120px"
            />
            <i>
              <Sparkles size={12} strokeWidth={2.6} />
              AI photo
            </i>
          </span>
          <div className="am-import-dish-body">
            <strong>Chicken Biryani</strong>
            <p>
              Fragrant basmati layered with slow-cooked chicken, caramelised onions and warm
              spices.
            </p>
            <div className="am-import-stats">
              <span>420 kcal</span>
              <span>25 min</span>
              <span>Medium</span>
            </div>
            <div className="am-import-tags">
              <i>Dairy</i>
              <i>Nuts</i>
              <i>Gluten</i>
            </div>
          </div>
        </div>

        <div className="am-import-fields">
          {IMPORT_FIELDS.map((field) => (
            <i key={field}>
              <Check size={12} strokeWidth={3} />
              {field}
            </i>
          ))}
        </div>
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
  cta?: string;
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
    title: "AI fills in every detail in one click",
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
    id: "insight",
    tone: "plain",
    Icon: ShoppingCart,
    title: "AI insights in the cart",
    desc: "Suggest the right add-on so guests order more — without awkward upselling.",
  },
  {
    id: "offer",
    tone: "accent",
    Icon: BadgePercent,
    title: "Offers and Loyalty Stamps",
    desc: "Show live offers while guests browse and connect the visit to Froq Loyalty Stamps. One QR, one journey.",
    cta: "Get started",
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
  if (id === "lang") {
    return (
      <div className="am-tile-lang" aria-hidden="true">
        <span className="am-tile-lang-pills">
          <i>EN</i>
          <i className="is-active">हिन्दी</i>
          <i>मराठी</i>
          <i>தமிழ்</i>
        </span>
        <span className="am-tile-lang-dish">
          <b>पनीर टिक्का बर्गर</b>
          <em>चारग्रिल्ड पनीर · मिंट मेयो</em>
        </span>
      </div>
    );
  }
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
          <Sparkles size={18} strokeWidth={2.5} />
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
          <Mic size={16} strokeWidth={2.5} />
          कुछ हल्का और वेज बताओ?
        </span>
        <span className="am-tile-chat-out">
          <span className="am-tile-chat-typing" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="am-tile-chat-reply">
            <span className="am-tile-chat-reply-text">
              पनीर स्लाइडर अच्छा रहेगा — हल्का, वेज,{" "}
              <i>₹189</i>
            </span>
          </span>
        </span>
      </div>
    );
  }
  if (id === "insight") {
    return (
      <div className="am-tile-cart" aria-hidden="true">
        <div className="am-tile-cart-card">
          <span className="am-tile-cart-lines">
            <i>
              <span className="am-tile-cart-thumb">
                <Image
                  src="/landing/menu-cart/biryani.jpg"
                  alt=""
                  fill
                  sizes="40px"
                />
              </span>
              <b>Chicken Biryani</b>
              <em>₹320</em>
            </i>
            <i>
              <span className="am-tile-cart-thumb">
                <Image
                  src="/landing/menu-cart/naan.jpg"
                  alt=""
                  fill
                  sizes="40px"
                />
              </span>
              <b>Butter Naan</b>
              <em>₹80</em>
            </i>
          </span>
          <span className="am-tile-pick">
            <span className="am-tile-pick-badge">
              <Sparkles size={11} strokeWidth={2.6} />
              AI pick
            </span>
            <span className="am-tile-pick-body">
              <span className="am-tile-pick-photo">
                <Image
                  src="/landing/menu-cart/raita.jpg"
                  alt=""
                  fill
                  sizes="56px"
                />
              </span>
              <span className="am-tile-pick-meta">
                <strong>Cooling Raita</strong>
                <b>₹120</b>
              </span>
              <span className="am-tile-pick-add">
                <Plus size={14} strokeWidth={2.6} />
                Add
              </span>
            </span>
          </span>
        </div>
      </div>
    );
  }
  if (id === "offer") {
    return (
      <div className="am-tile-loyalty" aria-hidden="true">
        <span className="am-tile-loyalty-brand">
          <Coffee size={12} strokeWidth={2.3} />
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
              <i className="is-on">
                <Check size={10} strokeWidth={3} />
              </i>
              <i className="is-on">
                <Check size={10} strokeWidth={3} />
              </i>
              <i className="is-on">
                <Check size={10} strokeWidth={3} />
              </i>
              <i className="is-on">
                <Check size={10} strokeWidth={3} />
              </i>
              <i className="is-next" />
            </span>
            <em>Collect</em>
          </span>

          <span className="am-tile-loyalty-rail is-b" />

          <span className="am-tile-loyalty-step">
            <span className="am-tile-loyalty-node is-reward">
              <Coffee size={20} strokeWidth={2.1} />
            </span>
            <em>Free coffee</em>
          </span>
        </span>
      </div>
    );
  }
  return null;
}

export function MenuCapabilities() {
  return (
    <div className="am-bento">
      {CAPABILITIES.map(({ id, tone, Icon, title, desc, cta }, i) => (
        <Reveal
          key={id}
          className={`am-tile am-tile--${tone} am-tile--${id}`}
          delay={i * 50}
        >
          <span className="am-tile-icon" aria-hidden="true">
            <Icon size={19} strokeWidth={2.1} />
          </span>
          <h3 className="am-tile-title">{title}</h3>
          {desc ? <p className="am-tile-desc">{desc}</p> : null}
          {cta ? (
            <a href="#pricing" className="lp-btn am-tile-cta">
              {cta}
              <ArrowRight size={16} strokeWidth={2.4} />
            </a>
          ) : null}
          <TileVisual id={id} />
        </Reveal>
      ))}
    </div>
  );
}
