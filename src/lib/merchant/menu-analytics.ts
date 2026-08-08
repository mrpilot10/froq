import { findLanguage } from "@/lib/menu/languages";
import { chartBucketsForRange } from "@/lib/merchant/analytics";
import type { DashboardChartBucket, DashboardDateRange } from "@/lib/merchant/types";

/**
 * What guests did on the AI menu, rolled up for the merchant's analytics tab.
 *
 * Everything here is derived from menu_events (anonymous guest actions) and
 * ai_usage (one row per model call). Both are append-only logs, so the whole
 * rollup is a pure function over the rows a query returned — no clock, no
 * database, and therefore testable.
 *
 * Deliberately absent: sales. The guest menu stops at the cart — there is no
 * send-to-kitchen step — so nothing here claims to know what was ordered or
 * what it earned. A cart add is the furthest signal of intent that exists.
 *
 * Also absent: money for AI. ai_usage stores token counts, and nothing in the
 * codebase knows what a token costs, so this reports calls and tokens and lets
 * the reader price them.
 */

export interface MenuEventRow {
  event: string;
  item_name: string | null;
  lang: string | null;
  session_key: string | null;
  created_at: string;
}

export interface AiUsageRow {
  feature: string;
  kind: string;
  total_tokens: number | null;
  created_at: string;
}

export interface MenuTopDish {
  id: string;
  name: string;
  /** Times a guest put it in the cart. */
  cartAdds: number;
  /** Distinct visits that added it — one guest tapping twice is not two fans. */
  visits: number;
}

export interface MenuLanguageSlice {
  code: string;
  label: string;
  count: number;
}

export interface MenuAiFeature {
  feature: string;
  label: string;
  calls: number;
  tokens: number;
}

export interface MenuAnalytics {
  /** Menu loads. A guest who reopens the page counts twice, on purpose. */
  opens: number;
  /** Distinct visits, from the per-visit key the page mints. */
  visits: number;
  cartAdds: number;
  questions: number;
  /** Share of visits that put something in the cart. */
  addRate: number;
  /** Share of visits that asked the assistant something. */
  askRate: number;
  chart: DashboardChartBucket[];
  topDishes: MenuTopDish[];
  languages: MenuLanguageSlice[];
  ai: {
    calls: number;
    tokens: number;
    /** Guest-facing calls only: the assistant and cart insights. */
    guestCalls: number;
    byFeature: MenuAiFeature[];
  };
}

/** Adds to the cart come from two places and answer the same question. */
const ADD_EVENTS = new Set(["cart_add", "rec_added"]);

const AI_FEATURE_LABELS: Record<string, string> = {
  menu_chat: "Assistant answers",
  menu_cart_insights: "Cart insights",
  menu_translate: "Menu translation",
  menu_extract: "Menu import",
  dish_enrich: "Dish descriptions",
  dish_image: "Dish photos",
  other: "Other",
};

/** The two features a guest triggers by using the menu, rather than the merchant. */
const GUEST_AI_FEATURES = new Set(["menu_chat", "menu_cart_insights"]);

function labelForFeature(feature: string): string {
  return AI_FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}

function share(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

/**
 * Counts visits by the key the page mints per visit, falling back to opens.
 *
 * Older pages (and any beacon that lost its key) send no session_key. Counting
 * those as one shared visit would collapse a busy night into a single number,
 * so each keyless open counts as its own visit instead.
 */
function countVisits(rows: MenuEventRow[]): number {
  const keys = new Set<string>();
  let keyless = 0;
  for (const row of rows) {
    if (row.session_key) keys.add(row.session_key);
    else if (row.event === "menu_opened") keyless += 1;
  }
  return keys.size + keyless;
}

/**
 * Visits that did a thing, so "40% added to cart" is out of people, not page
 * loads. A keyless action counts as its own visit, which can in principle push
 * a rate past its denominator on rows written before the page sent visit keys;
 * share() clamps rather than printing 130%.
 */
function visitsWith(rows: MenuEventRow[], match: (row: MenuEventRow) => boolean): number {
  const keys = new Set<string>();
  let keyless = 0;
  for (const row of rows) {
    if (!match(row)) continue;
    if (row.session_key) keys.add(row.session_key);
    else keyless += 1;
  }
  return keys.size + keyless;
}

/** How many dishes the leaderboard shows before it stops being a leaderboard. */
const TOP_DISH_LIMIT = 8;

/**
 * The dish leaderboard, ranked by how often guests put a dish in their cart.
 *
 * The cart is as far as the guest menu goes — there is no send-to-kitchen step —
 * so an add is the strongest statement of intent this product can observe. Both
 * totals are kept because they answer different questions: the raw count says
 * how much a dish gets picked up, and the visit count says how many separate
 * guests wanted it, so one indecisive table cannot crown a dish.
 */
function buildTopDishes(events: MenuEventRow[]): MenuTopDish[] {
  const byName = new Map<string, MenuTopDish>();
  const visitsByName = new Map<string, Set<string>>();
  // A keyless add cannot be tied to a visit, so it counts as its own.
  const keylessByName = new Map<string, number>();

  for (const row of events) {
    const name = row.item_name?.trim();
    if (!name || !ADD_EVENTS.has(row.event)) continue;

    const entry = byName.get(name) ?? { id: name, name, cartAdds: 0, visits: 0 };
    entry.cartAdds += 1;
    byName.set(name, entry);

    if (row.session_key) {
      const seen = visitsByName.get(name) ?? new Set<string>();
      seen.add(row.session_key);
      visitsByName.set(name, seen);
    } else {
      keylessByName.set(name, (keylessByName.get(name) ?? 0) + 1);
    }
  }

  for (const entry of byName.values()) {
    entry.visits =
      (visitsByName.get(entry.name)?.size ?? 0) + (keylessByName.get(entry.name) ?? 0);
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.cartAdds - a.cartAdds || b.visits - a.visits || a.name.localeCompare(b.name),
    )
    .slice(0, TOP_DISH_LIMIT);
}

/**
 * Which languages the menu was read in.
 *
 * Counted per visit rather than per event: a guest who switches to Hindi and
 * then taps twenty dishes has not made Hindi twenty times more popular. A visit
 * that switched languages counts under the last one it settled on, picked by
 * timestamp rather than array order — the query returns newest first, and this
 * has to give the same answer either way.
 *
 * Keyless rows follow countVisits: only an open is its own visit, so the slices
 * add up to the visit count instead of overshooting it.
 */
function buildLanguages(rows: MenuEventRow[]): MenuLanguageSlice[] {
  const perVisit = new Map<string, { code: string; at: string }>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    const code = row.lang?.trim().toUpperCase();
    if (!code) continue;
    if (row.session_key) {
      const seen = perVisit.get(row.session_key);
      if (!seen || row.created_at > seen.at) {
        perVisit.set(row.session_key, { code, at: row.created_at });
      }
    } else if (row.event === "menu_opened") {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  for (const { code } of perVisit.values()) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      label: findLanguage(code)?.native ?? code,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function buildAi(rows: AiUsageRow[]): MenuAnalytics["ai"] {
  const byFeature = new Map<string, MenuAiFeature>();
  let calls = 0;
  let tokens = 0;
  let guestCalls = 0;

  for (const row of rows) {
    const feature = row.feature?.trim() || "other";
    const rowTokens = Number(row.total_tokens) || 0;
    const entry =
      byFeature.get(feature) ??
      { feature, label: labelForFeature(feature), calls: 0, tokens: 0 };
    entry.calls += 1;
    entry.tokens += rowTokens;
    byFeature.set(feature, entry);

    calls += 1;
    tokens += rowTokens;
    if (GUEST_AI_FEATURES.has(feature)) guestCalls += 1;
  }

  return {
    calls,
    tokens,
    guestCalls,
    byFeature: [...byFeature.values()].sort(
      (a, b) => b.calls - a.calls || b.tokens - a.tokens,
    ),
  };
}

export function computeMenuAnalytics(input: {
  range: DashboardDateRange;
  events: MenuEventRow[];
  usage: AiUsageRow[];
}): MenuAnalytics {
  const { events, usage, range } = input;

  const opens = events.filter((row) => row.event === "menu_opened");
  const visits = countVisits(events);

  return {
    opens: opens.length,
    visits,
    cartAdds: events.filter((row) => ADD_EVENTS.has(row.event)).length,
    questions: events.filter((row) => row.event === "chat_asked").length,
    addRate: share(
      visitsWith(events, (row) => ADD_EVENTS.has(row.event)),
      visits,
    ),
    askRate: share(
      visitsWith(events, (row) => row.event === "chat_asked"),
      visits,
    ),
    // The loyalty bucketer owns the axis for every range preset; only its
    // loyalty-worded title is unusable here, and the caller supplies its own.
    chart: chartBucketsForRange(range, opens).buckets,
    topDishes: buildTopDishes(events),
    languages: buildLanguages(events),
    ai: buildAi(usage),
  };
}

/** Nothing recorded yet — lets the view render its empty state off one flag. */
export function menuAnalyticsIsEmpty(analytics: MenuAnalytics): boolean {
  return analytics.opens === 0 && analytics.visits === 0 && analytics.ai.calls === 0;
}
