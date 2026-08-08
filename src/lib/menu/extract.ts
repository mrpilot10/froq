import "server-only";

import { generateAiText, type AiFile } from "@/lib/ai/gemini";
import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import {
  fitMenuDescription,
  isAllergen,
  isDietTag,
  MENU_DESC_MAX,
  MENU_NAME_MAX,
  MENU_SECTION_MAX,
  type DraftMenuCategory,
  type DraftMenuItem,
} from "./types";

/**
 * Reads a menu out of photos or a PDF. The model only transcribes: it is told
 * not to invent dishes, because a made-up item on a live menu is worse than a
 * missing one — the merchant reviews everything before it saves either way.
 */

const SYSTEM_PROMPT = `You transcribe restaurant menus into structured data.

Rules:
- Only include dishes that appear in the provided images or PDF. Never invent a dish, price, or description.
- Keep the menu's own section names (Starters, Mains, Breads, Beverages…). If a dish has no section, put it in "Menu".
- Keep the dish name exactly as printed, minus decoration like leading dots or trailing price dots.
- description: use the printed description / ingredients line if there is one. If there is none, leave it empty. Do not invent ingredients.
- price: the number only, no currency symbol or commas. Use the smaller number for a range. Use null when no price is printed.
- diet: any of veg, nonveg, vegan, jain, gluten_free, chef_choice — only when the menu marks it with a green/red dot, "veg", "non veg", "vegan", "Jain", "J", "V", "NV", "GF", "chef's special/choice" and so on. Never guess from the dish name. Use nonveg for meat/fish/egg non-veg marks, jain for a Jain mark or "Jain available", chef_choice for chef's special/recommended.
- allergens: only when the menu states them ("contains nuts"). Never guess.
- spiceLevel: 0-3 only when the menu marks heat (chilli icons, "medium hot"). Otherwise null.
- Transcribe every dish you can read, including ones printed sideways or in a second column.
- If a page is too blurry to read, skip it rather than guessing.
- Reply with ONLY a JSON object shaped like:
  {"categories":[{"name":"Starters","items":[{"name":"…","description":"","price":199,"diet":[],"allergens":[],"spiceLevel":null}]}]}
- No markdown fences, no commentary.`;

/** Menus run long; a full PDF can take a while to come back. */
const EXTRACT_TIMEOUT_MS = 90_000;
const MAX_CATEGORIES = 40;
const MAX_ITEMS_PER_CATEGORY = 120;

interface RawItem {
  name?: unknown;
  description?: unknown;
  price?: unknown;
  diet?: unknown;
  allergens?: unknown;
  spiceLevel?: unknown;
}

interface RawCategory {
  name?: unknown;
  items?: unknown;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPrice(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^0-9.]/g, ""))
        : NaN;
  if (!Number.isFinite(raw) || raw < 0 || raw > 1_000_000) return null;
  return Math.round(raw * 100) / 100;
}

function cleanTags<T extends string>(value: unknown, guard: (v: string) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim().toLowerCase();
    if (guard(tag)) seen.add(tag);
  }
  return [...seen];
}

function cleanSpice(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) return null;
  const level = Math.round(raw);
  return level >= 0 && level <= 3 ? level : null;
}

function toDraftItem(raw: RawItem): DraftMenuItem | null {
  const name = cleanText(raw?.name, MENU_NAME_MAX);
  if (!name) return null;
  return {
    name,
    description: fitMenuDescription(cleanText(raw?.description, MENU_DESC_MAX * 2)),
    price: cleanPrice(raw?.price),
    imageUrl: null,
    diet: cleanTags(raw?.diet, isDietTag),
    allergens: cleanTags(raw?.allergens, isAllergen),
    spiceLevel: cleanSpice(raw?.spiceLevel),
    // Transcription only reports what the menu prints. Cook time and calories
    // are estimates, and they arrive later from the per-dish enrich pass.
    prepMinutes: null,
    calories: null,
  };
}

/**
 * Model output is untrusted input: it can repeat a dish across pages, name a
 * section twice, or return a price as a string. Normalising here keeps every
 * caller — review sheet, save action — working with clean data.
 */
export function normalizeExtraction(payload: unknown): DraftMenuCategory[] {
  const rawCategories = (payload as { categories?: unknown } | null)?.categories;
  if (!Array.isArray(rawCategories)) return [];

  const byName = new Map<string, DraftMenuCategory>();

  for (const rawCategory of rawCategories.slice(0, MAX_CATEGORIES) as RawCategory[]) {
    const name = cleanText(rawCategory?.name, MENU_SECTION_MAX) || "Menu";
    const key = name.toLowerCase();
    const category = byName.get(key) ?? { name, items: [] };
    if (!byName.has(key)) byName.set(key, category);

    const rawItems = Array.isArray(rawCategory?.items) ? rawCategory.items : [];
    for (const rawItem of rawItems.slice(0, MAX_ITEMS_PER_CATEGORY) as RawItem[]) {
      const item = toDraftItem(rawItem);
      if (!item) continue;
      const duplicate = category.items.some(
        (existing) => existing.name.toLowerCase() === item.name.toLowerCase(),
      );
      if (!duplicate) category.items.push(item);
    }
  }

  return [...byName.values()].filter((category) => category.items.length > 0);
}

export interface MenuExtraction {
  categories: DraftMenuCategory[];
  usedTokens: number | null;
}

/** Send the uploads to Gemini and return a reviewable draft. Nothing is saved here. */
export async function extractMenuFromFiles(
  files: AiFile[],
  merchantId?: string | null,
): Promise<MenuExtraction> {
  // Freeform JSON — responseSchema is unreliable on gemini-3.5-flash right now.
  const result = await generateAiText({
    feature: "menu_extract",
    merchantId,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        text: 'Transcribe every dish in these menu pages. Return ONLY JSON: {"categories":[...]}',
        files,
      },
    ],
    temperature: 0,
    // Reading a printed page needs some deliberation; a photographed menu in
    // two columns is easy to misread at `minimal`.
    thinkingLevel: "low",
    maxOutputTokens: 16_384,
    timeoutMs: EXTRACT_TIMEOUT_MS,
  });

  const data =
    result.data ??
    parseJsonFromAiText(result.text) ??
    null;

  return {
    categories: normalizeExtraction(data),
    usedTokens: result.usage.totalTokens,
  };
}
