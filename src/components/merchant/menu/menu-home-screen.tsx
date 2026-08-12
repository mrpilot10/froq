"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ImageIcon,
  Info,
  Languages,
  LayoutGrid,
  QrCode,
  ShoppingBag,
  Sparkles,
  TrendingUp,
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
    monthlyTotal: number;
    purchasedRemaining: number;
    cycleEndsAt: string | null;
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
        monthlyTotal: result.monthlyTotal,
        purchasedRemaining: result.purchasedRemaining,
        cycleEndsAt: result.cycleEndsAt,
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

  const creditStats = useMemo(() => {
    if (!planUsage) return null;
    const monthlyTotal = Math.max(0, planUsage.monthlyTotal);
    const monthlyUsed = Math.max(0, planUsage.used);
    const monthlyRemaining = Math.max(0, monthlyTotal - monthlyUsed);
    const remainingPct =
      monthlyTotal > 0
        ? Math.round((monthlyRemaining / monthlyTotal) * 100)
        : 0;
    const resetDate = planUsage.cycleEndsAt
      ? new Date(planUsage.cycleEndsAt)
      : null;
    const daysUntilReset =
      resetDate != null
        ? Math.max(
            0,
            Math.ceil(
              (resetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null;
    const resetLabel = resetDate
      ? resetDate.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;
    return {
      monthlyTotal,
      monthlyUsed,
      monthlyRemaining,
      remainingPct,
      daysUntilReset,
      resetLabel,
      purchasedRemaining: Math.max(0, planUsage.purchasedRemaining),
    };
  }, [planUsage]);

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

  const ringRadius = 36;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = creditStats
    ? ringCircumference * (1 - creditStats.remainingPct / 100)
    : ringCircumference;

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
      ) : planUsage && creditStats ? (
        <section className="merchant-section" aria-label="AI Credits">
          <div className="ai-credits-card panel-card">
            <header className="ai-credits-head">
              <div className="ai-credits-brand">
                <span className="ai-credits-brand-icon" aria-hidden>
                  <Wallet size={18} strokeWidth={2.3} />
                </span>
                <div>
                  <h3 className="ai-credits-title">Credits</h3>
                  <p className="ai-credits-sub">Your usage this month</p>
                </div>
              </div>
            </header>

            <div className="ai-credits-body">
              <div className="ai-credits-monthly">
                <p className="ai-credits-badge">Monthly allowance</p>
                <div className="ai-credits-monthly-main">
                  <div className="ai-credits-monthly-copy">
                    <p className="ai-credits-monthly-label">
                      Monthly credits remaining
                    </p>
                    <p className="ai-credits-monthly-value">
                      <span>{fmt(creditStats.monthlyRemaining)}</span>
                      <small>
                        of {fmt(creditStats.monthlyTotal)} monthly credits
                      </small>
                    </p>
                    <div
                      className="ai-credits-bar"
                      role="img"
                      aria-label={`${creditStats.remainingPct}% of monthly credits remaining`}
                    >
                      <span
                        className="ai-credits-bar-fill"
                        style={{ width: `${creditStats.remainingPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="ai-credits-ring" aria-hidden>
                    <svg viewBox="0 0 88 88" width="88" height="88">
                      <circle
                        className="ai-credits-ring-track"
                        cx="44"
                        cy="44"
                        r={ringRadius}
                        fill="none"
                        strokeWidth="8"
                      />
                      <circle
                        className="ai-credits-ring-progress"
                        cx="44"
                        cy="44"
                        r={ringRadius}
                        fill="none"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={ringOffset}
                        transform="rotate(-90 44 44)"
                      />
                    </svg>
                    <div className="ai-credits-ring-label">
                      <strong>{creditStats.remainingPct}%</strong>
                      <span>remaining</span>
                    </div>
                  </div>
                </div>
                <div className="ai-credits-monthly-meta">
                  <p>
                    <TrendingUp size={15} strokeWidth={2.3} aria-hidden />
                    <span>
                      <strong>{fmt(creditStats.monthlyUsed)}</strong> used this
                      month
                    </span>
                  </p>
                  <span className="ai-credits-monthly-meta-divider" aria-hidden />
                  {creditStats.resetLabel ? (
                    <p>
                      <CalendarDays size={15} strokeWidth={2.3} aria-hidden />
                      <span>
                        {creditStats.daysUntilReset != null ? (
                          <>
                            <strong>
                              Resets in {creditStats.daysUntilReset}{" "}
                              {creditStats.daysUntilReset === 1 ? "day" : "days"}
                            </strong>{" "}
                            on {creditStats.resetLabel}
                          </>
                        ) : (
                          <>
                            <strong>Resets</strong> on {creditStats.resetLabel}
                          </>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p />
                  )}
                </div>
              </div>

              {canUpgrade ? (
                <button
                  type="button"
                  className="ai-credits-purchased"
                  onClick={() => setBuyOpen(true)}
                >
                  <span className="ai-credits-purchased-icon" aria-hidden>
                    <ShoppingBag size={16} strokeWidth={2.2} />
                  </span>
                  <span className="ai-credits-purchased-copy">
                    <strong>Purchased credits</strong>
                    <span>Available to use anytime</span>
                  </span>
                  <span className="ai-credits-purchased-value">
                    <strong>{fmt(creditStats.purchasedRemaining)}</strong>
                    <span>credits available</span>
                  </span>
                  <ChevronRight
                    className="ai-credits-purchased-chevron"
                    size={18}
                    strokeWidth={2.2}
                    aria-hidden
                  />
                </button>
              ) : (
                <div className="ai-credits-purchased ai-credits-purchased--static">
                  <span className="ai-credits-purchased-icon" aria-hidden>
                    <ShoppingBag size={16} strokeWidth={2.2} />
                  </span>
                  <span className="ai-credits-purchased-copy">
                    <strong>Purchased credits</strong>
                    <span>Available to use anytime</span>
                  </span>
                  <span className="ai-credits-purchased-value">
                    <strong>{fmt(creditStats.purchasedRemaining)}</strong>
                    <span>credits available</span>
                  </span>
                </div>
              )}

              <p className="ai-credits-note">
                <Info size={14} strokeWidth={2.3} aria-hidden />
                <span>
                  Monthly unused credits don’t roll over · Purchased credits
                  never expire
                </span>
              </p>
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
                          {row.creditsUsed < 0 ? "+" : "−"}
                          {fmt(Math.abs(row.creditsUsed))}{" "}
                          {Math.abs(row.creditsUsed) === 1
                            ? "credit"
                            : "credits"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
