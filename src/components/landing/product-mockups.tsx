"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Bell,
  Clock,
  Coffee,
  Gift,
  Globe2,
  Lock,
  MessageCircle,
  MessageSquareText,
  Plus,
  QrCode,
  Sparkles,
  Stamp,
  Star,
  Tag,
  TrendingUp,
  Unlock,
  UserRound,
  Users,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────
   Floating glass callout — solid, crisp metric chip over a mockup.
   ───────────────────────────────────────────────────────────────────────── */
interface FloatingStatProps {
  icon?: ReactNode;
  label: string;
  value: string;
  trend?: string;
  className?: string;
  style?: CSSProperties;
}

export function FloatingStat({ icon, label, value, trend, className, style }: FloatingStatProps) {
  return (
    <div className={`lpm-float${className ? ` ${className}` : ""}`} style={style}>
      {icon ? <div className="lpm-float-icon">{icon}</div> : null}
      <div className="lpm-float-copy">
        <span className="lpm-float-label">{label}</span>
        <span className="lpm-float-value">{value}</span>
      </div>
      {trend ? (
        <span className="lpm-float-trend">
          <TrendingUp size={11} strokeWidth={2.6} />
          {trend}
        </span>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phone frame.
   ───────────────────────────────────────────────────────────────────────── */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`lpm-phone${className ? ` ${className}` : ""}`}>
      <span className="lpm-phone-btn lpm-phone-btn--power" aria-hidden="true" />
      <span className="lpm-phone-btn lpm-phone-btn--vol" aria-hidden="true" />
      <div className="lpm-phone-screen">
        <div className="lpm-phone-status" aria-hidden="true">
          <span>9:41</span>
          <span className="lpm-phone-notch" />
          <span className="lpm-phone-status-r" />
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Loyalty pass — faithful reproduction of the real customer wallet pass.
   ───────────────────────────────────────────────────────────────────────── */
function StampCell({ state }: { state: "filled" | "next" | "empty" | "reward" }) {
  const icon =
    state === "reward" ? (
      <Gift size={18} strokeWidth={2.75} />
    ) : state === "filled" ? (
      <Unlock size={18} strokeWidth={2.75} />
    ) : state === "next" ? (
      <Clock size={17} strokeWidth={2} />
    ) : (
      <Lock size={18} strokeWidth={2.75} />
    );

  const cls =
    state === "reward"
      ? "stamp reward"
      : state === "filled"
        ? "stamp filled"
        : state === "next"
          ? "stamp next"
          : "stamp";

  return <div className={cls}>{icon}</div>;
}

/** Real guest wallet pass — usable alone or inside a phone frame. */
export function LoyaltyPassCard({
  filled = 6,
  total = 10,
  className,
}: {
  filled?: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className={`pass lpm-pass${className ? ` ${className}` : ""}`}>
      <div className="pass-top">
        <div className="pass-brand">
          <div className="pass-brand-mark">
            <Coffee size={17} strokeWidth={2.2} color="#fff" />
          </div>
          <div className="pass-brand-name">Bloom Coffee Co.</div>
        </div>
      </div>

      <div className="pass-headline">
        <div className="pass-headline-text">
          <h2 className="pass-title">Free Coffee</h2>
          <p className="pass-subtitle">Collect {total} stamps</p>
        </div>
        <div className="lpm-pass-thumb">
          <Coffee size={28} strokeWidth={2} />
        </div>
      </div>

      <div
        className="stamp-grid"
        style={{ ["--stamp-cols" as string]: Math.min(total, 5) }}
      >
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < filled;
          const isNext = i === filled;
          const isReward = i === total - 1 && i > filled;
          const state = isFilled
            ? "filled"
            : isNext
              ? "next"
              : isReward
                ? "reward"
                : "empty";
          return <StampCell key={i} state={state} />;
        })}
      </div>

      <div className="pass-divider" />

      <div className="pass-bottom">
        <div>
          <div className="pass-bottom-label">Progress</div>
          <span className="pass-bottom-value">
            {filled} / {total} Collected
          </span>
        </div>
        <div className="pass-bottom-r">
          <div className="pass-customer-name">Alex Morgan</div>
          <div className="pass-avatar">AM</div>
        </div>
      </div>
    </div>
  );
}

export function LoyaltyPhoneMockup({ filled = 6, total = 10 }: { filled?: number; total?: number }) {
  return (
    <PhoneFrame className="lpm-phone--loyalty">
      <div className="lpm-loyalty-screen">
        <LoyaltyPassCard filled={filled} total={total} />
      </div>
    </PhoneFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Merchant dashboard — faithful reproduction of the real dashboard screen.
   ───────────────────────────────────────────────────────────────────────── */
const DASH_BARS = [
  { label: "M", value: 40 },
  { label: "T", value: 55 },
  { label: "W", value: 48 },
  { label: "T", value: 72 },
  { label: "F", value: 64 },
  { label: "S", value: 90 },
  { label: "S", value: 100 },
];

const DASH_STATS = [
  { Icon: Users, value: "642", label: "Total customers" },
  { Icon: Stamp, value: "94", label: "Stamps today" },
  { Icon: Clock, value: "5", label: "Pending approval" },
  { Icon: Gift, value: "12", label: "Rewards", accent: true },
];

export function MerchantDashboardMockup() {
  return (
    <div className="lpm-dash">
      <div className="lpm-dash-head">
        <div>
          <div className="lpm-dash-title">Dashboard</div>
          <div className="lpm-dash-sub">Bloom Coffee Co.</div>
        </div>
        <span className="lpm-dash-pill">
          This week
          <ArrowUpRight size={13} strokeWidth={2.6} />
        </span>
      </div>

      <div className="merchant-ltv-card lpm-ltv">
        <span className="merchant-ltv-eyebrow">Loyalty Performance</span>
        <div className="merchant-ltv-value">642</div>
        <div className="merchant-ltv-metrics">
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Active members</span>
            <span className="merchant-ltv-tile-value">486</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Stamps this week</span>
            <span className="merchant-ltv-tile-value">318</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Rewards claimed</span>
            <span className="merchant-ltv-tile-value">54</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Avg. visits</span>
            <span className="merchant-ltv-tile-value">8.4</span>
          </div>
        </div>
      </div>

      <div className="merchant-stat-grid lpm-stat-grid">
        {DASH_STATS.map(({ Icon, value, label, accent }) => (
          <div key={label} className="merchant-stat-card">
            <div className={`merchant-stat-icon${accent ? " merchant-stat-icon--accent" : ""}`}>
              <Icon size={18} strokeWidth={2.2} />
            </div>
            <div className="merchant-stat-value">{value}</div>
            <div className="merchant-stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="panel-card merchant-chart-card lpm-chart">
        <div className="merchant-chart-head">
          <div>
            <div className="merchant-chart-title">Weekly visits</div>
            <div className="merchant-chart-sub">Repeat customers this week</div>
          </div>
        </div>
        <div className="merchant-chart-bars">
          {DASH_BARS.map((bucket, i) => (
            <div key={i} className="merchant-chart-bar-col">
              <div className="merchant-chart-bar" style={{ height: `${bucket.value}%` }} />
              <span className="merchant-chart-bar-label">{bucket.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Growth chart — repeat customers climbing (before/after).
   ───────────────────────────────────────────────────────────────────────── */
export function GrowthChartMockup() {
  return (
    <div className="panel-card lpm-growth">
      <div className="lpm-growth-head">
        <div>
          <div className="lpm-growth-title">Repeat visit rate</div>
          <div className="lpm-growth-sub">Last 6 months</div>
        </div>
        <span className="lpm-growth-badge">
          <ArrowUpRight size={13} strokeWidth={2.6} />
          2.4×
        </span>
      </div>
      <div className="lpm-growth-plot">
        <svg viewBox="0 0 300 140" preserveAspectRatio="none" className="lpm-growth-svg">
          <defs>
            <linearGradient id="lpmArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,118 C40,112 60,96 96,86 C132,76 150,58 192,44 C232,31 260,20 300,12 L300,140 L0,140 Z"
            fill="url(#lpmArea)"
          />
          <path
            d="M0,118 C40,112 60,96 96,86 C132,76 150,58 192,44 C232,31 260,20 300,12"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span className="lpm-growth-dot" />
      </div>
      <div className="lpm-growth-foot">
        <div className="lpm-growth-foot-item">
          <span className="lpm-growth-foot-label">Before Froq</span>
          <span className="lpm-growth-foot-value lpm-growth-foot-value--muted">18%</span>
        </div>
        <div className="lpm-growth-foot-item">
          <span className="lpm-growth-foot-label">With Froq</span>
          <span className="lpm-growth-foot-value">43%</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QR onboarding poster — mirrors the real printable counter poster.
   ───────────────────────────────────────────────────────────────────────── */
const QR_DIM = 21;

function isFinder(r: number, c: number) {
  const inBox = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
  return inBox(0, 0) || inBox(0, QR_DIM - 7) || inBox(QR_DIM - 7, 0);
}

function finderOn(r: number, c: number) {
  const local = (br: number, bc: number) => {
    const lr = r - br;
    const lc = c - bc;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true; // outer ring
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true; // inner block
    return false;
  };
  if (r < 7 && c < 7) return local(0, 0);
  if (r < 7 && c >= QR_DIM - 7) return local(0, QR_DIM - 7);
  return local(QR_DIM - 7, 0);
}

// Deterministic data cells (stable across SSR/CSR — no Math.random).
function dataOn(r: number, c: number) {
  return (r * 31 + c * 17 + ((r * c) % 7) + (r % 3) * 5) % 2 === 0;
}

const QR_CELLS = Array.from({ length: QR_DIM * QR_DIM }, (_, i) => {
  const r = Math.floor(i / QR_DIM);
  const c = i % QR_DIM;
  if (isFinder(r, c)) return finderOn(r, c) ? 1 : 0;
  return dataOn(r, c) ? 1 : 0;
});

export function QrOnboardingMockup() {
  return (
    <div className="lpm-poster">
      <div className="lpm-poster-head">SCAN HERE</div>
      <div className="lpm-poster-pill">FOR FREE REWARDS</div>
      <div className="lpm-poster-qr" aria-hidden="true">
        <div className="lpm-qr-grid" style={{ "--qr-dim": QR_DIM } as CSSProperties}>
          {QR_CELLS.map((on, i) => (
            <span key={i} className="lpm-qr-cell" data-on={on} />
          ))}
        </div>
        <span className="lpm-qr-scan" />
      </div>
      <div className="lpm-poster-cap">Please scan QR code to get rewards</div>
      <div className="lpm-poster-foot">
        <QrCode size={13} strokeWidth={2.6} />
        <span>
          Powered by <strong>FROQ.IO</strong>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   AI Digital Menu guest phone — minimal SoftUI: brand + pick + dock.
   ───────────────────────────────────────────────────────────────────────── */
export function MenuPhoneMockup() {
  return (
    <PhoneFrame className="lpm-phone--menu">
      <div className="lpm-menu-screen lpm-menu-screen--minimal">
        <div className="lpm-menu-top">
          <span className="lpm-menu-mark">JB</span>
          <span className="lpm-menu-brand">
            <strong>JIMIS BURGER</strong>
            <em>Open · 12–10 pm</em>
          </span>
          <span className="lpm-menu-lang">
            <Globe2 size={10} strokeWidth={2.4} />
            EN
          </span>
        </div>

        <div className="lpm-menu-body">
          <div className="lpm-menu-section">
            <span className="lpm-menu-section-title">Chef&apos;s choice</span>
            <span className="lpm-menu-section-tag">
              <Star size={9} strokeWidth={2.6} />
              PICKS
            </span>
          </div>

          <div className="lpm-menu-pick">
            <span className="lpm-menu-pick-photo">
              <Image src="/landing/menu-cart/biryani.jpg" alt="" fill sizes="200px" />
            </span>
            <span className="lpm-menu-pick-meta">
              <strong>
                <Star size={10} strokeWidth={2.4} />
                Chicken Biryani
              </strong>
              <em>Basmati · Slow-cooked</em>
              <span className="lpm-menu-pick-row">
                <b>₹320</b>
                <i>
                  Ask
                  <Plus size={10} strokeWidth={2.6} />
                </i>
              </span>
            </span>
          </div>
        </div>

        <div className="lpm-menu-dock">
          <span className="lpm-menu-dock-ask">
            <Sparkles size={13} strokeWidth={2.2} />
            AI Menu Assistant
          </span>
          <span className="lpm-menu-dock-btn" aria-hidden="true">
            <Tag size={15} strokeWidth={2} />
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Hero stage: SoftUI phone + outer Ask AI float. */
export function MenuHeroVisual() {
  return (
    <div className="am-hero-visual" aria-hidden="true">
      <div className="am-hero-rings" />
      <div className="am-hero-stage">
        <MenuPhoneMockup />

        <div className="am-hero-chat">
          <div className="am-hero-chat-head">
            <MessageSquareText size={13} strokeWidth={2.4} />
            Ask AI
          </div>
          <div className="am-hero-chat-bubble is-guest">Something light?</div>
          <div className="am-hero-chat-bubble is-ai">
            Try <b>Cooling Raita</b> — mild, ₹89
          </div>
        </div>
      </div>
    </div>
  );
}

/** Hero stage: loyalty phone + reward unlocked float. */
export function LoyaltyHeroVisual() {
  return (
    <div className="am-hero-visual" aria-hidden="true">
      <div className="am-hero-rings" />
      <div className="am-hero-stage am-hero-stage--loyalty">
        <LoyaltyPhoneMockup filled={7} total={10} />

        <div className="am-hero-chat am-hero-chat--loyalty">
          <div className="am-hero-chat-head">
            <Gift size={13} strokeWidth={2.4} />
            Reward unlocked
          </div>
          <div className="am-hero-chat-bubble is-ai">
            <b>Free coffee</b> ready on the next visit
          </div>
          <div className="am-hero-chat-bubble is-guest">7 / 10 stamps</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Smart Queue — guest waitlist ticket phone.
   ───────────────────────────────────────────────────────────────────────── */
export function QueueTicketCard({
  token = "08",
  name = "Priya N.",
  party = 3,
  waitMinutes = 22,
  className,
}: {
  token?: string;
  name?: string;
  party?: number;
  waitMinutes?: number;
  className?: string;
}) {
  return (
    <div className={`qs-ticket${className ? ` ${className}` : ""}`}>
      <div className="qs-ticket-head">
        <span className="qs-ticket-eyebrow">Waitlist ticket</span>
        <span className="qs-ticket-status">
          <i aria-hidden="true" />
          Waiting
        </span>
      </div>

      <div className="qs-ticket-token">
        <span className="qs-ticket-token-label">In line</span>
        <span className="qs-ticket-token-value">
          <span aria-hidden="true">#</span>
          {token}
        </span>
        <span className="qs-ticket-token-name">
          <UserRound size={13} strokeWidth={2.3} />
          {name}
          {party > 1 ? ` +${party - 1}` : ""}
        </span>
      </div>

      <div className="qs-ticket-divider" />

      <div className="qs-ticket-stats">
        <div>
          <strong>
            ~{waitMinutes}
            <i>m</i>
          </strong>
          <em>Est. wait</em>
        </div>
        <div>
          <strong>{party}</strong>
          <em>Party size</em>
        </div>
      </div>
    </div>
  );
}

export function QueuePhoneMockup() {
  return (
    <PhoneFrame className="lpm-phone--queue">
      <div className="lpm-queue-screen">
        <div className="lpm-queue-top">
          <span className="lpm-queue-mark">OT</span>
          <span className="lpm-queue-brand">
            <strong>Oven Theory</strong>
            <em>Live waitlist</em>
          </span>
        </div>
        <QueueTicketCard />
        <div className="lpm-queue-hint">
          <Bell size={12} strokeWidth={2.4} />
          We&apos;ll WhatsApp you when ready
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Hero stage: queue phone + WhatsApp ready float. */
export function QueueHeroVisual() {
  return (
    <div className="am-hero-visual" aria-hidden="true">
      <div className="am-hero-rings" />
      <div className="am-hero-stage am-hero-stage--queue">
        <QueuePhoneMockup />

        <div className="am-hero-chat am-hero-chat--queue">
          <div className="am-hero-chat-head">
            <MessageCircle size={13} strokeWidth={2.4} />
            WhatsApp
          </div>
          <div className="am-hero-chat-bubble is-ai">
            Table ready — <b>#08</b>, party of 3
          </div>
          <div className="am-hero-chat-bubble is-guest">On our way!</div>
        </div>
      </div>
    </div>
  );
}
