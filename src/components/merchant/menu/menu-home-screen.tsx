"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ImageIcon,
  Languages,
  LayoutGrid,
  QrCode,
  Sparkles,
  Type,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { countMenuUsedForPlanMeter } from "@/app/merchant/menu-actions";
import { fetchMenuCustomers } from "@/app/merchant/menu-customers-actions";
import { canEditMenu } from "@/lib/merchant/roles";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { BuyAiCreditsDrawer } from "./buy-ai-credits-drawer";
import { AiCreditsSkeleton } from "./menu-skeletons";
import { MenuSetupCard } from "./menu-setup-card";
import { useMenuSetup } from "./use-menu-setup";

const BREAKDOWN_COLORS: Record<string, string> = {
  menu_descriptions: "#00c96b",
  menu_images: "#f59e0b",
  menu_imports: "#ef4444",
  customer_chat: "#0ea5e9",
  marketing: "#8b5cf6",
  other: "#64748b",
};

function historyIcon(feature: string) {
  if (feature.includes("image")) return ImageIcon;
  if (feature.includes("import")) return UtensilsCrossed;
  if (feature.includes("translate")) return Languages;
  if (feature.includes("reply") || feature.includes("chat")) return Sparkles;
  return Type;
}

/**
 * AI Menu home — digital menu hub (dishes, offers, QR). Floor ops are out of scope.
 */
export function MenuHomeScreen() {
  const {
    activeBranchId,
    branches,
    goToTab,
    onShowQr,
    onPurchaseProduct,
    role,
    profile,
  } = useMerchantWorkspace();
  const setup = useMenuSetup(activeBranchId);
  const canSetup = canEditMenu(role);
  const canUpgrade = role === "owner";

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const viewingAllBranches = activeBranchId === null && branches.length > 1;
  const branchLabel = activeBranch?.name ?? null;

  const [guestCount, setGuestCount] = useState(0);
  const [buyOpen, setBuyOpen] = useState(false);
  const [planUsageLoading, setPlanUsageLoading] = useState(true);
  const [planUsage, setPlanUsage] = useState<{
    used: number;
    limit: number;
    available: number;
    purchasedRemaining: number;
    cycleEndsAt: string | null;
    breakdown: Array<{ bucket: string; label: string; credits: number }>;
    history: Array<{
      id: string;
      feature: string;
      label: string;
      creditsUsed: number;
      createdAt: string;
    }>;
  } | null>(null);

  const loadGuests = useCallback(async () => {
    const result = await fetchMenuCustomers({ branchId: activeBranchId });
    if (result.ok) setGuestCount(result.customers?.length ?? 0);
  }, [activeBranchId]);

  const loadPlanUsage = useCallback(async () => {
    try {
      const result = await countMenuUsedForPlanMeter();
      if (!result.ok) {
        setPlanUsage(null);
        return;
      }
      setPlanUsage({
        used: result.conversations,
        limit: result.maxConversations,
        available: result.available,
        purchasedRemaining: result.purchasedRemaining,
        cycleEndsAt: result.cycleEndsAt,
        breakdown: result.breakdown,
        history: result.history,
      });
    } finally {
      setPlanUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuests();
    void loadPlanUsage();
  }, [loadGuests, loadPlanUsage]);

  const isReady = setup.itemCount > 0;
  const eyebrow = viewingAllBranches
    ? "All branches"
    : branchLabel
      ? branchLabel
      : "Digital menu";
  const subtitle = !isReady
    ? "Add dishes once — guests browse from the Menu QR."
    : viewingAllBranches
      ? "Menu and offers are shared across your brand."
      : "Edit dishes, run offers, and share the Menu QR.";

  const metrics = [
    {
      id: "dishes",
      label: "Dishes",
      value: setup.loading ? "—" : setup.itemCount,
      Icon: UtensilsCrossed,
      accent: !setup.loading && !isReady,
    },
    {
      id: "sections",
      label: "Sections",
      value: setup.loading ? "—" : setup.categories.length,
      Icon: LayoutGrid,
      accent: false,
    },
    {
      id: "guests",
      label: "Guests",
      value: setup.loading ? "—" : guestCount,
      Icon: Users,
      accent: !setup.loading && guestCount > 0,
    },
  ] as const;

  const fmt = (n: number) => n.toLocaleString("en-IN");
  const usagePct = (used: number, max: number) =>
    max > 0 ? Math.min(100, (used / max) * 100) : 0;

  const creditsPct = planUsage ? usagePct(planUsage.used, planUsage.limit) : 0;
  const resetLabel = planUsage?.cycleEndsAt
    ? new Date(planUsage.cycleEndsAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      time: d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  };

  const segmentBar = useMemo(() => {
    if (!planUsage || planUsage.limit <= 0) {
      return {
        segments: [] as Array<{
          key: string;
          label: string;
          credits: number;
          pct: number;
          color: string;
        }>,
        availablePct: 100,
      };
    }
    const segments = planUsage.breakdown
      .filter((row) => row.credits > 0)
      .map((row) => ({
        key: row.bucket,
        label: row.label,
        credits: row.credits,
        pct: (row.credits / planUsage.limit) * 100,
        color: BREAKDOWN_COLORS[row.bucket] ?? BREAKDOWN_COLORS.other,
      }));
    const usedKnown = segments.reduce((sum, row) => sum + row.credits, 0);
    const remainderUsed = Math.max(0, planUsage.used - usedKnown);
    if (remainderUsed > 0) {
      segments.push({
        key: "other",
        label: "Other",
        credits: remainderUsed,
        pct: (remainderUsed / planUsage.limit) * 100,
        color: BREAKDOWN_COLORS.other,
      });
    }
    const usedPct = Math.min(100, (planUsage.used / planUsage.limit) * 100);
    return { segments, availablePct: Math.max(0, 100 - usedPct) };
  }, [planUsage]);

  return (
    <div className="tab-screen merchant-dashboard menu-home">
      <div className="merchant-home-intro">
        <div className="merchant-home-intro-copy">
          <p className="merchant-home-eyebrow">{eyebrow}</p>
          <h2 className="merchant-home-title">AI Menu</h2>
          <p className="merchant-home-sub">{subtitle}</p>
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-home-metrics" aria-label="Menu at a glance">
          {metrics.map(({ id, label, value, Icon, accent }) => (
            <div
              key={id}
              className={`merchant-home-metric${accent ? " merchant-home-metric--accent" : ""}`}
            >
              <span className="merchant-home-metric-icon" aria-hidden>
                <Icon size={16} strokeWidth={2.3} />
              </span>
              <span className="merchant-home-metric-value">{value}</span>
              <span className="merchant-home-metric-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {canSetup && !setup.loading ? (
        <MenuSetupCard
          itemCount={setup.itemCount}
          onChanged={() => void setup.refresh()}
        />
      ) : null}

      <section className="merchant-section">
        <div className="panel-card merchant-home-tools">
          <p className="merchant-home-tools-label">Quick actions</p>
          <div className="merchant-quick-actions merchant-quick-actions--all">
            <button
              type="button"
              className="queue-action"
              onClick={() => goToTab("menu-items")}
            >
              <span className="queue-action-icon queue-action-icon--accent" aria-hidden>
                <BookOpen size={18} strokeWidth={2.2} />
              </span>
              Edit menu
            </button>
            <button
              type="button"
              className="queue-action"
              onClick={() => goToTab("menu-customers")}
            >
              <span className="queue-action-icon" aria-hidden>
                <Users size={18} strokeWidth={2.2} />
              </span>
              Customers
            </button>
            <button
              type="button"
              className="queue-action"
              onClick={() => onShowQr("menu")}
              disabled={!profile.slug}
            >
              <span className="queue-action-icon" aria-hidden>
                <QrCode size={18} strokeWidth={2.2} />
              </span>
              Menu QR
            </button>
          </div>
        </div>
      </section>

      {planUsageLoading ? (
        <AiCreditsSkeleton />
      ) : planUsage ? (
        <section className="merchant-section" aria-label="AI Credits">
          <div className="ai-credits-card panel-card">
            <header className="ai-credits-head">
              <div className="ai-credits-brand">
                <span className="ai-credits-brand-icon" aria-hidden>
                  <Sparkles size={18} strokeWidth={2.3} />
                </span>
                <div>
                  <h3 className="ai-credits-title">AI Credits</h3>
                  <p className="ai-credits-sub">Power your menu with AI</p>
                </div>
              </div>
              {resetLabel ? (
                <p className="ai-credits-reset">
                  <CalendarDays size={14} strokeWidth={2.2} aria-hidden />
                  Resets on <strong>{resetLabel}</strong>
                </p>
              ) : null}
            </header>

            <div className="ai-credits-section">
              <p className="ai-credits-section-label">Usage</p>
              <div className="ai-credits-used">
                <div className="ai-credits-used-main">
                  <p className="ai-credits-used-label">Credits used</p>
                  <p className="ai-credits-used-value">
                    <span>{fmt(planUsage.used)}</span>
                    {" / "}
                    {fmt(planUsage.limit)}
                  </p>
                  <p className="ai-credits-used-avail">
                    {fmt(planUsage.available)} available
                    {planUsage.purchasedRemaining > 0
                      ? ` · ${fmt(planUsage.purchasedRemaining)} purchased`
                      : ""}
                  </p>
                </div>
                <div className="ai-credits-used-side">
                  <p>
                    {fmt(planUsage.used)} ({creditsPct.toFixed(2)}%) used
                  </p>
                  <p>{fmt(planUsage.limit)} total</p>
                </div>
              </div>

              <div
                className="ai-credits-segments"
                role="img"
                aria-label={`AI Credits: ${planUsage.used} of ${planUsage.limit}`}
              >
                {segmentBar.segments.map((seg) => (
                  <span
                    key={seg.key}
                    className="ai-credits-segment"
                    style={{
                      width: `${Math.max(seg.pct, seg.credits > 0 ? 0.35 : 0)}%`,
                      background: seg.color,
                    }}
                    title={`${seg.label}: ${fmt(seg.credits)}`}
                  />
                ))}
                <span
                  className="ai-credits-segment ai-credits-segment--rest"
                  style={{ width: `${Math.max(segmentBar.availablePct, 0)}%` }}
                />
              </div>

              <ul className="ai-credits-legend">
                {segmentBar.segments.map((seg) => (
                  <li key={seg.key}>
                    <span
                      className="ai-credits-legend-dot"
                      style={{ background: seg.color }}
                      aria-hidden
                    />
                    {seg.label} {fmt(seg.credits)} ({seg.pct.toFixed(2)}%)
                  </li>
                ))}
                <li>
                  <span
                    className="ai-credits-legend-dot ai-credits-legend-dot--rest"
                    aria-hidden
                  />
                  Available {fmt(planUsage.available)} (
                  {segmentBar.availablePct.toFixed(2)}%)
                </li>
              </ul>
            </div>

            <div className="ai-credits-section">
              <p className="ai-credits-section-label">Recent usage</p>
              {planUsage.history.length === 0 ? (
                <p className="ai-credits-history-empty">
                  {planUsage.used > 0
                    ? "Usage is counted, but detailed history isn’t available yet."
                    : "No AI credits used yet this period."}
                </p>
              ) : (
                <ul className="ai-credits-history-list">
                  {planUsage.history.map((row) => {
                    const when = formatWhen(row.createdAt);
                    const Icon = historyIcon(row.feature);
                    return (
                      <li key={row.id}>
                        <span className="ai-credits-history-icon" aria-hidden>
                          <Icon size={14} strokeWidth={2.2} />
                        </span>
                        <div className="ai-credits-history-copy">
                          <span className="ai-credits-history-label">
                            {row.label}
                          </span>
                          <span className="ai-credits-history-when">
                            {when.date} · {when.time}
                          </span>
                        </div>
                        <span className="ai-credits-history-cost">
                          −{fmt(row.creditsUsed)}{" "}
                          {row.creditsUsed === 1 ? "credit" : "credits"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {canUpgrade ? (
              <div className="ai-credits-section ai-credits-section--actions">
                <div className="ai-credits-actions">
                  <button
                    type="button"
                    className="ai-credits-upgrade"
                    onClick={() => onPurchaseProduct("menu")}
                  >
                    <ArrowUpRight size={16} strokeWidth={2.4} aria-hidden />
                    Upgrade Plan
                  </button>
                  <button
                    type="button"
                    className="cta-btn merchant-cta-accent ai-credits-buy-btn"
                    onClick={() => setBuyOpen(true)}
                  >
                    <Wallet size={16} strokeWidth={2.2} aria-hidden />
                    Buy AI Credits
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {canUpgrade ? (
        <BuyAiCreditsDrawer
          open={buyOpen}
          onClose={() => setBuyOpen(false)}
          onPurchased={() => void loadPlanUsage()}
        />
      ) : null}
    </div>
  );
}
