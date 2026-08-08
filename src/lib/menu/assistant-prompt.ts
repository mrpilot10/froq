import {
  MENU_LANGUAGES,
  MENU_LANG_CODES,
  readLanguage,
} from "@/lib/menu/languages";
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  SPICE_LABELS,
  type MenuCategory,
  type MenuItem,
} from "@/lib/menu/types";

/**
 * What the guest menu assistant is told, and how its answer is checked before a
 * guest sees it. Kept apart from the Gemini call so the rule that matters most —
 * it may only name dishes this kitchen actually serves — is plain to read and
 * cheap to test.
 */

export const QUESTION_MAX = 320;
const MAX_RECOMMENDATIONS = 5;

/** Languages the guest page can switch the menu into — same set as the picker. */
export const CHAT_LANGS = MENU_LANG_CODES as readonly string[];
export type ChatLang = string;

const LANG_NAMES: Record<string, string> = Object.fromEntries(
  MENU_LANGUAGES.map((language) => [language.code, language.name]),
);

/** One earlier line of the same chat, replayed so follow-ups make sense. */
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** Enough for multi-turn meal building without crowding out the menu brief. */
export const HISTORY_MAX_TURNS = 12;
const HISTORY_TEXT_MAX = 420;

/**
 * Kitchen / order wait — not "how long does the biryani take", which still goes
 * to the model with that dish's cook-time tag.
 */
export const WAIT_ASK =
  /\b((how long|what'?s|what is).{0,28}\bwait\b|\bwait\s*time\b|how long (will|does|until|before).{0,24}\b(order|food|kitchen)\b|when (will|is|does).{0,20}\b(order|food).{0,16}\b(ready|arrive|here|come)\b|how busy.{0,16}\bkitchen\b|estimated (prep|preparation|wait)\b|prep(aration)? time)\b/i;

function clampMins(n: number): number {
  return Math.min(90, Math.max(5, Math.round(n)));
}

function prepMinutesOf(categories: MenuCategory[]): number[] {
  return categories.flatMap((category) =>
    category.items
      .filter((item) => item.isAvailable && item.status === "live")
      .map((item) => item.prepMinutes)
      .filter((mins): mins is number => mins != null && mins > 0),
  );
}

function itemByName(categories: MenuCategory[]): Map<string, MenuItem> {
  const map = new Map<string, MenuItem>();
  for (const category of categories) {
    for (const item of category.items) {
      if (item.isAvailable && item.status === "live") {
        map.set(item.name.trim().toLowerCase(), item);
      }
    }
  }
  return map;
}

/**
 * Wait estimate for the assistant. Empty cart → range around the menu average.
 * Cart with cook-timed dishes → range from the longest cook time (kitchen runs
 * dishes in parallel; summing would invent a wait nobody experiences).
 */
export function prepWaitAnswer(
  categories: MenuCategory[],
  cartNames: readonly string[] = [],
): { text: string } | null {
  const note =
    "Note: Actual wait times may vary depending on the dishes you order, current kitchen occupancy, and peak dining hours.";
  const byName = itemByName(categories);
  const cartMins = cartNames
    .map((name) => byName.get(name.trim().toLowerCase())?.prepMinutes)
    .filter((mins): mins is number => mins != null && mins > 0);

  if (cartMins.length) {
    const longest = clampMins(Math.max(...cartMins));
    const high = clampMins(longest + (cartMins.length > 1 ? 5 : 3));
    const range = high > longest ? `${longest}–${high}` : String(longest);
    return {
      text: [
        `Estimated preparation time: ${range} minutes ⏱️`,
        "",
        "Based on the dishes currently in your cart.",
        "",
        note,
      ].join("\n"),
    };
  }

  const menuMins = prepMinutesOf(categories);
  if (!menuMins.length) return null;

  const avg = menuMins.reduce((sum, n) => sum + n, 0) / menuMins.length;
  const mid = clampMins(avg);
  const low = clampMins(mid - 3);
  const high = clampMins(mid + 4);
  const range = high > low ? `${low}–${high}` : String(mid);
  const body = cartNames.length
    ? "Your cart dishes do not list cook times yet, so this estimate uses the average preparation time of dishes on our menu."
    : "Since you haven't added any items yet, this estimate is based on the average preparation time of dishes on our menu.";

  return {
    text: [
      `Estimated preparation time: ${range} minutes ⏱️`,
      "",
      body,
      "",
      note,
    ].join("\n"),
  };
}

/** Optional recent-order counts so "popular / best seller" is grounded. */
export type PopularityHint = {
  byItemId?: Record<string, number>;
  byName?: Record<string, number>;
};

/**
 * `[dish name, meta note, why this dish for this guest]`. The third slot is the
 * model's own reason when it gave one, and it is what the card leads with:
 * "balances the spice of the fries" is about this order in a way the menu
 * description never is.
 */
export type Recommendation = [string, string, string?];

export interface AssistantAnswer {
  text: string;
  /** In the shape the menu design renders. */
  recs: Recommendation[];
  /** When true the chat shows the canned handoff bubble (no staff CTA). */
  fallback?: boolean;
  /**
   * Set only when the model produced the answer (not local/canned). Used for
   * AI Reply metering and cost analytics.
   */
  ai?: {
    model: string;
    promptTokens: number | null;
    responseTokens: number | null;
    thoughtsTokens: number | null;
    totalTokens: number | null;
  };
}

export function readChatLang(value: unknown): ChatLang {
  return readLanguage(value);
}

/**
 * The chat log arrives from a public page, so nothing in it is trusted: only
 * the two roles are kept, text is squeezed to one line, and the thread is cut
 * to the last few turns. A log that opens on a model turn is trimmed too —
 * Gemini expects the conversation to start with the guest.
 */
export function sanitiseHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];

  const turns: ChatTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const text = (entry as { text?: unknown }).text;
    if (role !== "user" && role !== "model") continue;
    if (typeof text !== "string") continue;
    const line = text.replace(/\s+/g, " ").trim().slice(0, HISTORY_TEXT_MAX);
    if (!line) continue;
    turns.push({ role, text: line });
  }

  const recent = turns.slice(-HISTORY_MAX_TURNS);
  while (recent.length && recent[0].role === "model") recent.shift();
  return recent;
}

/** Dishes the kitchen can actually send out right now. */
function servableItems(categories: MenuCategory[]): MenuItem[] {
  return categories.flatMap((category) =>
    category.items.filter((item) => item.isAvailable && item.status === "live"),
  );
}

function kcalTag(calories: number | null | undefined): string {
  const n = Number(calories);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `~${Math.round(n / 10) * 10} kcal`;
}

function dishLine(item: MenuItem): string {
  const parts = [item.name];
  if (item.price != null) parts.push(`₹${item.price}`);
  const tags = item.diet.map((tag) => DIET_LABELS[tag]);
  if (item.spiceLevel != null) {
    tags.push(`heat: ${SPICE_LABELS[Math.min(item.spiceLevel, 3)].toLowerCase()}`);
  }
  if (item.prepMinutes) tags.push(`${item.prepMinutes} min`);
  const kcal = kcalTag(item.calories);
  if (kcal) tags.push(kcal);
  if (item.allergens.length) {
    tags.push(`contains ${item.allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(", ")}`);
  }
  if (tags.length) parts.push(`(${tags.join("; ")})`);
  // No dashes anywhere in the brief: the model copies the punctuation it reads.
  if (item.description.trim()) parts.push(`Description: ${item.description.trim()}`);
  return parts.join(" ");
}

/**
 * One line telling the model what this menu can and cannot be asked about, so
 * it answers from tags where they exist and hands over to staff where they
 * don't, instead of hedging on everything.
 */
function menuFactsLine(items: MenuItem[]): string {
  const prices = items
    .map((item) => item.price)
    .filter((price): price is number => price != null && price > 0)
    .sort((a, b) => a - b);

  const facts = [`${items.length} dishes available`];
  if (prices.length) {
    const low = prices[0];
    const high = prices[prices.length - 1];
    facts.push(low === high ? `all ₹${low}` : `prices from ₹${low} to ₹${high}`);
  } else {
    facts.push("no prices listed");
  }
  const tagged = (label: string, on: boolean) => `${label} ${on ? "tagged" : "not tagged"}`;
  facts.push(tagged("spice", items.some((item) => item.spiceLevel != null)));
  facts.push(tagged("diet", items.some((item) => item.diet.length > 0)));
  facts.push(tagged("allergens", items.some((item) => item.allergens.length > 0)));
  facts.push(tagged("cook times", items.some((item) => item.prepMinutes != null)));
  facts.push(
    tagged(
      "calories",
      items.some((item) => item.calories != null && item.calories > 0),
    ),
  );
  facts.push(
    tagged(
      "chef picks",
      items.some((item) => item.diet.includes("chef_choice")),
    ),
  );
  return `Menu facts: ${facts.join("; ")}.`;
}

function popularityLine(items: MenuItem[], popularity?: PopularityHint | null): string {
  if (!popularity) return "";
  const byId = popularity.byItemId ?? {};
  const byName = popularity.byName ?? {};
  const scored = items
    .map((item) => {
      const n = Number(byId[item.id] || 0) || Number(byName[item.name] || 0) || 0;
      return { name: item.name, n };
    })
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  if (!scored.length) return "";
  return `Selling well tonight (recent orders): ${scored
    .map((row) => `${row.name} (${row.n})`)
    .join("; ")}.`;
}

/** The whole menu as plain text. Small enough to send with every question. */
export function menuBrief(
  categories: MenuCategory[],
  options: { popularity?: PopularityHint | null } = {},
): string {
  const items = servableItems(categories);
  const sections = categories
    .map((category) => {
      const live = category.items.filter(
        (item) => item.isAvailable && item.status === "live",
      );
      if (!live.length) return "";
      const dishes = live.map((item) => `- ${dishLine(item)}`).join("\n");
      return `## ${category.name}\n${dishes}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const parts = [menuFactsLine(items)];
  const popular = popularityLine(items, options.popularity);
  if (popular) parts.push(popular);
  parts.push("", sections);
  return parts.join("\n");
}

/**
 * The "Selling well tonight" line on its own. Order counts move all through a
 * service, so this rides with the guest's question instead of the cached menu,
 * which would otherwise be rebuilt every time a round is sent to the kitchen.
 */
export function popularityBrief(
  categories: MenuCategory[],
  popularity?: PopularityHint | null,
): string {
  return popularityLine(servableItems(categories), popularity);
}

/**
 * Everything true about the restaurant rather than about a dish: when it
 * closes, where it is, what is on promotion, whether stamps are collected.
 * The guest can already see all of it on the page — the offers sheet, the
 * hero bar, the loyalty tile — so the assistant looking blank when asked is
 * just a gap, not a safety boundary.
 */
export interface VenueFacts {
  /** Store hours as stored (HH:MM or Postgres time), branch first. */
  openTime?: string | null;
  closeTime?: string | null;
  address?: string | null;
  phone?: string | null;
  branchName?: string | null;
  /** Active promo cards, exactly as the offers sheet shows them. */
  offers?: ReadonlyArray<{ badge: string; title: string; detail: string }>;
  /** Stamp card, when the merchant runs Loyalty Stamps. */
  loyalty?: { rewardTitle: string; rewardName: string; totalStamps: number } | null;
}

/** "22:00" and "22:00:00" both mean ten at night. */
function clockLabel(value: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours > 23) return "";
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === "00" ? `${hour12} ${suffix}` : `${hour12}:${minutes} ${suffix}`;
}

/**
 * The venue half of the brief. Sits beside the dish list in the cached prefix
 * because it changes on the same slow clock — a new promo or a new closing
 * time rewrites it, and the cache key follows.
 */
export function venueBrief(facts: VenueFacts): string {
  const lines: string[] = [];

  const open = clockLabel(facts.openTime);
  const close = clockLabel(facts.closeTime);
  if (open && close && open !== close) {
    lines.push(`Hours: open ${open} to ${close}.`);
  }

  const address = facts.address?.trim() ?? "";
  const branch = facts.branchName?.trim() ?? "";
  // Branch names are usually the locality, so they often already sit inside
  // the street address: "Camp, 12 MG Road, Camp" helps nobody.
  const named = branch && address && !address.toLowerCase().includes(branch.toLowerCase());
  const where = named ? `${branch} branch, ${address}` : address || (branch ? `${branch} branch` : "");
  if (where) lines.push(`Address: ${where}.`);
  if (facts.phone?.trim()) lines.push(`Phone: ${facts.phone.trim()}.`);

  const offers = (facts.offers ?? []).filter((offer) => offer.badge?.trim() && offer.title?.trim());
  if (offers.length) {
    lines.push("Offers running now (quote these exactly, never invent one):");
    for (const offer of offers) {
      const detail = offer.detail?.trim();
      lines.push(`- ${offer.badge.trim()}: ${offer.title.trim()}${detail ? `. ${detail}` : ""}`);
    }
  }

  const loyalty = facts.loyalty;
  if (loyalty?.rewardTitle?.trim()) {
    lines.push(
      `Loyalty: "${loyalty.rewardTitle.trim()}", ${loyalty.totalStamps} stamps earn ${
        loyalty.rewardName?.trim() || "a reward"
      }. Guests join from the Offers sheet on this page.`,
    );
  }

  return lines.length ? `Venue facts:\n${lines.join("\n")}` : "";
}

export function systemPrompt(
  businessName: string,
  options: { lang?: ChatLang } = {},
): string {
  const lang = options.lang ?? "EN";
  return [
    `You are the menu assistant for ${businessName}, talking to a guest at a table.`,
    "Help them browse, filter, budget, pair, and build an order from this menu only.",
    "",
    "Hard rules:",
    "- Only ever mention dishes from the menu you are given. Never invent a dish,",
    "  a price, a garnish, an ingredient, a calorie count, or a protein number.",
    "- Prefer facts written on the menu: name, category, price, diet tags, spice,",
    "  cook time, calorie tags when present, allergen tags, description,",
    "  chef's choice, and \"Selling well tonight\" when that line is present.",
    "- Calorie questions: only quote the kcal tags written on dishes. If a dish",
    "  has no calorie tag, say you do not have that figure. Never invent or",
    "  estimate kcal. If calories are \"not tagged\" in Menu facts, say so and",
    "  return dishes: [] for calorie-only asks.",
    "- Kitchen-wide wait / \"how long is the wait\" is answered outside this prompt",
    "  from cook-time tags. Do not invent a floor wait, staffing count, or busy",
    "  estimate. For a single dish's cook time, use that dish's minute tag only.",
    "- If the menu and Venue facts cannot answer, say so plainly, ask them to",
    "  check with someone on the floor, and return dishes: []. Do not guess.",
    "  Never offer to call, summon, or notify a server for them.",
    "- Venue facts, when that block is present, cover hours, address, phone,",
    "  running offers, and the loyalty stamp card. Answer those from the block",
    "  and nothing else. Never invent an offer, a discount percentage, a stamp",
    "  count, a branch, or a closing time that is not written there.",
    "- Allergen questions: if dishes list the allergen, name them and say staff",
    "  should still confirm with the kitchen. If this menu has no allergen tags,",
    "  say so briefly, ask them to check with the kitchen, dishes: []. Never claim",
    "  a dish is safe or allergen-free.",
    "- Ingredient avoids (onion, mayo, cheese, mushroom, garlic, oily, fried):",
    "  only exclude a dish when the name or description clearly mentions it, or",
    "  an allergen tag covers it (e.g. dairy for cheese). If the menu is silent,",
    "  say you cannot promise that, suggest they confirm with the kitchen, and",
    "  still suggest the closest honest matches.",
    "- You cannot place, edit, or send an order yourself. When the guest says",
    "  \"add fries\", \"final order\", or \"place the order\", confirm the running",
    "  picks and tell them to tap Add on the cards or use the cart. Do not claim",
    "  you submitted anything to the kitchen.",
    "- Customisation, freshness, secret recipes, or off-menu changes: say they",
    "  should ask someone on the floor. Do not invent kitchen policy.",
    "",
    "How to answer common asks:",
    "- Browse / search (\"show me fries\", \"what burgers\", \"desserts\", \"cold",
    "  coffee\"): match category names, dish names, and descriptions. List the",
    "  best fits with prices. Put them in `dishes` (up to 5).",
    "- Cheapest / most expensive / under ₹X: use listed prices only. If prices",
    "  are missing, say so.",
    "- Diet filters (veg, vegan, Jain, gluten-free, chicken, eggless): use diet",
    "  tags first, then honest name/description cues. Eggless means avoid dishes",
    "  that list egg in allergens or clearly mention egg.",
    "- Spice: use heat tags. \"Not spicy\" → heat none/mild. \"Spicy\" → medium/hot.",
    "- Calories / lighter / healthier / low-cal: use kcal tags only. Prefer",
    "  lower-kcal dishes when comparing; put them in `dishes`. If asking about",
    "  one dish with no tag, say the figure is not on this menu.",
    "- Texture / style (crispy, grilled, crunchy, light, filling, cheesy): use",
    "  description and name cues; say when you are inferring from the wording.",
    "- Popular / best seller / college favourite / unique / Instagram-worthy:",
    "  prefer \"Selling well tonight\" and chef's choice when present; otherwise",
    "  pick lively, shareable dishes and say it is your pick from this menu, not",
    "  a sales report.",
    "- Budget / value / combo / feed N people: pick a coherent set, add listed",
    "  prices so the total fits, name the total and rough per-person when party",
    "  size is given. Maximise quantity only with real prices. Put the set in",
    "  `dishes`.",
    "- Pairing / complete meal: suggest dishes that work together across",
    "  categories (starter + main + drink, fries with burger, drink with spicy",
    "  food, dessert to finish). Keep the set on-menu and priced when possible.",
    "- Comparisons (\"like McSpicy\", \"not KFC-style\", \"similar to Peri Peri but",
    "  milder\"): map to on-menu heat, chicken/fried cues, and names. Never claim",
    "  brand equivalence; say which listed dish is the closest fit and why.",
    "- Occasion cues (date, office lunch, kids, movie, rainy weather): pick",
    "  lighter/shareable/comfort dishes from this menu and say why they fit.",
    "- Multi-constraint asks: honour every constraint at once. If nothing fits,",
    "  say which constraint blocks you and offer the closest honest alternative.",
    "- Hours (\"are you open\", \"when do you close\", \"how late\"): answer from the",
    "  Hours line. You do not know today's date or the current time, so give the",
    "  opening and closing time rather than saying whether they are open right",
    "  now, and never invent which days the kitchen runs.",
    "- Where we are / phone (\"address\", \"how do I get here\", \"contact\"): read",
    "  the Address and Phone lines back. Do not invent landmarks or directions.",
    "- Offers / discounts / deals (\"any offers\", \"student discount\", \"combo",
    "  deal\"): quote the offer lines exactly as written and say the Offers",
    "  button on this page has the full terms. Do not work out a discounted",
    "  total or promise an offer applies to a particular dish unless the offer",
    "  says so itself. If no offers are listed, say there are none running right",
    "  now, dishes: [].",
    "- Loyalty / stamps / rewards: describe the card from the Loyalty line and",
    "  tell them they can join from the Offers button on this page. Never",
    "  promise a free item or say how many stamps they personally have.",
    "",
    "Ambiguous asks:",
    "- If the ask is vague (\"something nice\", \"recommend food\", \"I'm hungry\",",
    "  \"surprise me\", \"I don't know\") and you lack a prior constraint from this",
    "  chat, ask ONE short clarifying question first (veg or non-veg, budget,",
    "  spicy or mild, light or filling). Return dishes: [] for that turn, or at",
    "  most one safe starter pick if you also ask the question.",
    "- If earlier turns already gave constraints, do not re-ask; recommend.",
    "",
    "Conversation memory:",
    "- Earlier turns are the running order draft. Apply follow-ups like \"make it",
    "  spicy\", \"add fries\", \"remove fries\", \"make everything vegetarian\",",
    "  \"under ₹500\", \"replace the burger\", \"cheaper\", \"healthier\" to that set.",
    "- Keep an updated short summary of the current picks and total when prices",
    "  exist. Do not repeat the whole menu each turn.",
    "- Hindi / Hinglish is welcome (\"bhai kuch mast\", \"paisa vasool\", \"pet bhar",
    "  jaana\"). Answer in the same mix the guest used, while keeping dish names",
    "  exactly as the menu spells them.",
    "",
    "Voice:",
    "- You are the host at this table, not a search box. Warm, specific, brief.",
    "- Two or three sentences by default. No emoji, no headings, no markdown",
    "  tables.",
    "",
    "Shape:",
    "- Short answers stay as one paragraph.",
    "- For several dishes, a meal, or a comparison: one-line opening, then dishes,",
    "  then one-line close (offer to swap or add a drink).",
    "- Put each dish on its own line starting with \"• \" when naming more than",
    "  two, with price and the one reason it fits. At most five lines.",
    "- Separate paragraphs with a blank line. Never indent a line.",
    "- Never use hyphens or dashes as punctuation: no em dash (—), no en dash (–),",
    "  and no spaced hyphen standing in for a pause. Use a comma or a new sentence",
    "  instead. Hyphens inside a single word or dish name are fine only when the",
    "  menu itself spells it that way (gluten-free, Peri-Peri).",
    `- Default language: ${LANG_NAMES[lang]}. If the guest writes Hindi or Hinglish,`,
    "  match that instead. Keep dish names exactly as the menu spells them.",
    "- Prices always as ₹ with digits (₹120). Menu prices already include tax.",
    "- Wrap every dish name you mention in double asterisks, copied exactly from",
    "  the menu, e.g. **Cheesy Balls**. Wrap ₹prices the same way: **₹120**.",
    "  Do not bold anything else.",
    "",
    'Reply with JSON only, no code fence: {"answer": string, "dishes": string[]}',
    "Line breaks inside `answer` are written as \\n, so the bubble can lay them out.",
    "`dishes` holds up to 5 dish names copied exactly from the menu, ordered best",
    "first, or [] when you are only clarifying or handing off to staff.",
  ].join("\n");
}

/**
 * Settles on the sentence to show the guest. A model that ignored the JSON
 * instruction still wrote usable prose, so that is worth keeping — but a reply
 * that was cut off mid-JSON is not, and must never reach the page as raw
 * braces. Those come back empty so the assistant offers a server instead.
 */
export function readAnswerText(parsedAnswer: unknown, rawText: string): string {
  if (typeof parsedAnswer === "string" && parsedAnswer.trim()) return parsedAnswer.trim();
  const raw = (rawText ?? "").trim();
  if (!raw || /^[[{]/.test(raw) || raw.includes('"answer"') || raw.includes("```")) return "";
  return raw;
}

/**
 * True when the reply is handing the guest to a human (canned handoff bubble).
 */
export function needsStaffHandoff(text: string): boolean {
  // Only real "I cannot answer from the menu" handoffs. Honest wait answers and
  // "confirm with the kitchen" tips are fine to show as written.
  return /\b(call (a )?server|server over|notify staff|need something|cannot tell you|can't tell you|could not tell you|do not have access|don't have access|ask (a )?server|should I call)\b/i.test(
    text,
  );
}

/**
 * A list line the model wrote to recommend a dish, in the shapes it reaches
 * for: "Cold Coffee for ₹60, chilled and classic", "Cold Coffee (₹60) — ...",
 * "Cold Coffee: ...". The marker is already normalised to a bullet by
 * `tidyLayout`, and dish names may be wrapped in the bold markers the guest
 * page uses to highlight them.
 */
const DISH_BULLET = /^[\u2022][ \t]+(.+)$/;

/** Whatever sits between the dish name and its reason, in any of those shapes. */
const REASON_LEAD =
  /^(?:\*\*)?[\s,:;.)\u2013\u2014-]*(?:(?:is|are|at|for|costs?|priced at)\b[\s,:]*)?(?:\((?:₹|rs\.?)\s*[\d,]+(?:\.\d+)?\)|(?:₹|rs\.?)\s*[\d,]+(?:\.\d+)?)?[\s,:;.)\u2013\u2014-]*/i;

export interface LiftedDish {
  name: string;
  /** The model's reason for this dish in this conversation, if it gave one. */
  reason: string;
}

/**
 * Pulls dish recommendations out of the answer's own bullet list.
 *
 * The model is asked to put dishes in `dishes`, where they become cards the
 * guest can tap to add. It does not always: sometimes it writes the whole
 * recommendation as prose bullets and returns `dishes: []`, which left the
 * guest reading a list of dishes with no way to order any of them, and
 * sometimes it does both, so the same three dishes appeared twice. Either way
 * the bullet is worse than the card, so the dish is lifted out and the line it
 * came from is removed.
 *
 * The reason it wrote is kept: "balances the spice of the fries" is about this
 * order in a way the menu description never is.
 */
export function liftDishBullets(
  text: string,
  categories: MenuCategory[],
): { text: string; dishes: LiftedDish[] } {
  const items = servableItems(categories);
  if (!items.length || !text.includes("\u2022")) return { text, dishes: [] };

  // Longest first, so "Cold Coffee with Ice cream" wins over "Cold Coffee".
  const known = items
    .map((item) => ({ name: item.name, key: nameKey(item.name) }))
    .filter((entry) => entry.key)
    .sort((a, b) => b.key.length - a.key.length);

  const dishes: LiftedDish[] = [];
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const line of text.split("\n")) {
    const bullet = DISH_BULLET.exec(line.trim());
    if (!bullet) {
      kept.push(line);
      continue;
    }

    const body = bullet[1].trim();
    const plain = body.replace(/\*\*/g, "");
    const key = nameKey(plain);
    // Only a line that opens with the dish name is a recommendation for it; a
    // dish mentioned mid-sentence is being talked about, not offered.
    const match = known.find((entry) => key.startsWith(entry.key));
    if (!match) {
      kept.push(line);
      continue;
    }

    if (!seen.has(match.name)) {
      seen.add(match.name);
      const after = plain.slice(matchedLength(plain, match.key));
      const reason = after.replace(REASON_LEAD, "").trim().replace(/[\s,;.]+$/, "");
      dishes.push({ name: match.name, reason });
    }
  }

  const cleaned = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: cleaned, dishes };
}

/**
 * How much of the written line the dish name took up. The name is matched on a
 * normalised key ("cold coffee"), so its length in the original ("Cold  Coffee")
 * has to be counted back out before the reason can be read off the end.
 */
function matchedLength(plain: string, key: string): number {
  const words = key.split(" ").filter(Boolean).length;
  let seenWords = 0;
  let index = 0;
  let inWord = false;
  for (; index < plain.length; index += 1) {
    const isWordChar = /[a-z0-9]/i.test(plain[index]);
    if (isWordChar && !inWord) {
      inWord = true;
      seenWords += 1;
    } else if (!isWordChar && inWord) {
      inWord = false;
      if (seenWords === words) return index;
    }
  }
  return seenWords === words ? plain.length : 0;
}

/**
 * Folds the dishes lifted out of the prose into the cards the model asked for.
 *
 * Dishes it named both ways keep their card and gain the reason it wrote; ones
 * it only wrote about become cards of their own, which is the case that used to
 * leave a guest reading three recommendations with no way to order any of them.
 */
export function mergeLiftedDishes(
  picked: Array<[string, string]>,
  lifted: LiftedDish[],
  categories: MenuCategory[],
): Recommendation[] {
  if (!lifted.length) return picked;

  const reasons = new Map(lifted.map((dish) => [dish.name, dish.reason]));
  const out: Recommendation[] = picked.map(([name, note]) => {
    const reason = reasons.get(name);
    return reason ? [name, note, reason] : [name, note];
  });

  const have = new Set(picked.map(([name]) => name));
  const missing = lifted.filter((dish) => !have.has(dish.name)).map((dish) => dish.name);
  for (const [name, note] of pickRecommendations(missing, categories)) {
    if (out.length === MAX_RECOMMENDATIONS) break;
    const reason = reasons.get(name);
    out.push(reason ? [name, note, reason] : [name, note]);
  }
  return out;
}

/** "Peri-Peri  Fries!" and "peri peri fries" are the same dish to a guest. */
function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Keeps only names the kitchen can actually cook. The model is told to copy
 * names exactly, but a near-miss ("Peri Peri Fries" for "Peri Peri") would
 * otherwise reach the guest as a dish that cannot be ordered.
 */
export function pickRecommendations(
  names: unknown,
  categories: MenuCategory[],
): Array<[string, string]> {
  if (!Array.isArray(names)) return [];
  const byName = new Map<string, MenuItem>();
  for (const item of servableItems(categories)) {
    byName.set(item.name.trim().toLowerCase(), item);
    const key = nameKey(item.name);
    if (key && !byName.has(key)) byName.set(key, item);
  }

  const picked: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const item = byName.get(raw.trim().toLowerCase()) ?? byName.get(nameKey(raw));
    if (!item || seen.has(item.name)) continue;
    seen.add(item.name);
    const note = [
      item.diet.includes("vegan")
        ? DIET_LABELS.vegan
        : item.diet.includes("veg")
          ? DIET_LABELS.veg
          : "",
      item.spiceLevel != null && item.spiceLevel > 0
        ? SPICE_LABELS[Math.min(item.spiceLevel, 3)].toLowerCase()
        : "",
      item.prepMinutes ? `~${item.prepMinutes} min` : "",
      kcalTag(item.calories),
      item.diet.includes("chef_choice") ? DIET_LABELS.chef_choice : "",
      item.allergens.length
        ? `contains ${item.allergens.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    picked.push([item.name, note]);
    if (picked.length === MAX_RECOMMENDATIONS) break;
  }
  return picked;
}
