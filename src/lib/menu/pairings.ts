import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What guests at this restaurant actually order together.
 *
 * The cart assistant is allowed to suggest a dish alongside the ones already in
 * the cart, and a suggestion is only worth reading if it comes from somewhere
 * real. This counts how often two dishes turned up on the same ticket, so the
 * model recommends what this kitchen's guests genuinely pair rather than what a
 * language model assumes goes with a curry.
 */

/** Dish name → the dishes most often ordered with it, strongest first. */
export type DishPairs = Record<string, Array<{ name: string; n: number }>>;

/**
 * A month of tickets. Popularity elsewhere uses a three-hour window because it
 * answers "what is selling tonight"; pairing is a habit rather than a mood, and
 * three hours of a quiet Tuesday would produce noise instead of a pattern.
 */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Enough tickets to see a pattern, few enough to stay one quick query. */
const ORDER_LIMIT = 600;

/** Below this a "pair" is one table's coincidence, not a habit worth quoting. */
const MIN_SUPPORT = 2;

const PER_DISH = 3;

export async function fetchDishPairs(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
): Promise<DishPairs> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: orders, error: ordersError } = await admin
    .from("menu_orders")
    .select("id")
    .eq("merchant_id", merchantId)
    .gte("placed_at", since)
    .neq("status", "cancelled")
    .order("placed_at", { ascending: false })
    .limit(ORDER_LIMIT);
  if (ordersError || !orders?.length) return {};

  const { data: lines, error: linesError } = await admin
    .from("menu_order_items")
    .select("order_id, name")
    .in(
      "order_id",
      orders.map((row) => row.id as string),
    );
  if (linesError || !lines?.length) return {};

  const byOrder = new Map<string, Set<string>>();
  for (const line of lines) {
    const name = typeof line.name === "string" ? line.name.trim() : "";
    if (!name) continue;
    const orderId = line.order_id as string;
    const set = byOrder.get(orderId);
    if (set) set.add(name);
    else byOrder.set(orderId, new Set([name]));
  }

  // Counted once per ticket in each direction, so the table can be read from
  // whichever dish the guest already has in their cart.
  const counts = new Map<string, Map<string, number>>();
  for (const set of byOrder.values()) {
    const names = [...set];
    if (names.length < 2) continue;
    for (const a of names) {
      let row = counts.get(a);
      if (!row) counts.set(a, (row = new Map()));
      for (const b of names) {
        if (a === b) continue;
        row.set(b, (row.get(b) ?? 0) + 1);
      }
    }
  }

  const pairs: DishPairs = {};
  for (const [name, row] of counts) {
    const top = [...row.entries()]
      .map(([other, n]) => ({ name: other, n }))
      .filter((entry) => entry.n >= MIN_SUPPORT)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
      .slice(0, PER_DISH);
    if (top.length) pairs[name] = top;
  }
  return pairs;
}

/**
 * The pairing table as prompt text, narrowed to what the guest has in front of
 * them. Dishes already in the cart are dropped from the suggestions: telling
 * someone to order what they have ordered is the kind of line that made the old
 * panel feel automated.
 */
export function pairingBrief(pairs: DishPairs, cart: readonly string[]): string {
  if (!cart.length) return "";
  const inCart = new Set(cart.map((name) => name.trim().toLowerCase()));
  const lines: string[] = [];

  for (const name of cart) {
    const row = pairs[name] ?? pairs[name.trim()];
    if (!row?.length) continue;
    const others = row.filter((entry) => !inCart.has(entry.name.trim().toLowerCase()));
    if (!others.length) continue;
    lines.push(
      `- Tables that ordered ${name} also ordered: ${others
        .map((entry) => `${entry.name} (${entry.n} times)`)
        .join("; ")}`,
    );
  }

  if (!lines.length) return "";
  return `Ordered together here (real ticket history, the only source for "goes well with"):\n${lines.join(
    "\n",
  )}`;
}
