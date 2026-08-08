"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ChevronDown, UserRound } from "lucide-react";
import { getDashboardStats } from "@/app/merchant/actions";
import { getMenuAnalytics } from "@/app/merchant/menu-actions";
import { getQueueAnalytics } from "@/app/merchant/queue-actions";
import { getReservationAnalytics } from "@/app/merchant/reservation-actions";
import { isProductEnabled } from "@/lib/merchant/entitlements";
import type { MenuAnalytics } from "@/lib/merchant/menu-analytics";
import type { QueueAnalyticsStats, QueueStaffOption } from "@/lib/merchant/queue-analytics";
import type { ReservationAnalytics } from "@/lib/reservations/stats";
import {
  COMING_SOON_PRODUCTS,
  PRODUCTS,
  comingSoonAfterProduct,
  comingSoonBeforeProducts,
  type ComingSoonProduct,
} from "@/lib/merchant/nav";
import type {
  DashboardDateRange,
  DashboardFilteredStats,
  MerchantProduct,
  MerchantProfile,
} from "@/lib/merchant/types";
import { useMerchantWorkspace } from "./merchant-workspace-context";
import {
  LoyaltyAnalyticsView,
  type ChartSort,
} from "./analytics/loyalty-analytics-view";
import { MenuAnalyticsView } from "./analytics/menu-analytics-view";
import { QueueAnalyticsView } from "./analytics/queue-analytics-view";
import { ReservationAnalyticsView } from "./analytics/reservation-analytics-view";
import { AnalyticsSkeleton } from "./analytics/analytics-skeleton";

interface AnalyticsScreenProps {
  profile: MerchantProfile;
  initialStats: DashboardFilteredStats;
  activeBranchId?: string | null;
}

const DATE_RANGES: { value: DashboardDateRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
  { value: "all", label: "All Time" },
];

const CHART_SORTS: { value: ChartSort; label: string }[] = [
  { value: "chronological", label: "Time order" },
  { value: "highest", label: "Highest first" },
];

const ALL_STAFF = "__all_staff__";
const SOON_IDS = new Set(COMING_SOON_PRODUCTS.map((p) => p.id));

type AnalyticsTabId = MerchantProduct | ComingSoonProduct["id"];

type AnalyticsTab =
  | { id: MerchantProduct; name: string; Icon: (typeof PRODUCTS)[number]["Icon"]; soon: false }
  | { id: string; name: string; Icon: ComingSoonProduct["Icon"]; soon: true; product: ComingSoonProduct };

function buildAnalyticsTabs(): AnalyticsTab[] {
  const tabs: AnalyticsTab[] = [];
  for (const product of comingSoonBeforeProducts()) {
    tabs.push({
      id: product.id,
      name: product.name,
      Icon: product.Icon,
      soon: true,
      product,
    });
  }
  for (const live of PRODUCTS) {
    tabs.push({ id: live.id, name: live.name, Icon: live.Icon, soon: false });
    for (const product of comingSoonAfterProduct(live.id)) {
      tabs.push({
        id: product.id,
        name: product.name,
        Icon: product.Icon,
        soon: true,
        product,
      });
    }
  }
  return tabs;
}

const ANALYTICS_TABS = buildAnalyticsTabs();

function isLiveProduct(id: AnalyticsTabId): id is MerchantProduct {
  return !SOON_IDS.has(id);
}

interface LoyaltySnapshot {
  key: string;
  stats: DashboardFilteredStats;
}

interface QueueSnapshot {
  key: string;
  stats: QueueAnalyticsStats | null;
  staffOptions: QueueStaffOption[];
  truncated: boolean;
  error?: string;
}

interface ReservationSnapshot {
  key: string;
  analytics: ReservationAnalytics | null;
  error?: string;
}

interface MenuSnapshot {
  key: string;
  analytics: MenuAnalytics | null;
  truncated: boolean;
  error?: string;
}

export function AnalyticsScreen({
  profile,
  initialStats,
  activeBranchId = null,
}: AnalyticsScreenProps) {
  const { entitlements } = useMerchantWorkspace();

  // Every product stays switchable here even when it isn't subscribed — merchants
  // run the queue before upgrading, and those numbers are real. The tab you land
  // on is the first product you actually own.
  const [tabId, setTabId] = useState<AnalyticsTabId>(
    () => PRODUCTS.find((item) => isProductEnabled(entitlements, item.id))?.id ?? PRODUCTS[0].id,
  );
  const product = isLiveProduct(tabId) ? tabId : null;
  const soonProduct = useMemo(
    () => COMING_SOON_PRODUCTS.find((item) => item.id === tabId) ?? null,
    [tabId],
  );

  const [range, setRange] = useState<DashboardDateRange>("7d");
  const [sort, setSort] = useState<ChartSort>("chronological");

  // Name is remembered alongside the id so the picker can still show whoever is
  // selected after a range change drops them out of the roster.
  const [staff, setStaff] = useState<{ id: string; name: string } | null>(null);

  // Branch scope follows the header switcher — analytics has no picker of its own.
  const branchId = activeBranchId;
  const loyaltyKey = `${branchId ?? "all"}:${range}`;
  const queueKey = `${loyaltyKey}:${staff?.id ?? "all"}`;
  // The workspace bundle already ships 7d / all-branches loyalty stats.
  const preloadedLoyalty = range === "7d" && branchId === null;

  const [loyalty, setLoyalty] = useState<LoyaltySnapshot | null>(null);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [reservation, setReservation] = useState<ReservationSnapshot | null>(null);
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);

  useEffect(() => {
    if (product !== "loyalty" || preloadedLoyalty) return;
    let cancelled = false;
    void (async () => {
      const next = await getDashboardStats(range, branchId);
      if (cancelled || !next) return;
      setLoyalty({ key: loyaltyKey, stats: next });
    })();
    return () => {
      cancelled = true;
    };
  }, [product, preloadedLoyalty, range, branchId, loyaltyKey]);

  useEffect(() => {
    if (product !== "queue") return;
    let cancelled = false;
    void (async () => {
      const result = await getQueueAnalytics({ range, branchId, staffId: staff?.id ?? null });
      if (cancelled) return;
      setQueue({
        key: queueKey,
        stats: result.stats,
        staffOptions: result.staffOptions,
        truncated: result.truncated,
        error: result.ok ? undefined : result.error,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [product, range, branchId, staff, queueKey]);

  useEffect(() => {
    if (product !== "reservation") return;
    let cancelled = false;
    void (async () => {
      const result = await getReservationAnalytics({ range, branchId });
      if (cancelled) return;
      setReservation({
        key: loyaltyKey,
        analytics: result.analytics ?? null,
        error: result.ok ? undefined : result.error,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [product, range, branchId, loyaltyKey]);

  useEffect(() => {
    if (product !== "menu") return;
    let cancelled = false;
    void (async () => {
      const result = await getMenuAnalytics({ range, branchId });
      if (cancelled) return;
      setMenu({
        key: loyaltyKey,
        analytics: result.analytics ?? null,
        truncated: result.truncated ?? false,
        error: result.ok ? undefined : result.error,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [product, range, branchId, loyaltyKey]);

  const freshLoyalty = preloadedLoyalty
    ? initialStats
    : loyalty?.key === loyaltyKey
      ? loyalty.stats
      : null;
  const freshQueue = queue?.key === queueKey ? queue : null;
  const freshReservation = reservation?.key === loyaltyKey ? reservation : null;
  const freshMenu = menu?.key === loyaltyKey ? menu : null;

  const pending =
    product === "loyalty"
      ? freshLoyalty
      : product === "queue"
        ? freshQueue
        : product === "reservation"
          ? freshReservation
          : product === "menu"
            ? freshMenu
            : true;
  const cached =
    product === "loyalty"
      ? loyalty
      : product === "queue"
        ? queue
        : product === "reservation"
          ? reservation
          : product === "menu"
            ? menu
            : true;

  const loading = pending === null;
  // Only the very first load gets a skeleton. Refetches keep the previous
  // numbers on screen (dimmed) so changing range doesn't blank the page.
  const showSkeleton = Boolean(product) && loading && cached === null;

  // Held over from the last response so the picker doesn't blank out mid-fetch.
  const staffOptions = queue?.staffOptions ?? [];
  const showStaffPicker = product === "queue" && (staffOptions.length > 1 || staff !== null);
  const staffChoices =
    staff && !staffOptions.some((option) => option.id === staff.id)
      ? [...staffOptions, { id: staff.id, name: staff.name, role: null }]
      : staffOptions;

  const SoonIcon = soonProduct?.Icon;

  return (
    <div className="tab-screen merchant-dashboard">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <h2 className="tab-title">Analytics</h2>
          <p className="tab-sub">{profile.businessName}</p>
        </div>
        {product ? (
          <div className="merchant-analytics-toolbar">
            {showStaffPicker ? (
              <div className="merchant-date-select">
                <UserRound
                  size={15}
                  strokeWidth={2.2}
                  className="merchant-analytics-sort-lead"
                  aria-hidden="true"
                />
                <select
                  className="merchant-date-select-input"
                  aria-label="Team member"
                  value={staff?.id ?? ALL_STAFF}
                  onChange={(event) => {
                    const id = event.target.value;
                    const picked = staffChoices.find((option) => option.id === id);
                    setStaff(id === ALL_STAFF || !picked ? null : { id, name: picked.name });
                  }}
                >
                  <option value={ALL_STAFF}>All team</option>
                  {staffChoices.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} strokeWidth={2.4} className="merchant-date-select-icon" />
              </div>
            ) : null}
            <div className="merchant-date-select">
              <select
                className="merchant-date-select-input"
                aria-label="Date range"
                value={range}
                onChange={(event) => setRange(event.target.value as DashboardDateRange)}
              >
                {DATE_RANGES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={2.4} className="merchant-date-select-icon" />
            </div>
            <div className="merchant-date-select">
              <ArrowDownWideNarrow
                size={15}
                strokeWidth={2.2}
                className="merchant-analytics-sort-lead"
                aria-hidden="true"
              />
              <select
                className="merchant-date-select-input"
                aria-label="Sort activity"
                value={sort}
                onChange={(event) => setSort(event.target.value as ChartSort)}
              >
                {CHART_SORTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} strokeWidth={2.4} className="merchant-date-select-icon" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="queue-tabs merchant-analytics-tabs" role="tablist" aria-label="Product">
        {ANALYTICS_TABS.map((tab) => {
          const Icon = tab.Icon;
          const selected = tabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`queue-tab${selected ? " active" : ""}${tab.soon ? " queue-tab--soon" : ""}`}
              onClick={() => setTabId(tab.id)}
            >
              <Icon size={15} strokeWidth={2.3} aria-hidden="true" />
              <span>{tab.name}</span>
              {tab.soon ? <span className="queue-tab-soon">Soon</span> : null}
            </button>
          );
        })}
      </div>

      {soonProduct && SoonIcon ? (
        <div className="panel-card merchant-analytics-coming-soon">
          <div className="merchant-coming-soon-icon" aria-hidden>
            <SoonIcon size={28} strokeWidth={2.1} />
          </div>
          <span className="merchant-coming-soon-badge">Coming soon</span>
          <h3 className="merchant-coming-soon-name">{soonProduct.name}</h3>
          <p className="merchant-coming-soon-headline">{soonProduct.headline}</p>
          <p className="merchant-coming-soon-sub">
            Analytics for this product will show up here as soon as it launches.
          </p>
        </div>
      ) : showSkeleton ? (
        <AnalyticsSkeleton />
      ) : product === "queue" ? (
        <QueueAnalyticsView
          stats={freshQueue?.stats ?? queue?.stats ?? null}
          sort={sort}
          loading={loading}
          truncated={freshQueue?.truncated ?? false}
          error={freshQueue?.error}
        />
      ) : product === "reservation" ? (
        <ReservationAnalyticsView
          analytics={freshReservation?.analytics ?? reservation?.analytics ?? null}
          sort={sort}
          loading={loading}
          error={freshReservation?.error}
        />
      ) : product === "menu" ? (
        <MenuAnalyticsView
          analytics={freshMenu?.analytics ?? menu?.analytics ?? null}
          sort={sort}
          loading={loading}
          truncated={freshMenu?.truncated ?? false}
          error={freshMenu?.error}
        />
      ) : (
        <LoyaltyAnalyticsView
          stats={freshLoyalty ?? loyalty?.stats ?? initialStats}
          sort={sort}
          loading={loading}
        />
      )}
    </div>
  );
}
