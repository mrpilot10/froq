"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUpRight,
  Clock,
  Coffee,
  Gift,
  Lock,
  QrCode,
  Stamp,
  TrendingUp,
  Unlock,
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

export function LoyaltyPhoneMockup({ filled = 6, total = 10 }: { filled?: number; total?: number }) {
  return (
    <PhoneFrame className="lpm-phone--loyalty">
      <div className="lpm-loyalty-screen">
        <div className="pass lpm-pass">
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
              <p className="pass-subtitle">Collect 10 stamps</p>
            </div>
            <div className="lpm-pass-thumb">
              <Coffee size={28} strokeWidth={2} />
            </div>
          </div>

          <div className="stamp-grid">
            {Array.from({ length: total }).map((_, i) => {
              const isReward = i === total - 1;
              const isFilled = i < filled;
              const isNext = i === filled && !isFilled && !isReward;
              const state = isReward
                ? "reward"
                : isFilled
                  ? "filled"
                  : isNext
                    ? "next"
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
        <span className="merchant-ltv-eyebrow">Average customer LTV</span>
        <div className="merchant-ltv-value">₹4,200</div>
        <div className="merchant-ltv-metrics">
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Total lifetime value</span>
            <span className="merchant-ltv-tile-value">₹2.7L</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Avg. order</span>
            <span className="merchant-ltv-tile-value">₹500</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Total customers</span>
            <span className="merchant-ltv-tile-value">642</span>
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
