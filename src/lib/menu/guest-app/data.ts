import type { GuestSocialLinks } from "@/lib/merchant/guest-social-links";
import { formatTimeForInput } from "@/lib/merchant/queue-hours";
import { formatTimeLabel } from "@/lib/merchant/reservations";
import { MENU_LANGUAGES, readLanguage } from "@/lib/menu/languages";
import chromeTranslations from "./chrome-i18n.json";
import chromeEnglish from "./chrome-strings.json";
import type { GuestMenuOffer } from "@/lib/menu/offers";
import {
  DEFAULT_MENU_TAX_RATES,
  formatTaxPercent,
  normalizeMenuTaxRates,
  type MenuTaxRates,
} from "@/lib/menu/tax";
import {
  DIET_LABELS,
  SPICE_LABELS,
  type Allergen,
  type MenuCategory,
  type MenuItem,
} from "@/lib/menu/types";

/**
 * Translates a merchant's live catalogue into the shape the AI Menu design
 * artifact reads. The artifact keys everything off dish *name* rather than id,
 * and describes diets with its own mark vocabulary, so this module is the
 * one place those two worlds meet.
 */

/** Diet marks the guest menu can draw. Non-veg sits beside veg on the same square. */
const DIET_CODES: Partial<Record<string, "veg" | "vegan" | "gf" | "nonveg">> = {
  veg: "veg",
  jain: "veg",
  vegan: "vegan",
  gluten_free: "gf",
  nonveg: "nonveg",
};

/** Its "avoid" chips cover these; soy has no chip, so it is dropped. */
const SHOWN_ALLERGENS: Allergen[] = ["nuts", "dairy", "gluten", "shellfish", "egg", "fish"];

/** The design's own accent, used when a merchant has no usable brand colour. */
const ACCENT_FALLBACK = "#16593F";
const ACCENT_SOFT_FALLBACK = "#E4F0E8";

/** Ceiling that keeps the header's white text at 4.5:1 or better. */
const MAX_ACCENT_LUMINANCE = 0.18;

export interface GuestMenuDish {
  name: string;
  desc: string;
  price: number;
  meta: string;
  mins: number | null;
  badge: string;
}

export interface GuestMenuData {
  menu: Array<{ id: string; name: string; items: GuestMenuDish[] }>;
  featured: Array<{ name: string; why: string; price: number }>;
  diet: Record<string, string[]>;
  allergens: Record<string, string[]>;
  /** Dish name → heat 1–3. Zero and unknown stay out of the map. */
  spice: Record<string, number>;
  /** Dish name → photo URL, for the boxes the design labels "dish photo". */
  photos: Record<string, string>;
  /**
   * One dish photo for the hero. The design ships a flat accent wash; a real
   * plate behind a dark overlay reads as a restaurant rather than a template.
   */
  heroPhoto: string | null;
  kcal: Record<string, number>;
  signal: Record<string, number>;
  server: string;
  voiceSamples: string[];
  /** Canned assistant answers. Empty until the assistant is wired to real AI. */
  replies: Record<string, unknown>;
  /** Spend-based reward banner. Null hides it — no merchant has offered one. */
  reward: null;
  /** Prompts the assistant can actually answer from this menu. */
  chips: string[];
  followups: string[];
  /** Table from a table-scoped QR, when present. */
  tableNumber: number | null;
  /** Identifies this menu to the assistant and cart-insights endpoints. */
  context: { slug: string; branch: string | null; table: number | null };
  /** Instagram / Facebook / Google etc. for the Follow us footer. */
  socialLinks: GuestSocialLinks;
  /**
   * Loyalty Stamps reward for the offers sheet. Null when the merchant does
   * not have loyalty enabled — the Join banner stays hidden.
   */
  loyalty: {
    rewardTitle: string;
    rewardName: string;
    rewardImage: string;
    totalStamps: number;
    joinUrl: string;
  } | null;
  /** Active table offers for the Offers sheet. */
  offers: GuestMenuOffer[];
  /**
   * Percent rates the cart adds on top of the subtotal, and the labels to print
   * beside them. Labels are built server-side because the percent is part of
   * the wording ("CGST (2.5%)") in every language.
   */
  tax: {
    cgstPercent: number;
    sgstPercent: number;
    servicePercent: number;
  };
  /** Language everything above is written in. Drives the picker's current pill. */
  lang: string;
  /** Every language the picker offers, in the order it shows them. */
  languages: Array<{ code: string; native: string; rtl?: boolean }>;
  /**
   * Fixed interface text — buttons, labels, toasts — for English and for the
   * language being served. Only those two, so a guest is not made to download
   * a pack for every language the product supports.
   */
  chrome: Record<string, Record<string, string>>;
  /**
   * Translated dish name back to the merchant's own English. Kept so cart
   * insights and any future kitchen-facing writes can recover the original.
   */
  englishNames: Record<string, string>;
}

export interface GuestMenuInput {
  slug: string;
  branchSlug?: string | null;
  businessName: string;
  brandColor?: string | null;
  /** Merchant mark for the hero / chat header avatar. */
  logoUrl?: string | null;
  tableNumber: number | null;
  categories: MenuCategory[];
  /** Branch/merchant social links for the menu footer. */
  socialLinks?: GuestSocialLinks;
  /** Loyalty Stamps promo when that product is enabled. */
  loyalty?: GuestMenuData["loyalty"];
  /** Active table offers for the Offers sheet. */
  offers?: GuestMenuOffer[];
  /** Tax / service charge percents. Omitted keeps the long-standing defaults. */
  tax?: MenuTaxRates;
  /**
   * Units ordered recently (past 3 hours), keyed by menu item id and/or dish name.
   * Used for assistant popularity hints — the guest rail is Chef's choice.
   */
  recentOrders?: { byItemId?: Record<string, number>; byName?: Record<string, number> };
  /** Branch / merchant store hours (HH:MM or Postgres time). */
  openTime?: string | null;
  closeTime?: string | null;
  /** Language the categories and dishes above have already been rendered in. */
  lang?: string | null;
  /** Translated dish name back to English. */
  englishNames?: Record<string, string>;
}

/**
 * Digit scripts the chrome translations actually print numbers in. Bengali and
 * Devanagari packs write "২.৫" and "२.५" rather than "2.5", so a rewritten
 * percent has to be rendered in whichever script the translator chose.
 */
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66,
];

function digitZeroFor(text: string): number {
  for (const zero of DIGIT_ZEROS) {
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0;
      if (code >= zero && code <= zero + 9) return zero;
    }
  }
  return 0x0030;
}

/**
 * The rate is part of the wording — "CGST (2.5%)", "সার্ভিস চার্জ (৫%)" — so a
 * venue on 9% GST needs the number inside the label swapped, not just the
 * amount beside it. Only the numeric run changes; the script, the percent sign
 * and the translator's punctuation all survive.
 */
function labelWithPercent(label: string, percent: number): string {
  const zero = digitZeroFor(label);
  const localized = formatTaxPercent(percent).replace(/[0-9]/g, (digit) =>
    String.fromCodePoint(zero + Number(digit)),
  );
  const digitClass = `[0-9${String.fromCodePoint(zero)}-${String.fromCodePoint(zero + 9)}]`;
  const numberRun = new RegExp(`${digitClass}+([.,\u066b]${digitClass}+)?`);
  return numberRun.test(label) ? label.replace(numberRun, localized) : label;
}

/**
 * Interface text for one language, alongside English as the fallback for any
 * string the translation pass could not produce. Tax labels are rewritten per
 * merchant before they ship, since their percent is baked into the sentence.
 */
function chromeFor(
  lang: string,
  rates: MenuTaxRates,
): Record<string, Record<string, string>> {
  const packs: Record<string, Record<string, string>> = {
    EN: chromeEnglish as Record<string, string>,
  };
  const translated = (chromeTranslations as Record<string, Record<string, string>>)[lang];
  if (translated) packs[lang] = translated;
  const percents: Array<[string, number]> = [
    ["f:cgst", rates.cgstPercent],
    ["f:sgst", rates.sgstPercent],
    ["f:service", rates.serviceChargePercent],
  ];
  return Object.fromEntries(
    Object.entries(packs).map(([code, pack]) => {
      const next = { ...pack };
      for (const [key, percent] of percents) {
        if (next[key]) next[key] = labelWithPercent(next[key], percent);
      }
      return [code, next];
    }),
  );
}

/** Guest-facing "10:00 am – 10:00 pm" for the hero top bar. */
export function formatGuestHoursLabel(
  openTime: string | null | undefined,
  closeTime: string | null | undefined,
): string {
  const open = openTime?.trim() ? formatTimeForInput(openTime) : "";
  const close = closeTime?.trim() ? formatTimeForInput(closeTime) : "";
  if (!open || !close || open === close) return "";
  return `Open ${formatTimeLabel(open)} – ${formatTimeLabel(close)}`;
}

/** Recent order tallies used for popularity hints. */
export type PopularityCounts = {
  byItemId: Record<string, number>;
  byName: Record<string, number>;
};

/**
 * Ranks live dishes by how many were ordered recently. Ties break to chef's
 * picks, then catalogue order. Kept for analytics / tests — the guest rail uses
 * {@link pickChefChoiceItems}.
 */
export function pickPopularItems(
  items: MenuItem[],
  counts: PopularityCounts,
  limit = 3,
): { items: MenuItem[]; signal: Record<string, number> } {
  const scoreOf = (item: MenuItem) =>
    counts.byItemId[item.id] ?? counts.byName[item.name] ?? 0;

  const ranked = [...items].sort((a, b) => {
    const delta = scoreOf(b) - scoreOf(a);
    if (delta !== 0) return delta;
    const aChef = a.diet.includes("chef_choice") ? 1 : 0;
    const bChef = b.diet.includes("chef_choice") ? 1 : 0;
    if (aChef !== bChef) return bChef - aChef;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });

  const featuredItems = ranked.slice(0, Math.max(0, limit));
  const signal: Record<string, number> = {};
  for (const item of featuredItems) {
    const n = scoreOf(item);
    if (n > 0) signal[item.name] = n;
  }
  return { items: featuredItems, signal };
}

/**
 * Chef's choice rail: tagged chef picks first, then the rest of the menu in
 * catalogue order. No invented popularity counts.
 */
export function pickChefChoiceItems(
  items: MenuItem[],
  limit = 3,
): MenuItem[] {
  const byMenu = (a: MenuItem, b: MenuItem) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  };
  const chef = items.filter((item) => item.diet.includes("chef_choice")).sort(byMenu);
  const rest = items.filter((item) => !item.diet.includes("chef_choice")).sort(byMenu);
  return [...chef, ...rest].slice(0, Math.max(0, limit));
}

export interface GuestMenuApp {
  /** Overrides for the artifact's own prop defaults. */
  props: Record<string, unknown>;
  data: GuestMenuData;
}

function parseHex(color: string | null | undefined): [number, number, number] | null {
  const raw = (color ?? "").replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Pulls a colour down toward black, keeping its hue, until white text reads. */
function darkenToLimit(rgb: [number, number, number]): number[] {
  if (relativeLuminance(rgb) <= MAX_ACCENT_LUMINANCE) return rgb;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    const scaled = rgb.map((c) => c * mid) as [number, number, number];
    if (relativeLuminance(scaled) > MAX_ACCENT_LUMINANCE) high = mid;
    else low = mid;
  }
  return rgb.map((c) => c * low);
}

/**
 * The header prints white text straight onto the accent, so a pale brand colour
 * (a tan, a yellow) would render it unreadable. Rather than drop the brand we
 * deepen it until the contrast holds; only an unusable value falls back.
 */
export function accentFor(brandColor: string | null | undefined): {
  accent: string;
  accentSoft: string;
} {
  const rgb = parseHex(brandColor);
  if (!rgb) return { accent: ACCENT_FALLBACK, accentSoft: ACCENT_SOFT_FALLBACK };
  const accent = darkenToLimit(rgb);
  // The soft tint sits behind dark text, so it comes off the original hue.
  const soft = rgb.map((c) => c + (255 - c) * 0.88);
  return { accent: toHex(accent), accentSoft: toHex(soft) };
}

/** Category ids double as filter tab ids, so they must be unique and URL-safe. */
export function categoryIds(categories: MenuCategory[]): string[] {
  const used = new Set<string>();
  return categories.map((category, index) => {
    const base = category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = base || `section-${index + 1}`;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  });
}

/**
 * The one-line note under a dish name. The artifact writes these by hand
 * ("Vegan · mild"), so we assemble the same voice from tags and heat.
 */
export function metaLine(item: MenuItem): string {
  const parts: string[] = [];
  // Jain implies vegetarian, so name only the most specific of the four.
  const primary = (["vegan", "jain", "veg", "nonveg"] as const).find((tag) =>
    item.diet.includes(tag),
  );
  if (primary) parts.push(DIET_LABELS[primary]);
  if (item.diet.includes("gluten_free")) parts.push(DIET_LABELS.gluten_free);
  if (item.spiceLevel != null && item.spiceLevel > 0) {
    parts.push(SPICE_LABELS[Math.min(item.spiceLevel, 3)].toLowerCase());
  }
  return parts.join(" · ");
}

export function dietCodes(item: MenuItem): string[] {
  const codes = new Set<string>();
  for (const tag of item.diet) {
    const code = DIET_CODES[tag];
    if (code) codes.add(code);
  }
  return [...codes];
}

/** First sentence of the description — enough to sell the dish on a card. */
function shortWhy(item: MenuItem, fallback: string): string {
  const text = item.description.trim();
  if (!text) return fallback;
  const stop = text.search(/[.!?](\s|$)/);
  const first = stop === -1 ? text : text.slice(0, stop + 1);
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}

/**
 * Suggestion chips under the ask bar. Every prompt has to be a question this
 * restaurant can actually answer: a chip that leads to "check with someone on
 * the floor" is worse than no chip, because the guest reads the row as a menu
 * of what the assistant knows. So each one is gated on the data behind it —
 * heat chips need heat tags, an offers chip needs a live offer.
 *
 * Labels are looked up in the chrome pack for the guest's language.
 */
export function assistantPrompts(
  items: MenuItem[],
  venue: {
    offers?: ReadonlyArray<{ badge: string; title: string }>;
    hasLoyalty?: boolean;
    hasHours?: boolean;
  } = {},
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string = (
    _key,
    fallback,
  ) => fallback,
): { chips: string[]; followups: string[] } {
  const has = (...tags: string[]) =>
    items.some((item) => tags.some((tag) => item.diet.includes(tag as never)));
  const spicy = items.some((item) => (item.spiceLevel ?? 0) >= 2);
  const anyHeat = items.some((item) => (item.spiceLevel ?? 0) > 0);
  const quick = items.some((item) => item.prepMinutes != null && item.prepMinutes <= 10);
  const anyAllergens = items.some((item) => item.allergens.length > 0);
  const prices = items
    .map((item) => item.price)
    .filter((price): price is number => price != null && price > 0)
    .sort((a, b) => a - b);
  const hasOffers = (venue.offers ?? []).some((offer) => offer.badge?.trim() && offer.title?.trim());

  const chips: string[] = [];
  // Lead with what the restaurant is promoting, then the questions Indian
  // diners ask first, then the slower browse prompts.
  if (hasOffers) chips.push(t("p:offers", "What offers are on?"));
  if (spicy || anyHeat) chips.push(t("p:spiciest", "What's the spiciest?"));
  if (has("jain")) chips.push(t("p:jain", "Any Jain options?"));
  if (has("vegan")) chips.push(t("p:vegan", "Vegan dishes"));
  else if (has("veg", "jain")) chips.push(t("p:veg", "Best vegetarian picks"));
  if (has("gluten_free")) chips.push(t("p:gf", "Gluten-free options"));
  if (has("chef_choice")) chips.push(t("p:chef", "Chef's favourites"));
  else chips.push(t("p:popularTonight", "What's popular tonight?"));
  if (quick) chips.push(t("p:quick", "Ready in under 10 min"));
  if (prices.length) {
    const median = prices[Math.floor(prices.length / 2)];
    const budget = Math.max(200, Math.round((median * 3) / 50) * 50);
    chips.push(t("p:budget", `Under ₹${budget} for two`, { n: budget }));
  }
  if (venue.hasLoyalty) chips.push(t("p:stamps", "How do stamps work?"));
  if (venue.hasHours) chips.push(t("p:close", "What time do you close?"));

  // Three follow-ups, each one a live capability rather than a dead end.
  const followups = [
    anyHeat ? t("p:mild", "Something mild") : t("p:sharing", "Good for sharing"),
    anyAllergens
      ? t("p:nuts", "Any nut allergens?")
      : t("p:lighter", "Something lighter"),
    hasOffers
      ? t("p:offerOn", "Any offer on these?")
      : t("p:cheaper", "Make it cheaper"),
  ];

  // Cap so the pill row stays scannable on a phone.
  return {
    chips: [...new Set(chips)].slice(0, 6),
    followups,
  };
}

/**
 * Prefers a dish already on the featured rail (so the hero matches what the
 * guest sees next), then any photographed dish. Null when nothing has a photo
 * — the hero keeps its solid accent wash.
 */
export function pickHeroPhoto(featured: MenuItem[], all: MenuItem[]): string | null {
  for (const item of featured) {
    if (item.imageUrl) return item.imageUrl;
  }
  for (const item of all) {
    if (item.imageUrl) return item.imageUrl;
  }
  return null;
}

export function buildGuestMenuApp(input: GuestMenuInput): GuestMenuApp {
  const ids = categoryIds(input.categories);
  const allItems = input.categories.flatMap((category) => category.items);
  const lang = readLanguage(input.lang);
  const taxRates = normalizeMenuTaxRates(input.tax ?? DEFAULT_MENU_TAX_RATES);
  const chromePacks = chromeFor(lang, taxRates);
  const chromeLookup = (key: string, fallback: string, vars?: Record<string, string | number>) => {
    const raw =
      chromePacks[lang]?.[key] || chromePacks.EN?.[key] || fallback;
    if (!vars) return raw;
    return Object.entries(vars).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      raw,
    );
  };

  const diet: Record<string, string[]> = {};
  const allergens: Record<string, string[]> = {};
  const spice: Record<string, number> = {};
  const photos: Record<string, string> = {};
  for (const item of allItems) {
    const codes = dietCodes(item);
    if (codes.length) diet[item.name] = codes;
    const shown = item.allergens.filter((a) => SHOWN_ALLERGENS.includes(a));
    if (shown.length) allergens[item.name] = shown;
    if (item.spiceLevel != null && item.spiceLevel > 0) {
      spice[item.name] = Math.min(3, Math.round(item.spiceLevel));
    }
    if (item.imageUrl) photos[item.name] = item.imageUrl;
  }

  const chefsPick = chromeLookup("t:chefsPick", "Chef's pick");
  const kitchenFavourite = chromeLookup("t:kitchenFavourite", "A kitchen favourite.");

  const menu = input.categories.map((category, index) => ({
    id: ids[index],
    name: category.name,
    items: category.items.map((item) => ({
      name: item.name,
      desc: item.description.trim(),
      // The design has no "market price" state; unpriced dishes read as free.
      price: item.price ?? 0,
      meta: metaLine(item),
      mins: item.prepMinutes,
      badge: item.diet.includes("chef_choice") ? chefsPick : "",
    })),
  }));

  // Chef's choice rail — tagged kitchen picks, then the rest of the menu.
  const featuredItems = pickChefChoiceItems(allItems);
  const featured = featuredItems.map((item) => ({
    name: item.name,
    why: shortWhy(item, kitchenFavourite),
    price: item.price ?? 0,
  }));
  const signal: Record<string, number> = {};

  const { accent, accentSoft } = accentFor(input.brandColor);
  const hoursLabel = formatGuestHoursLabel(input.openTime, input.closeTime);
  // Lead with the dishes already on the featured rail — the guest just saw them.
  const prompts = assistantPrompts(
    [...featuredItems, ...allItems],
    {
      offers: input.offers ?? [],
      hasLoyalty: !!input.loyalty,
      hasHours: !!hoursLabel,
    },
    chromeLookup,
  );

  return {
    props: {
      brand: input.businessName,
      table: input.tableNumber == null ? "" : `T${input.tableNumber}`,
      serviceNote: "",
      hoursLabel,
      hasHours: !!hoursLabel,
      accent,
      accentSoft,
      logoUrl: input.logoUrl?.trim() || "",
    },
    data: {
      menu,
      featured,
      diet,
      allergens,
      spice,
      photos,
      heroPhoto: pickHeroPhoto(featuredItems, allItems),
      // Keyed by name like every other guest map: the artifact indexes dishes by
      // name, not id. Dishes with no estimate are left out so the card shows no
      // calorie figure at all rather than a zero.
      kcal: Object.fromEntries(
        allItems
          .filter((item) => item.calories != null && item.calories > 0)
          .map((item) => [item.name, item.calories as number]),
      ),
      signal,
      server: "",
      voiceSamples: prompts.chips,
      replies: {},
      reward: null,
      chips: prompts.chips,
      followups: prompts.followups,
      tableNumber: input.tableNumber,
      context: {
        slug: input.slug,
        branch: input.branchSlug ?? null,
        table: input.tableNumber,
      },
      socialLinks: input.socialLinks ?? {},
      loyalty: input.loyalty ?? null,
      offers: (input.offers ?? []).map((offer) => ({
        badge: offer.badge,
        title: offer.title,
        detail: offer.detail,
      })),
      tax: {
        cgstPercent: taxRates.cgstPercent,
        sgstPercent: taxRates.sgstPercent,
        servicePercent: taxRates.serviceChargePercent,
      },
      lang,
      chrome: chromePacks,
      languages: MENU_LANGUAGES.map((language) => ({
        code: language.code,
        native: language.native,
        ...(language.rtl ? { rtl: true } : {}),
      })),
      englishNames: input.englishNames ?? {},
    },
  };
}
