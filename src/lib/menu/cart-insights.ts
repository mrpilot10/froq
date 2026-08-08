import "server-only";

import { createHash } from "node:crypto";
import { generateAiText } from "@/lib/ai/gemini";
import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import {
  menuBrief,
  venueBrief,
  type ChatLang,
  type PopularityHint,
  type VenueFacts,
} from "@/lib/menu/assistant-prompt";
import { MENU_LANGUAGES, type MenuLanguage } from "@/lib/menu/languages";
import { pairingBrief, type DishPairs } from "@/lib/menu/pairings";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";

/**
 * The panel a guest sees when they open their cart.
 *
 * It used to be four tiles restating the cart back at them — how many minutes,
 * how many people, how hot, veg or not — which is data the guest supplied by
 * choosing the dishes. This asks the model for the opposite: only things the
 * guest could not work out by looking at their own order, each one tied to
 * something they can do about it.
 */

/** A dish suggestion is only worth showing if the guest can act on it. */
export interface CartInsight {
  kind: "pairing" | "balance" | "offer" | "heat" | "portion" | "loyalty" | "timing";
  title: string;
  body: string;
  /** Exact menu dish to offer as a one-tap add, or null for advice-only. */
  dish: string | null;
  price: number | null;
}

const MAX_INSIGHTS = 3;

/** Past this the panel stops reading as advice and starts reading as upsell. */
const MAX_OFFERED_DISHES = 2;
const TITLE_MAX = 42;
const BODY_MAX = 130;

/**
 * Short answers, but the same hidden-reasoning budget problem as the chat: a
 * tight ceiling truncates the JSON rather than shortening the prose.
 */
const INSIGHT_TOKENS = 3_072;

const KINDS = new Set<CartInsight["kind"]>([
  "pairing",
  "balance",
  "offer",
  "heat",
  "portion",
  "loyalty",
  "timing",
]);

const LANG_NAMES: Record<string, string> = Object.fromEntries(
  MENU_LANGUAGES.map((language: MenuLanguage) => [language.code, language.name]),
);

function systemPrompt(businessName: string, lang: ChatLang): string {
  return [
    `You write the cart insights panel for ${businessName}. A guest at a table has`,
    "dishes in their cart and is about to send the order to the kitchen.",
    "",
    "Your job is to make the meal better. A better meal is usually a slightly",
    "bigger order, so the restaurant benefits too, but the guest comes first: if",
    "the honest advice is to order less, give it.",
    "",
    "Return 2 or 3 insights, most useful first. Fewer is better than padding.",
    "",
    "What an insight is:",
    "- Something the guest could NOT work out by looking at their own cart.",
    "- Tied to an action: a dish to add, a dish to drop, an offer within reach.",
    "",
    "The FIRST insight is always about the food itself: what the meal is missing,",
    "what would balance it, what to drop. Never open with the offer or the stamp",
    "card. Those are worth mentioning but they are the restaurant talking, and a",
    "panel that leads with them reads like an advertisement.",
    "",
    "Never write any of these. They restate the cart and the page already shows",
    "them, which is what made the old panel useless:",
    "- How many dishes are in the cart, or what they cost in total.",
    "- How long the kitchen will take, or any minute count.",
    "- How many people the order feeds, unless you are saying it is too much or",
    "  too little food and naming what to change.",
    "- How hot the food is, unless you are naming a specific milder dish.",
    "- Whether the order is vegetarian, unless it changes what you advise.",
    "- Generic filler: \"looks balanced\", \"enjoy your meal\", \"a solid choice\".",
    "",
    "Hard rules:",
    "- Only ever name dishes from the menu you are given. Never invent a dish, a",
    "  price, an ingredient, a calorie count, or a discount.",
    "- Calorie / lighter / heavier comments may only use kcal tags written on",
    "  dishes in the menu or cart. If a dish has no kcal tag, do not invent one.",
    "- `dish` must be an exact dish name copied from the menu, or null. Set it",
    "  only when adding that dish is the action you are recommending. Never put a",
    "  dish already in the cart there.",
    "- At most two insights may name a dish to add, and only when the meal is",
    "  genuinely missing something. Three would be a catalogue, not advice.",
    "- \"Goes well with\" / \"people usually add\" claims may only come from the",
    "  Ordered together block. If that block is absent, do not claim it: suggest",
    "  from the menu on its own merits (a missing course, a contrast in heat or",
    "  texture) and say why in those terms instead.",
    "- Money is never yours to calculate. If an Offer maths line is present, use",
    "  its numbers exactly and at most once; if it is absent, say nothing about",
    "  thresholds, totals, or how much more anything costs. Never add, subtract,",
    "  or estimate a rupee figure yourself.",
    "- Offers and the loyalty card: only from Venue facts and the Offer maths",
    "  line. Never invent a discount, a threshold, or a stamp count. At most one",
    "  insight in the whole panel may be about an offer or the stamp card.",
    "- Write money as ₹ followed by digits, never as bare numbers.",
    "- If the order is genuinely complete and well built, say what makes it work",
    "  in concrete terms and suggest nothing. One good insight beats three, and",
    "  a guest told their order is already right will trust the next thing you",
    "  say to them.",
    "",
    "Voice: a good server who knows the kitchen. Warm, short, specific. No",
    "exclamation marks, no emoji, no dashes.",
    "",
    "Reply with ONLY this JSON:",
    '{"insights":[{"kind":"pairing","title":"...","body":"...","dish":"..."}]}',
    "",
    "kind is one of: pairing, balance, offer, heat, portion, loyalty, timing.",
    `title: at most 5 words, no ending period. body: one sentence, at most 20 words.`,
    `Write title and body in ${LANG_NAMES[lang]}. Keep dish names exactly as the`,
    "menu spells them, in their original script.",
  ].join("\n");
}

/** What is in the cart, with the facts the model needs to reason about it. */
export interface CartLine {
  name: string;
  qty: number;
}

/**
 * "20% off on orders above ₹1200" — the spend a guest has to clear.
 *
 * Offers are free text a merchant typed, so this only fires on the phrasings
 * that actually mean a minimum, and gives up quietly otherwise.
 */
const THRESHOLD =
  /(?:above|over|minimum|min\.?|more than|upwards of)\s*(?:₹|rs\.?|inr)?\s*([\d][\d,]*)/i;

function offerThreshold(text: string): number | null {
  const match = THRESHOLD.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The offer line, worked out here rather than by the model.
 *
 * Getting this wrong is worse than not saying it: a guest told to add ₹190 who
 * then misses the discount by ₹10 has been lied to by the restaurant. Models
 * are unreliable at arithmetic, so they are handed the finished sentence and
 * told not to compute money themselves.
 */
function offerBrief(
  offers: ReadonlyArray<{ badge: string; title: string; detail: string }> | undefined,
  total: number,
): string {
  if (!offers?.length) return "";

  const scored = offers
    .map((offer) => {
      const title = offer.title?.trim() ?? "";
      const threshold = offerThreshold(`${title} ${offer.detail ?? ""}`);
      return threshold && title ? { title, threshold } : null;
    })
    .filter((row): row is { title: string; threshold: number } => row !== null);
  if (!scored.length) return "";

  // The one they can most plausibly reach: the smallest they have not cleared,
  // or failing that the largest they already have.
  const ahead = scored.filter((row) => row.threshold > total).sort((a, b) => a.threshold - b.threshold);
  const cleared = scored.filter((row) => row.threshold <= total).sort((a, b) => b.threshold - a.threshold);

  if (ahead.length) {
    const next = ahead[0];
    return `Offer maths (already worked out, never recalculate it): this cart is ₹${
      next.threshold - total
    } short of ₹${next.threshold}, which unlocks "${next.title}".`;
  }
  const won = cleared[0];
  return `Offer maths (already worked out, never recalculate it): this cart has cleared ₹${won.threshold}, so "${won.title}" already applies. Tell them it is unlocked, do not ask them to spend more for it.`;
}

function cartBrief(
  lines: CartLine[],
  items: Map<string, MenuItem>,
  categoryNames: Map<string, string>,
): string {
  const rows = lines.map((line) => {
    const item = items.get(line.name.trim().toLowerCase());
    const parts = [`- ${line.name}`];
    if (line.qty > 1) parts.push(`x${line.qty}`);
    if (item) {
      const tags: string[] = [];
      if (item.price != null) tags.push(`₹${item.price}`);
      const category = categoryNames.get(item.categoryId);
      if (category) tags.push(category);
      if (item.spiceLevel != null && item.spiceLevel > 0) tags.push(`heat ${item.spiceLevel}/3`);
      if (item.diet.length) tags.push(item.diet.join(", "));
      if (item.calories != null && item.calories > 0) {
        tags.push(`~${Math.round(item.calories / 10) * 10} kcal`);
      }
      if (tags.length) parts.push(`(${tags.join("; ")})`);
    }
    return parts.join(" ");
  });

  return [`Cart (${lines.length} dishes, ₹${cartTotal(lines, items)} so far):`, ...rows].join(
    "\n",
  );
}

function cartTotal(lines: CartLine[], items: Map<string, MenuItem>): number {
  return lines.reduce((sum, line) => {
    const item = items.get(line.name.trim().toLowerCase());
    return sum + (item?.price ?? 0) * Math.max(1, line.qty);
  }, 0);
}

function menuCacheKey(input: {
  merchantKey: string;
  lang: ChatLang;
  system: string;
  prefix: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.system}\u0000${input.prefix}`)
    .digest("hex")
    .slice(0, 16);
  const merchant = input.merchantKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "menu";
  return `froq:${merchant}:cart:${input.lang}:${digest}`;
}

function servableItems(categories: MenuCategory[]): MenuItem[] {
  return categories.flatMap((category) =>
    category.items.filter((item) => item.isAvailable && item.status === "live"),
  );
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Keeps only insights that survive contact with the menu. A suggested dish has
 * to exist, be orderable, and not already be in the cart — the model is good at
 * prose and occasionally optimistic about inventory.
 */
function readInsights(
  parsed: unknown,
  items: MenuItem[],
  cart: CartLine[],
): CartInsight[] {
  const rows = (parsed as { insights?: unknown })?.insights;
  if (!Array.isArray(rows)) return [];

  const byName = new Map<string, MenuItem>();
  for (const item of items) byName.set(item.name.trim().toLowerCase(), item);
  const inCart = new Set(cart.map((line) => line.name.trim().toLowerCase()));

  const out: CartInsight[] = [];
  let offered = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const title = clean((row as { title?: unknown }).title, TITLE_MAX);
    const body = clean((row as { body?: unknown }).body, BODY_MAX);
    if (!title || !body) continue;

    const rawKind = clean((row as { kind?: unknown }).kind, 16).toLowerCase();
    const kind = (KINDS.has(rawKind as CartInsight["kind"]) ? rawKind : "balance") as
      CartInsight["kind"];

    const rawDish = clean((row as { dish?: unknown }).dish, 120);
    const item = rawDish ? byName.get(rawDish.toLowerCase()) : undefined;
    // A dish that is not on the menu, is already in the cart, or would be the
    // third thing we push in one panel, becomes advice instead of an add.
    const usable =
      item && !inCart.has(item.name.trim().toLowerCase()) && offered < MAX_OFFERED_DISHES;
    if (usable) offered += 1;

    out.push({
      kind,
      title,
      body,
      dish: usable ? item.name : null,
      price: usable ? (item.price ?? null) : null,
    });
    if (out.length === MAX_INSIGHTS) break;
  }
  return out;
}

export async function cartInsights(input: {
  cart: CartLine[];
  businessName: string;
  categories: MenuCategory[];
  pairs?: DishPairs | null;
  popularity?: PopularityHint | null;
  venue?: VenueFacts | null;
  lang?: ChatLang;
  merchantKey?: string;
  /** Merchant row id, so the call lands on the right restaurant's AI bill. */
  merchantId?: string | null;
  signal?: AbortSignal;
}): Promise<CartInsight[]> {
  const cart = input.cart.filter((line) => line.name.trim());
  if (!cart.length) return [];

  const items = servableItems(input.categories);
  const byName = new Map<string, MenuItem>();
  for (const item of items) byName.set(item.name.trim().toLowerCase(), item);

  const lang = input.lang ?? "EN";
  const system = systemPrompt(input.businessName, lang);
  const venue = input.venue ? venueBrief(input.venue) : "";
  const cachedPrefix = [`Menu:\n\n${menuBrief(input.categories)}`, venue]
    .filter(Boolean)
    .join("\n\n");

  const categoryNames = new Map(input.categories.map((c) => [c.id, c.name]));
  const names = cart.map((line) => line.name);
  const pairing = input.pairs ? pairingBrief(input.pairs, names) : "";
  const offer = offerBrief(input.venue?.offers, cartTotal(cart, byName));
  const turn = [cartBrief(cart, byName, categoryNames), offer, pairing]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateAiText({
    feature: "menu_cart_insights",
    merchantId: input.merchantId,
    system,
    cache: {
      key: menuCacheKey({
        merchantKey: input.merchantKey ?? input.businessName,
        lang,
        system,
        prefix: cachedPrefix,
      }),
      prefix: cachedPrefix,
    },
    messages: [{ role: "user" as const, text: turn }],
    temperature: 0.6,
    thinkingLevel: "minimal",
    maxOutputTokens: INSIGHT_TOKENS,
    signal: input.signal,
  });

  const parsed = parseJsonFromAiText<{ insights?: unknown }>(result.text);
  return readInsights(parsed, items, cart);
}
