"use client";

import { useMemo } from "react";
import {
  Eye,
  Languages,
  MessageCircleQuestion,
  ShoppingCart,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";
import type { MenuAnalytics, MenuTopDish } from "@/lib/merchant/menu-analytics";
import { menuAnalyticsIsEmpty } from "@/lib/merchant/menu-analytics";
import {
  ActivityChart,
  ChartPanel,
  DonutChart,
  HBarList,
  MetricTiles,
  RateRing,
  type ChartSegment,
} from "./analytics-primitives";
import type { ChartSort } from "./loyalty-analytics-view";

interface MenuAnalyticsViewProps {
  analytics: MenuAnalytics | null;
  sort: ChartSort;
  loading: boolean;
  truncated: boolean;
  error?: string;
}

/** Tokens run to five figures fast, and the exact digit never matters. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

/**
 * The second line under a dish. The bar already shows total adds, so this says
 * how many separate guests were behind them — the number that tells you whether
 * a dish is popular or whether one table kept tapping.
 */
function dishSubLabel(dish: MenuTopDish): string | undefined {
  if (dish.visits <= 0) return undefined;
  return `${dish.visits} ${dish.visits === 1 ? "guest" : "guests"}`;
}

const DONUT_TONES = ["accent", "brand", "soft", "muted", "warn"] as const;

export function MenuAnalyticsView({
  analytics,
  sort,
  loading,
  truncated,
  error,
}: MenuAnalyticsViewProps) {
  const buckets = useMemo(() => {
    const chart = analytics?.chart ?? [];
    if (sort === "highest") return [...chart].sort((a, b) => b.value - a.value);
    return chart;
  }, [analytics?.chart, sort]);

  // Five slices plus an "Other" catch-all: a donut with thirteen languages on
  // it is a colour wheel, not a chart.
  const languageSegments = useMemo<ChartSegment[]>(() => {
    const languages = analytics?.languages ?? [];
    const top = languages.slice(0, 5).map((lang, index) => ({
      id: lang.code,
      label: lang.label,
      value: lang.count,
      tone: DONUT_TONES[index],
    }));
    const rest = languages.slice(5).reduce((sum, lang) => sum + lang.count, 0);
    return rest > 0
      ? [...top, { id: "other", label: "Other", value: rest, tone: "muted" as const }]
      : top;
  }, [analytics?.languages]);

  if (error) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">Couldn&apos;t load menu analytics</p>
        <p className="merchant-empty-sub">{error}</p>
      </div>
    );
  }

  if (!analytics || menuAnalyticsIsEmpty(analytics)) {
    return (
      <div className="panel-card merchant-empty merchant-analytics-empty">
        <p className="merchant-empty-title">No menu activity in this period</p>
        <p className="merchant-empty-sub">
          Once guests scan the QR and open the AI menu, their views, cart adds and
          questions show up here. Try a longer date range.
        </p>
      </div>
    );
  }

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  const topDish = analytics.topDishes[0] ?? null;
  const topLanguage = analytics.languages[0] ?? null;

  return (
    <>
      {truncated ? (
        <div className="panel-card merchant-empty merchant-analytics-truncated">
          <p className="merchant-empty-sub">
            This range has more activity than we can chart at once — figures cover the
            most recent events only. Pick a shorter range for exact numbers.
          </p>
        </div>
      ) : null}

      <div className={`merchant-ltv-card${loading ? " merchant-ltv-card--loading" : ""}`}>
        <div className="merchant-ltv-head">
          <span className="merchant-ltv-eyebrow">AI Menu</span>
        </div>
        <div className="merchant-ltv-value">{analytics.opens}</div>
        <p className="merchant-analytics-hero-label">Menu views in this period</p>
        <div className="merchant-ltv-metrics">
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Visits</span>
            <span className="merchant-ltv-tile-value">{analytics.visits}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Cart adds</span>
            <span className="merchant-ltv-tile-value">{analytics.cartAdds}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">Questions</span>
            <span className="merchant-ltv-tile-value">{analytics.questions}</span>
          </div>
          <div className="merchant-ltv-tile">
            <span className="merchant-ltv-tile-label">AI calls</span>
            <span className="merchant-ltv-tile-value">{analytics.ai.calls}</span>
          </div>
        </div>
      </div>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Menu traffic</h3>
            <span className="merchant-section-meta">{analytics.opens} views</span>
          </div>
          <ChartPanel
            title="Menu views"
            sub="Every time a guest opened the menu"
            loading={loading}
            meta={`${analytics.visits} visits`}
          >
            <ActivityChart buckets={buckets} max={max} showValues={buckets.length <= 10} />
          </ChartPanel>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">What guests did</h3>
          </div>
          <div
            className={`panel-card ax-rings-card${loading ? " merchant-chart-card--loading" : ""}`}
          >
            <div className="ax-rings">
              <RateRing
                value={analytics.addRate}
                label="Added to cart"
                sub={`${analytics.cartAdds} dishes added`}
              />
              <RateRing
                value={analytics.askRate}
                label="Asked the AI"
                sub={`${analytics.questions} questions`}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="ax-grid-2">
        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Top dishes</h3>
            {analytics.cartAdds > 0 ? (
              <span className="merchant-section-meta">{analytics.cartAdds} adds</span>
            ) : null}
          </div>
          {analytics.topDishes.length > 0 ? (
            <ChartPanel
              title="Most added to cart"
              sub="What guests picked while browsing the menu"
              loading={loading}
            >
              <HBarList
                items={analytics.topDishes.map((dish) => ({
                  id: dish.id,
                  label: dish.name,
                  sub: dishSubLabel(dish),
                  value: dish.cartAdds,
                  display: `${dish.cartAdds}`,
                }))}
              />
            </ChartPanel>
          ) : (
            <div className="panel-card merchant-empty merchant-analytics-empty">
              <p className="merchant-empty-sub">
                No dish has been added to a cart yet in this period.
              </p>
            </div>
          )}
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Languages</h3>
          </div>
          {languageSegments.length > 0 ? (
            <ChartPanel
              title="Menu language"
              sub="What each visit read the menu in"
              loading={loading}
            >
              <DonutChart
                segments={languageSegments}
                centerValue={analytics.languages.length}
                centerLabel={analytics.languages.length === 1 ? "language" : "languages"}
              />
            </ChartPanel>
          ) : (
            <div className="panel-card merchant-empty merchant-analytics-empty">
              <p className="merchant-empty-sub">No language data recorded yet.</p>
            </div>
          )}
        </section>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">AI usage</h3>
          <span className="merchant-section-meta">
            {formatTokens(analytics.ai.tokens)} tokens
          </span>
        </div>
        {analytics.ai.byFeature.length > 0 ? (
          <ChartPanel
            title="Model calls by feature"
            sub="Guest questions, plus the menu work you ran yourself"
            loading={loading}
            meta={`${analytics.ai.calls} calls`}
          >
            <HBarList
              items={analytics.ai.byFeature.map((feature) => ({
                id: feature.feature,
                label: feature.label,
                sub: `${formatTokens(feature.tokens)} tokens`,
                value: feature.calls,
                display: `${feature.calls}`,
              }))}
            />
          </ChartPanel>
        ) : (
          <div className="panel-card merchant-empty merchant-analytics-empty">
            <p className="merchant-empty-sub">No AI calls in this period.</p>
          </div>
        )}
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <h3 className="merchant-section-label">Snapshot</h3>
        </div>
        <MetricTiles
          items={[
            { id: "views", label: "Menu views", value: analytics.opens, Icon: Eye, accent: true },
            { id: "visits", label: "Visits", value: analytics.visits, Icon: Users },
            { id: "adds", label: "Cart adds", value: analytics.cartAdds, Icon: ShoppingCart },
            {
              id: "questions",
              label: "Questions asked",
              value: analytics.questions,
              Icon: MessageCircleQuestion,
            },
            {
              id: "top-dish",
              label: "Top dish",
              value: topDish ? topDish.name : "—",
              Icon: Utensils,
            },
            {
              id: "guest-ai",
              label: "Guest AI calls",
              value: analytics.ai.guestCalls,
              Icon: Sparkles,
            },
            {
              id: "top-language",
              label: "Top language",
              value: topLanguage ? topLanguage.label : "—",
              Icon: Languages,
            },
            {
              id: "tokens",
              label: "Tokens used",
              value: formatTokens(analytics.ai.tokens),
              Icon: Sparkles,
            },
          ]}
        />
      </section>
    </>
  );
}
