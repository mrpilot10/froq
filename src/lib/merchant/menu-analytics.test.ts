/**
 * Pure-function checks for the AI menu analytics rollup.
 * Run: npx --yes tsx src/lib/merchant/menu-analytics.test.ts
 */
import assert from "node:assert/strict";
import {
  computeMenuAnalytics,
  menuAnalyticsIsEmpty,
  type AiUsageRow,
  type MenuEventRow,
} from "./menu-analytics";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

const NOW = new Date().toISOString();

function event(patch: Partial<MenuEventRow> & { event: string }): MenuEventRow {
  return {
    item_name: null,
    lang: null,
    session_key: null,
    created_at: NOW,
    ...patch,
  };
}

function usage(feature: string, tokens: number): AiUsageRow {
  return { feature, kind: "text", total_tokens: tokens, created_at: NOW };
}

function compute(events: MenuEventRow[], rows: AiUsageRow[] = []) {
  return computeMenuAnalytics({ range: "7d", events, usage: rows });
}

section("opens count page loads, visits count people", () => {
  const stats = compute([
    event({ event: "menu_opened", session_key: "a" }),
    event({ event: "menu_opened", session_key: "a" }),
    event({ event: "menu_opened", session_key: "b" }),
  ]);
  assert.equal(stats.opens, 3);
  assert.equal(stats.visits, 2);
});

section("a beacon with no visit key still counts as a visit, not as nobody", () => {
  // Otherwise a page from an older deploy silently reports zero traffic.
  const stats = compute([
    event({ event: "menu_opened" }),
    event({ event: "menu_opened" }),
    event({ event: "menu_opened", session_key: "a" }),
  ]);
  assert.equal(stats.visits, 3);
});

section("cart adds count both the manual tap and the assistant's suggestion", () => {
  const stats = compute([
    event({ event: "cart_add", item_name: "Dal", session_key: "a" }),
    event({ event: "rec_added", item_name: "Dal", session_key: "a" }),
    event({ event: "cart_remove", item_name: "Dal", session_key: "a" }),
  ]);
  assert.equal(stats.cartAdds, 2);
  assert.equal(stats.topDishes[0].cartAdds, 2);
});

section("rates are out of visits, so one guest adding twice is not 200%", () => {
  const stats = compute([
    event({ event: "menu_opened", session_key: "a" }),
    event({ event: "menu_opened", session_key: "b" }),
    event({ event: "cart_add", item_name: "Dal", session_key: "a" }),
    event({ event: "cart_add", item_name: "Rice", session_key: "a" }),
    event({ event: "chat_asked", session_key: "a" }),
  ]);
  assert.equal(stats.visits, 2);
  assert.equal(stats.addRate, 50);
  assert.equal(stats.askRate, 50);
});

section("top dishes rank by cart adds, and carry the guests behind them", () => {
  const stats = compute([
    // One indecisive table taps paneer repeatedly; two separate guests pick dal.
    ...Array.from({ length: 3 }, () =>
      event({ event: "cart_add", item_name: "Paneer", session_key: "a" }),
    ),
    event({ event: "cart_add", item_name: "Dal", session_key: "a" }),
    event({ event: "cart_add", item_name: "Dal", session_key: "b" }),
  ]);
  assert.deepEqual(
    stats.topDishes.map((dish) => [dish.name, dish.cartAdds, dish.visits]),
    [
      ["Paneer", 3, 1],
      ["Dal", 2, 2],
    ],
  );
});

section("an event with no dish attached never becomes a nameless row", () => {
  const stats = compute([event({ event: "cart_add", session_key: "b" })]);
  assert.deepEqual(stats.topDishes, []);
});

section("a keyless add still counts as a guest rather than vanishing", () => {
  const stats = compute([
    event({ event: "cart_add", item_name: "Dal" }),
    event({ event: "cart_add", item_name: "Dal" }),
  ]);
  assert.deepEqual(
    stats.topDishes.map((dish) => [dish.name, dish.cartAdds, dish.visits]),
    [["Dal", 2, 2]],
  );
});

section("the leaderboard stops at eight dishes", () => {
  const events = Array.from({ length: 12 }, (_, i) =>
    Array.from({ length: 12 - i }, () =>
      event({ event: "cart_add", item_name: `Dish ${i}`, session_key: `s${i}` }),
    ),
  ).flat();
  const stats = compute(events);
  assert.equal(stats.topDishes.length, 8);
  assert.equal(stats.topDishes[0].name, "Dish 0");
});

section("language share is per visit, not per tap", () => {
  const stats = compute([
    event({ event: "menu_opened", lang: "HI", session_key: "a" }),
    event({ event: "dish_viewed", lang: "HI", item_name: "Dal", session_key: "a" }),
    event({ event: "cart_add", lang: "HI", item_name: "Dal", session_key: "a" }),
    event({ event: "menu_opened", lang: "EN", session_key: "b" }),
  ]);
  assert.deepEqual(
    stats.languages.map((lang) => [lang.code, lang.count]),
    [
      ["EN", 1],
      ["HI", 1],
    ],
  );
});

section("a visit that switches language counts under the one it settled on", () => {
  const stats = compute([
    event({ event: "menu_opened", lang: "EN", session_key: "a", created_at: "2026-08-01T10:00:00Z" }),
    event({ event: "lang_changed", lang: "TA", session_key: "a", created_at: "2026-08-01T10:01:00Z" }),
    event({ event: "cart_add", lang: "TA", item_name: "Dosa", session_key: "a", created_at: "2026-08-01T10:02:00Z" }),
  ]);
  assert.deepEqual(
    stats.languages.map((lang) => [lang.code, lang.count]),
    [["TA", 1]],
  );
});

section("language is read from timestamps, so newest-first rows give the same answer", () => {
  // The action queries created_at desc; array order must not decide the winner.
  const rows: MenuEventRow[] = [
    event({ event: "cart_add", lang: "TA", item_name: "Dosa", session_key: "a", created_at: "2026-08-01T10:02:00Z" }),
    event({ event: "lang_changed", lang: "TA", session_key: "a", created_at: "2026-08-01T10:01:00Z" }),
    event({ event: "menu_opened", lang: "EN", session_key: "a", created_at: "2026-08-01T10:00:00Z" }),
  ];
  assert.deepEqual(
    compute(rows).languages.map((lang) => [lang.code, lang.count]),
    [["TA", 1]],
  );
});

section("language slices never add up to more than the visits they describe", () => {
  // Server-written rows (chat, cart insights) can arrive without a visit key;
  // counting each one as a reader used to inflate the donut past the visit count.
  const stats = compute([
    event({ event: "menu_opened", lang: "EN", session_key: "a" }),
    event({ event: "menu_opened", lang: "HI", session_key: "b" }),
    event({ event: "insights_viewed", lang: "EN" }),
    event({ event: "chat_asked", lang: "EN" }),
  ]);
  const total = stats.languages.reduce((sum, lang) => sum + lang.count, 0);
  assert.equal(stats.visits, 2);
  assert.equal(total, 2);
});

section("AI rows split guest-triggered calls from the merchant's own", () => {
  const stats = compute(
    [],
    [
      usage("menu_chat", 1000),
      usage("menu_chat", 500),
      usage("menu_cart_insights", 300),
      usage("dish_enrich", 700),
    ],
  );
  assert.equal(stats.ai.calls, 4);
  assert.equal(stats.ai.tokens, 2500);
  assert.equal(stats.ai.guestCalls, 3);
  assert.deepEqual(stats.ai.byFeature[0], {
    feature: "menu_chat",
    label: "Assistant answers",
    calls: 2,
    tokens: 1500,
  });
});

section("a feature the labels table has never heard of still reads as words", () => {
  const stats = compute([], [usage("some_new_thing", 10)]);
  assert.equal(stats.ai.byFeature[0].label, "some new thing");
});

section("empty means empty, and a merchant with only AI spend is not empty", () => {
  assert.equal(menuAnalyticsIsEmpty(compute([])), true);
  assert.equal(menuAnalyticsIsEmpty(compute([], [usage("dish_enrich", 5)])), false);
  assert.equal(
    menuAnalyticsIsEmpty(compute([event({ event: "menu_opened", session_key: "a" })])),
    false,
  );
});

section("the chart keeps one bucket per day of the week range", () => {
  const stats = compute([event({ event: "menu_opened", session_key: "a" })]);
  assert.equal(stats.chart.length, 7);
  assert.equal(
    stats.chart.reduce((sum, bucket) => sum + bucket.value, 0),
    1,
  );
});

console.log("\nall menu analytics checks passed");
