import { after } from "next/server";
import { resolveMenuPage } from "@/app/menu/actions";
import { readChatLang } from "@/lib/menu/assistant-prompt";
import { cartInsights, type CartLine } from "@/lib/menu/cart-insights";
import { recordMenuEvents } from "@/lib/menu/events";
import { ASSISTANT_LIMIT, callerKey, throttle } from "@/lib/menu/guest-throttle";
import { fetchDishPairs } from "@/lib/menu/pairings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reads a guest's cart and says something useful about it.
 *
 * Same shape as the assistant route: called from the menu page's own script,
 * trusting nothing in the body beyond the dish names, which are checked against
 * the live catalogue before they reach the model.
 */

export const runtime = "nodejs";

/** A cart big enough to need advice is nowhere near this. */
const CART_MAX = 40;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

/**
 * The page posts dish names as the guest sees them. Anything not on the live
 * menu is dropped rather than rejected: a stale tab holding a dish the kitchen
 * has since pulled should still get insights about the rest of the order.
 */
function readCart(value: unknown, known: Set<string>): CartLine[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, CartLine>();
  for (const entry of value.slice(0, CART_MAX)) {
    const name =
      typeof entry === "string"
        ? entry
        : typeof (entry as { name?: unknown })?.name === "string"
          ? ((entry as { name: string }).name)
          : "";
    const trimmed = name.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!trimmed || !known.has(trimmed.toLowerCase())) continue;
    const rawQty = (entry as { qty?: unknown })?.qty;
    const qty = Math.min(99, Math.max(1, Math.round(Number(rawQty) || 1)));
    const existing = merged.get(trimmed.toLowerCase());
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else merged.set(trimmed.toLowerCase(), { name: trimmed, qty });
  }
  return [...merged.values()];
}

export async function POST(request: Request) {
  let body: {
    slug?: unknown;
    branch?: unknown;
    cart?: unknown;
    lang?: unknown;
    session?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const branch = typeof body.branch === "string" && body.branch ? body.branch : null;
  if (!slug) return json({ ok: false, error: "Bad request." }, 400);

  const limit = throttle(callerKey(request, "menu-cart-ai"), ASSISTANT_LIMIT);
  if (!limit.ok) {
    return json({ ok: false, insights: [] }, 429, { "retry-after": String(limit.retryAfter) });
  }

  const resolved = await resolveMenuPage(slug, branch, null);
  if (!resolved.ok) return json({ ok: false, error: "Menu not found." }, 404);

  const known = new Set<string>();
  for (const category of resolved.page.categories) {
    for (const item of category.items) {
      if (item.isAvailable && item.status === "live") known.add(item.name.trim().toLowerCase());
    }
  }

  const cart = readCart(body.cart, known);
  if (!cart.length) return json({ ok: true, insights: [] });

  // One row per cart the panel opened on, carrying the cart's size — enough to
  // see whether guests who reach the cart are reading what the AI tells them.
  after(() =>
    recordMenuEvents(
      { merchantId: resolved.page.merchantId, branchId: resolved.page.branchId },
      [
        {
          event: "insights_viewed",
          lang: readChatLang(body.lang),
          detail: `${cart.reduce((sum, line) => sum + line.qty, 0)} items`,
          sessionKey: typeof body.session === "string" ? body.session : null,
        },
      ],
    ),
  );

  try {
    // Pairing history is a nice-to-have: a restaurant on its first night has
    // none, and the prompt is written to suggest on merit when it is missing.
    const pairs = await fetchDishPairs(createAdminClient(), resolved.page.merchantId).catch(
      () => ({}),
    );

    const insights = await cartInsights({
      cart,
      businessName: resolved.page.merchant.businessName,
      categories: resolved.page.categories,
      pairs,
      popularity: resolved.page.recentOrders,
      lang: readChatLang(body.lang),
      merchantKey: resolved.page.merchant.slug,
      merchantId: resolved.page.merchantId,
      venue: {
        openTime: resolved.page.openTime,
        closeTime: resolved.page.closeTime,
        address: resolved.page.merchant.address ?? null,
        phone: resolved.page.merchant.phone ?? null,
        branchName: resolved.page.merchant.branchName ?? null,
        offers: resolved.page.offers,
        loyalty: resolved.page.loyalty
          ? {
              rewardTitle: resolved.page.loyalty.rewardTitle,
              rewardName: resolved.page.loyalty.rewardName,
              totalStamps: resolved.page.loyalty.totalStamps,
            }
          : null,
      },
    });

    return json({ ok: true, insights });
  } catch (error) {
    console.error("cart insights failed", error);
    // The panel hides itself rather than showing an error over the order.
    return json({ ok: true, insights: [] });
  }
}
