/** Field ceilings — guest cards stay readable; AI copy needs room for method + ingredients. */
export const MENU_NAME_MAX = 80;
/** Roughly 20–35 words: enough to say what the dish is, short enough to scan. */
export const MENU_DESC_MAX = 180;
export const MENU_SECTION_MAX = 60;
/** After JPEG compression a dish photo fits well under this. */
export const MENU_IMAGE_MAX_CHARS = 280_000;

/**
 * Dish tags guests filter on. Stored as free-form text so a new tag needs no
 * migration. Veg / nonveg / vegan are mutually exclusive; Jain, gluten-free and
 * chef's choice stack on top.
 */
export const DIET_TAGS = [
  "veg",
  "nonveg",
  "vegan",
  "jain",
  "gluten_free",
  "chef_choice",
] as const;
export type DietTag = (typeof DIET_TAGS)[number];

/** Only one of these should be on a dish at a time. */
export const DIET_EXCLUSIVE = ["veg", "nonveg", "vegan"] as const;

export const ALLERGENS = [
  "gluten",
  "dairy",
  "nuts",
  "egg",
  "fish",
  "shellfish",
  "soy",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const DIET_LABELS: Record<DietTag, string> = {
  veg: "Veg",
  nonveg: "Non-veg",
  vegan: "Vegan",
  jain: "Jain",
  gluten_free: "Gluten-free",
  chef_choice: "Chef's choice",
};

/** 0-3 heat, shown to guests as that many chillies. */
export const SPICE_LABELS = ["None", "Mild", "Medium", "Hot"] as const;

/** Toggle a diet tag, clearing marks that can't be true at the same time. */
export function toggleDietTag(list: DietTag[], tag: DietTag): DietTag[] {
  if (list.includes(tag)) return list.filter((entry) => entry !== tag);
  const exclusive = (DIET_EXCLUSIVE as readonly string[]).includes(tag);
  let next = exclusive
    ? list.filter((entry) => !(DIET_EXCLUSIVE as readonly string[]).includes(entry))
    : [...list];
  // Jain food is strictly vegetarian, so it can never sit beside a non-veg mark.
  if (tag === "jain") next = next.filter((entry) => entry !== "nonveg");
  if (tag === "nonveg") next = next.filter((entry) => entry !== "jain");
  next.push(tag);
  return next;
}

/** Toggle a contains-allergen tag on a dish. */
export function toggleAllergen(list: Allergen[], tag: Allergen): Allergen[] {
  return list.includes(tag)
    ? list.filter((entry) => entry !== tag)
    : [...list, tag];
}

/**
 * Squeezes a description under the ceiling without stopping mid-word. A model
 * asked for 35 words will sometimes land a little over, and a hard slice leaves
 * the guest reading "…topped with crispy pota". Cutting back to the last whole
 * sentence keeps it readable; failing that, the last whole word plus an ellipsis.
 */
export function fitMenuDescription(raw: string, max = MENU_DESC_MAX): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;

  const clipped = text.slice(0, max);
  const sentence = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
  );
  // Only trust a sentence break that still leaves a real description behind.
  if (sentence >= max * 0.6) return clipped.slice(0, sentence + 1);

  const word = clipped.lastIndexOf(" ");
  const stem = (word > 0 ? clipped.slice(0, word) : clipped).replace(/[\s,;:.\u2013\u2014-]+$/, "");
  return `${stem}…`;
}

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: "Gluten",
  dairy: "Dairy",
  nuts: "Nuts",
  egg: "Egg",
  fish: "Fish",
  shellfish: "Shellfish",
  soy: "Soy",
};

export type MenuItemStatus = "draft" | "live";

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  /** Null when the menu prints no price ("market price"). */
  price: number | null;
  /** Data URL or hosted URL — square dish photo. */
  imageUrl: string | null;
  diet: DietTag[];
  allergens: Allergen[];
  /** 0–3, null when unknown. */
  spiceLevel: number | null;
  prepMinutes: number | null;
  /** Approximate kcal per serving. Null when unknown — never shown as 0. */
  calories: number | null;
  isAvailable: boolean;
  status: MenuItemStatus;
  source: "manual" | "ai";
  sortOrder: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
}

/** A dish read out of an upload, before the merchant keeps or discards it. */
export interface DraftMenuItem {
  name: string;
  description: string;
  price: number | null;
  /** Optional square thumbnail (data URL) — upload or AI. */
  imageUrl: string | null;
  diet: DietTag[];
  allergens: Allergen[];
  spiceLevel: number | null;
  /** Estimated cook / prep minutes for the guest. */
  prepMinutes: number | null;
  /** Estimated kcal per serving for the guest. */
  calories: number | null;
}

export interface DraftMenuCategory {
  name: string;
  items: DraftMenuItem[];
}

export function isDietTag(value: string): value is DietTag {
  return (DIET_TAGS as readonly string[]).includes(value);
}

export function isAllergen(value: string): value is Allergen {
  return (ALLERGENS as readonly string[]).includes(value);
}

export function countDraftItems(categories: DraftMenuCategory[]): number {
  return categories.reduce((total, category) => total + category.items.length, 0);
}

/** "₹280" / "₹1,240.50" — prices are stored as plain numbers, formatted at the edge. */
export function formatMenuPrice(price: number | null, currency = "₹"): string {
  if (price == null) return "—";
  const rounded = Math.round(price * 100) / 100;
  const hasPaise = rounded % 1 !== 0;
  return `${currency}${rounded.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact table code for chips and badges — T1, T12. */
export function formatMenuTableCode(
  tableNumber: number | null | undefined,
): string {
  if (tableNumber == null) return "—";
  return `T${tableNumber}`;
}

/**
 * Prefer a custom dining-table label (Patio 1); otherwise T7.
 * Ignores auto "Table N" labels so the UI stays on the T-code style.
 */
export function formatMenuTableLabel(
  tableNumber: number | null | undefined,
  tableLabel?: string | null,
): string {
  const custom = tableLabel?.trim();
  if (custom && !/^table\s+\d+$/i.test(custom)) return custom;
  if (tableNumber != null) return `T${tableNumber}`;
  return custom || "—";
}
