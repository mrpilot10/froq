"use server";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMerchantContext } from "@/lib/merchant/server-context";
import { canViewAnalytics } from "@/lib/merchant/roles";
import { dashboardRangeStart } from "@/lib/merchant/analytics";
import {
  computeMenuAnalytics,
  type AiUsageRow,
  type MenuAnalytics,
  type MenuEventRow,
} from "@/lib/merchant/menu-analytics";
import type { DashboardDateRange } from "@/lib/merchant/types";
import { AiError } from "@/lib/ai/gemini";
import {
  AI_GEN_CREDITS,
  checkAiGenerationCapacity,
  loadMenuUsage,
  recordAiGeneration,
} from "@/lib/menu/capacity";
import {
  generateDishDescription,
  generateDishThumbnail,
} from "@/lib/menu/enrich";
import { extractMenuFromFiles } from "@/lib/menu/extract";
import {
  fitMenuDescription,
  isAllergen,
  isDietTag,
  MENU_IMAGE_MAX_CHARS,
  MENU_NAME_MAX,
  MENU_SECTION_MAX,
  type Allergen,
  type DietTag,
  type DraftMenuCategory,
  type MenuCategory,
  type MenuItem,
  type MenuItemStatus,
} from "@/lib/menu/types";
import { syncMenuTranslations } from "@/lib/menu/translate-store";
import type { MenuCategoryRow, MenuItemRow } from "@/lib/supabase/database.types";

/**
 * Guest menus are read in thirteen languages, so edited text has to be
 * retranslated. It runs after the response because a merchant saving one dish
 * should not wait on model calls, and because a half-finished pass is harmless:
 * untranslated rows keep their English and are retried on the next save.
 */
function retranslate(merchantId: string): void {
  after(async () => {
    await syncMenuTranslations(merchantId).catch(() => 0);
  });
}

const ITEM_COLUMNS =
  "id, category_id, name, description, price, image_url, diet, allergens, spice_level, prep_minutes, calories, is_available, status, source, sort_order";

/** What a phone camera or a menu PDF arrives as. Mirrors the Worker's allowlist. */
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const MAX_UPLOADS = 8;
/** Decoded bytes across all files — server actions and Gemini both have ceilings. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

function mapItem(row: Pick<MenuItemRow, keyof MenuItemRow & string>): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? "",
    price: row.price == null ? null : Number(row.price),
    imageUrl: row.image_url ?? null,
    diet: (row.diet ?? []).filter(isDietTag),
    allergens: (row.allergens ?? []).filter(isAllergen),
    spiceLevel: row.spice_level,
    prepMinutes: row.prep_minutes,
    calories: row.calories ?? null,
    isAvailable: row.is_available,
    status: row.status === "draft" ? "draft" : "live",
    source: row.source === "ai" ? "ai" : "manual",
    sortOrder: row.sort_order,
  };
}

/**
 * Kcal the column will accept: whole, positive, under the 5000 ceiling. Shared
 * by every write path so an estimate rejected by the database can never make it
 * as far as the insert.
 */
function sanitizeCalories(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 5000 ? rounded : null;
}

function sanitizeImageUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.length > MENU_IMAGE_MAX_CHARS) return null;
  if (raw.startsWith("data:image/") || raw.startsWith("https://") || raw.startsWith("http://")) {
    return raw;
  }
  return null;
}

export interface MenuSnapshot {
  ok: boolean;
  error?: string;
  categories: MenuCategory[];
  itemCount: number;
}

/**
 * Sidebar + home meters: unified AI Credits for the Menu billing cycle.
 */
export async function countMenuUsedForPlanMeter(): Promise<{
  ok: boolean;
  /** Credits used this period (monthly pool). */
  generations: number;
  /** Alias of generations — legacy field name. */
  conversations: number;
  maxGenerations: number;
  maxConversations: number;
  generationsRemaining: number;
  available: number;
  cycleEndsAt: string | null;
  breakdown: Array<{ bucket: string; label: string; credits: number }>;
  purchasedRemaining: number;
  history: Array<{
    id: string;
    feature: string;
    label: string;
    creditsUsed: number;
    createdAt: string;
  }>;
  /** @deprecated alias of generations */
  aiDishes: number;
  error?: string;
}> {
  const empty = {
    generations: 0,
    conversations: 0,
    maxGenerations: 0,
    maxConversations: 0,
    generationsRemaining: 0,
    available: 0,
    cycleEndsAt: null as string | null,
    breakdown: [] as Array<{ bucket: string; label: string; credits: number }>,
    purchasedRemaining: 0,
    history: [] as Array<{
      id: string;
      feature: string;
      label: string;
      creditsUsed: number;
      createdAt: string;
    }>,
    aiDishes: 0,
  };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) {
      return { ok: false, ...empty, error: ctx.error };
    }
    const { loadAiCreditDashboard, loadAiCreditHistory } = await import(
      "@/lib/ai/credits"
    );
    const [dash, history] = await Promise.all([
      loadAiCreditDashboard(ctx.merchantId),
      loadAiCreditHistory(ctx.merchantId, 10),
    ]);
    return {
      ok: true,
      generations: dash.usedDisplay,
      conversations: dash.usedDisplay,
      maxGenerations: dash.limitDisplay,
      maxConversations: dash.limitDisplay,
      generationsRemaining: dash.balance.available,
      available: dash.balance.available,
      cycleEndsAt: dash.balance.cycleEndsAt,
      breakdown: dash.breakdown.map((row) => ({
        bucket: row.bucket,
        label: row.label,
        credits: row.credits,
      })),
      purchasedRemaining: dash.balance.purchasedRemaining,
      history,
      aiDishes: dash.usedDisplay,
    };
  } catch (error) {
    return {
      ok: false,
      ...empty,
      error: error instanceof Error ? error.message : "Could not load usage.",
    };
  }
}

/** The whole menu, grouped. Small enough that paging would only add bugs. */
export async function fetchMenu(): Promise<MenuSnapshot> {
  const empty = { categories: [] as MenuCategory[], itemCount: 0 };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, ...empty };

    const admin = createAdminClient();
    const [{ data: categoryRows, error: categoryError }, { data: itemRows, error: itemError }] =
      await Promise.all([
        admin
          .from("menu_categories")
          .select("id, name, sort_order")
          .eq("merchant_id", ctx.merchantId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        admin
          .from("menu_items")
          .select(ITEM_COLUMNS)
          .eq("merchant_id", ctx.merchantId)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

    if (categoryError) return { ok: false, error: categoryError.message, ...empty };
    if (itemError) return { ok: false, error: itemError.message, ...empty };

    const items = (itemRows ?? []).map((row) => mapItem(row as MenuItemRow));
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of items) {
      const list = byCategory.get(item.categoryId);
      if (list) list.push(item);
      else byCategory.set(item.categoryId, [item]);
    }

    const categories = (categoryRows ?? []).map((row) => {
      const category = row as Pick<MenuCategoryRow, "id" | "name" | "sort_order">;
      return {
        id: category.id,
        name: category.name,
        sortOrder: category.sort_order,
        items: byCategory.get(category.id) ?? [],
      };
    });

    return { ok: true, categories, itemCount: items.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load the menu.",
      ...empty,
    };
  }
}

export interface MenuUpload {
  name: string;
  mimeType: string;
  /** Base64 without the `data:` prefix. */
  data: string;
}

/**
 * Read uploads with Gemini and hand back a draft. Deliberately does not save:
 * an AI transcription of a photographed menu is a suggestion, and the merchant
 * corrects it in the review step before anything reaches the guest-facing menu.
 */
export async function readMenuUploads(input: { files: MenuUpload[] }): Promise<{
  ok: boolean;
  error?: string;
  categories: DraftMenuCategory[];
  /** Credits charged for this import (2 × dishes). */
  creditsUsed?: number;
  dishCount?: number;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, categories: [] };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu.", categories: [] };
    }

    const files = Array.isArray(input.files) ? input.files : [];
    if (files.length === 0) {
      return { ok: false, error: "Add at least one photo or PDF.", categories: [] };
    }
    if (files.length > MAX_UPLOADS) {
      return { ok: false, error: `Upload up to ${MAX_UPLOADS} files at a time.`, categories: [] };
    }

    let bytes = 0;
    for (const file of files) {
      if (!ALLOWED_UPLOAD_TYPES.has(file.mimeType)) {
        return { ok: false, error: `${file.name}: unsupported file type.`, categories: [] };
      }
      bytes += Math.floor((file.data.length * 3) / 4);
    }
    if (bytes > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: "Those files are too large. Try fewer pages at a time.",
        categories: [],
      };
    }

    const { checkAiCredits, deductAiCredits } = await import("@/lib/ai/credits");
    const { creditCost } = await import("@/lib/ai/credits-config");
    const { countDraftItems } = await import("@/lib/menu/types");

    // Need at least enough for one dish before we spend a model call.
    const gate = await checkAiCredits(ctx.merchantId, "menu_import", 1);
    if (!gate.ok) {
      return { ok: false, error: gate.error, categories: [] };
    }

    const extraction = await extractMenuFromFiles(
      files.map((file) => ({ mimeType: file.mimeType, data: file.data })),
    );

    if (extraction.categories.length === 0) {
      return {
        ok: false,
        error: "Couldn't read any dishes from that. Try a sharper photo, or add items manually.",
        categories: [],
      };
    }

    const dishCount = countDraftItems(extraction.categories);
    if (dishCount <= 0) {
      return {
        ok: false,
        error: "Couldn't read any dishes from that. Try a sharper photo, or add items manually.",
        categories: [],
      };
    }

    const charge = await checkAiCredits(ctx.merchantId, "menu_import", dishCount);
    if (!charge.ok) {
      const need = creditCost("menu_import") * dishCount;
      return {
        ok: false,
        error: `Importing ${dishCount} dish${dishCount === 1 ? "" : "es"} needs ${need.toLocaleString("en-IN")} credits — only ${charge.balance.available.toLocaleString("en-IN")} left. Upgrade or buy credits, then try again.`,
        categories: [],
      };
    }

    await deductAiCredits({
      merchantId: ctx.merchantId,
      feature: "menu_import",
      units: dishCount,
    });

    return {
      ok: true,
      categories: extraction.categories,
      creditsUsed: charge.cost,
      dishCount,
    };
  } catch (error) {
    if (error instanceof AiError) {
      return { ok: false, error: error.message, categories: [] };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the menu.",
      categories: [],
    };
  }
}

function sanitizeDraft(categories: DraftMenuCategory[]): DraftMenuCategory[] {
  return categories
    .map((category) => ({
      name: (category.name ?? "").trim().slice(0, MENU_SECTION_MAX) || "Menu",
      items: (category.items ?? [])
        .map((item) => ({
          name: (item.name ?? "").trim().slice(0, MENU_NAME_MAX),
          description: fitMenuDescription(item.description ?? ""),
          price:
            typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0
              ? Math.round(item.price * 100) / 100
              : null,
          imageUrl: sanitizeImageUrl(item.imageUrl),
          diet: (item.diet ?? []).filter(isDietTag) as DietTag[],
          allergens: (item.allergens ?? []).filter(isAllergen) as Allergen[],
          spiceLevel:
            typeof item.spiceLevel === "number" && item.spiceLevel >= 0 && item.spiceLevel <= 3
              ? Math.round(item.spiceLevel)
              : null,
          prepMinutes:
            typeof item.prepMinutes === "number" &&
            item.prepMinutes >= 5 &&
            item.prepMinutes <= 180
              ? Math.round(item.prepMinutes)
              : null,
          calories: sanitizeCalories(item.calories),
        }))
        .filter((item) => item.name),
    }))
    .filter((category) => category.items.length > 0);
}

/** Categories the merchant already has, matched case-insensitively by name. */
async function categoryIdsByName(
  merchantId: string,
): Promise<{ ids: Map<string, string>; maxSort: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("menu_categories")
    .select("id, name, sort_order")
    .eq("merchant_id", merchantId);

  const ids = new Map<string, string>();
  let maxSort = -1;
  for (const row of data ?? []) {
    const category = row as Pick<MenuCategoryRow, "id" | "name" | "sort_order">;
    ids.set(category.name.trim().toLowerCase(), category.id);
    maxSort = Math.max(maxSort, category.sort_order);
  }
  return { ids, maxSort };
}

/**
 * Adds a reviewed draft to the menu. Sections that already exist are reused so
 * uploading a second page doesn't create "Starters" twice, and a dish the
 * merchant already has is skipped rather than duplicated.
 */
export async function saveMenuDraft(input: {
  categories: DraftMenuCategory[];
  source?: "manual" | "ai";
  /** draft = merchant-only; live = guest-facing. */
  status?: MenuItemStatus;
}): Promise<{ ok: boolean; error?: string; added?: number; skipped?: number }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu." };
    }

    const categories = sanitizeDraft(input.categories ?? []);
    if (categories.length === 0) return { ok: false, error: "Nothing to save." };

    const admin = createAdminClient();
    const { ids, maxSort } = await categoryIdsByName(ctx.merchantId);
    let nextSort = maxSort + 1;

    const newCategories = categories.filter(
      (category) => !ids.has(category.name.toLowerCase()),
    );
    if (newCategories.length > 0) {
      const { data: inserted, error: insertError } = await admin
        .from("menu_categories")
        .insert(
          newCategories.map((category) => ({
            merchant_id: ctx.merchantId,
            name: category.name,
            sort_order: nextSort++,
          })),
        )
        .select("id, name");
      if (insertError) return { ok: false, error: insertError.message };
      for (const row of inserted ?? []) {
        const category = row as Pick<MenuCategoryRow, "id" | "name">;
        ids.set(category.name.trim().toLowerCase(), category.id);
      }
    }

    const { data: existingRows } = await admin
      .from("menu_items")
      .select("name, category_id")
      .eq("merchant_id", ctx.merchantId);
    const existing = new Set(
      (existingRows ?? []).map(
        (row) =>
          `${(row as { category_id: string }).category_id}:${(row as { name: string }).name
            .trim()
            .toLowerCase()}`,
      ),
    );

    const status: MenuItemStatus = input.status === "draft" ? "draft" : "live";
    const rows: Array<Record<string, unknown>> = [];
    let skipped = 0;
    for (const category of categories) {
      const categoryId = ids.get(category.name.toLowerCase());
      if (!categoryId) continue;
      let sortOrder = 0;
      for (const item of category.items) {
        const key = `${categoryId}:${item.name.toLowerCase()}`;
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }
        existing.add(key);
        rows.push({
          merchant_id: ctx.merchantId,
          category_id: categoryId,
          name: item.name,
          description: item.description || null,
          price: item.price,
          image_url: item.imageUrl,
          diet: item.diet,
          allergens: item.allergens,
          spice_level: item.spiceLevel,
          prep_minutes: item.prepMinutes,
          calories: item.calories,
          status,
          is_available: status === "live",
          source: input.source ?? "ai",
          sort_order: sortOrder++,
        });
      }
    }

    if (rows.length === 0) return { ok: true, added: 0, skipped };

    // Hand-typed + OCR-saved dishes are unlimited. AI Generations are spent
    // when enriching (description / image), not when inserting catalog rows.

    const { error: itemsError } = await admin.from("menu_items").insert(rows);
    if (itemsError) return { ok: false, error: itemsError.message };

    retranslate(ctx.merchantId);
    return { ok: true, added: rows.length, skipped };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the menu.",
    };
  }
}

export interface MenuItemInput {
  id?: string;
  categoryName: string;
  name: string;
  description?: string;
  price?: number | null;
  imageUrl?: string | null;
  diet?: DietTag[];
  allergens?: Allergen[];
  spiceLevel?: number | null;
  prepMinutes?: number | null;
  calories?: number | null;
  isAvailable?: boolean;
  status?: MenuItemStatus;
}

/** Create or update one dish — the manual path, and the edit button on any row. */
export async function saveMenuItem(input: MenuItemInput): Promise<{
  ok: boolean;
  error?: string;
  item?: MenuItem;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu." };
    }

    const name = (input.name ?? "").trim();
    if (!name) return { ok: false, error: "Give the dish a name." };
    const categoryName = (input.categoryName ?? "").trim() || "Menu";

    const admin = createAdminClient();
    const { ids, maxSort } = await categoryIdsByName(ctx.merchantId);
    let categoryId = ids.get(categoryName.toLowerCase());
    if (!categoryId) {
      const { data: created, error: categoryError } = await admin
        .from("menu_categories")
        .insert({
          merchant_id: ctx.merchantId,
          name: categoryName,
          sort_order: maxSort + 1,
        })
        .select("id")
        .single();
      if (categoryError || !created) {
        return { ok: false, error: categoryError?.message ?? "Could not add that section." };
      }
      categoryId = (created as { id: string }).id;
    }

    const status: MenuItemStatus = input.status === "draft" ? "draft" : "live";
    const patch = {
      category_id: categoryId,
      name: name.slice(0, MENU_NAME_MAX),
      description: fitMenuDescription(input.description ?? "") || null,
      price:
        typeof input.price === "number" && Number.isFinite(input.price) && input.price >= 0
          ? Math.round(input.price * 100) / 100
          : null,
      image_url: sanitizeImageUrl(input.imageUrl),
      diet: (input.diet ?? []).filter(isDietTag),
      allergens: (input.allergens ?? []).filter(isAllergen),
      spice_level:
        typeof input.spiceLevel === "number" &&
        input.spiceLevel >= 0 &&
        input.spiceLevel <= 3
          ? Math.round(input.spiceLevel)
          : null,
      prep_minutes:
        typeof input.prepMinutes === "number" &&
        input.prepMinutes > 0 &&
        input.prepMinutes <= 240
          ? Math.round(input.prepMinutes)
          : null,
      calories: sanitizeCalories(input.calories),
      is_available: input.isAvailable ?? status === "live",
      status,
    };

    if (input.id) {
      const { data, error } = await admin
        .from("menu_items")
        .update(patch)
        .eq("id", input.id)
        .eq("merchant_id", ctx.merchantId)
        .select(ITEM_COLUMNS)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "That dish is no longer on the menu." };
      retranslate(ctx.merchantId);
      return { ok: true, item: mapItem(data as MenuItemRow) };
    }

    const { data, error } = await admin
      .from("menu_items")
      .insert({ ...patch, merchant_id: ctx.merchantId, source: "manual" })
      .select(ITEM_COLUMNS)
      .single();
    if (error) return { ok: false, error: error.message };
    retranslate(ctx.merchantId);
    return { ok: true, item: mapItem(data as MenuItemRow) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the dish.",
    };
  }
}

export async function deleteMenuItem(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu." };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("menu_items")
      .delete()
      .eq("id", input.id)
      .eq("merchant_id", ctx.merchantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not remove the dish.",
    };
  }
}

/** Flip a dish between "on the menu" and "sold out" without deleting it. */
export async function setMenuItemAvailability(input: {
  id: string;
  isAvailable: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { error } = await admin
      .from("menu_items")
      .update({ is_available: input.isAvailable })
      .eq("id", input.id)
      .eq("merchant_id", ctx.merchantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the dish.",
    };
  }
}

/**
 * Publish or shelve many dishes at once. Drafts stay merchant-only; live dishes
 * show to guests (and come back as available).
 */
export async function setMenuItemsStatus(input: {
  ids: string[];
  status: MenuItemStatus;
}): Promise<{ ok: boolean; error?: string; updated?: number }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu." };
    }

    const ids = [...new Set((input.ids ?? []).filter(Boolean))];
    if (ids.length === 0) return { ok: false, error: "Pick at least one dish." };

    const status: MenuItemStatus = input.status === "draft" ? "draft" : "live";
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("menu_items")
      .update({
        status,
        is_available: status === "live",
      })
      .in("id", ids)
      .eq("merchant_id", ctx.merchantId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    // Publishing exposes text that was skipped while it was a draft.
    if (status === "live") retranslate(ctx.merchantId);
    return { ok: true, updated: data?.length ?? 0 };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update those dishes.",
    };
  }
}

/** AI-written cook method + ingredients, cook time, heat, calories, and allergen tags. Costs 1 AI Generation. */
export async function aiDescribeDish(input: {
  name: string;
  section?: string;
  existing?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  description?: string;
  prepMinutes?: number | null;
  spiceLevel?: number | null;
  calories?: number | null;
  allergens?: Allergen[];
  creditsCost?: number;
  creditsRemaining?: number;
}> {
  const creditsCost = AI_GEN_CREDITS.description;
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, creditsCost };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu.", creditsCost };
    }
    const name = (input.name ?? "").trim();
    if (!name) return { ok: false, error: "Give the dish a name first.", creditsCost };

    const capacity = await checkAiGenerationCapacity(ctx.merchantId, creditsCost);
    if (!capacity.ok) {
      return {
        ok: false,
        error: capacity.error,
        creditsCost,
        creditsRemaining: capacity.remaining ?? 0,
      };
    }

    const enrichment = await generateDishDescription({
      name,
      section: input.section,
      existing: input.existing,
    });
    if (!enrichment.description) {
      return {
        ok: false,
        error: "Couldn't write a description. Try again.",
        creditsCost,
      };
    }

    await recordAiGeneration(ctx.merchantId, "description", name);
    const usage = await loadMenuUsage(ctx.merchantId);
    return {
      ok: true,
      description: enrichment.description,
      prepMinutes: enrichment.prepMinutes,
      spiceLevel: enrichment.spiceLevel,
      calories: enrichment.calories,
      allergens: enrichment.allergens,
      creditsCost,
      creditsRemaining: Math.max(0, usage.maxGenerations - usage.generations),
    };
  } catch (error) {
    if (error instanceof AiError) {
      return { ok: false, error: error.message, creditsCost };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not write a description.",
      creditsCost,
    };
  }
}

/** AI food photo for a dish card — returns a data URL the client can preview. Costs 1 AI Generation. */
export async function aiDishThumbnail(input: {
  name: string;
  description?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  imageUrl?: string;
  creditsCost?: number;
  creditsRemaining?: number;
}> {
  const creditsCost = AI_GEN_CREDITS.image;
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, creditsCost };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit the menu.", creditsCost };
    }
    const name = (input.name ?? "").trim();
    if (!name) return { ok: false, error: "Give the dish a name first.", creditsCost };

    const capacity = await checkAiGenerationCapacity(ctx.merchantId, creditsCost);
    if (!capacity.ok) {
      return {
        ok: false,
        error: capacity.error,
        creditsCost,
        creditsRemaining: capacity.remaining ?? 0,
      };
    }

    const image = await generateDishThumbnail({
      name,
      description: input.description,
    });
    // Already JPEG-compressed server-side; still guard the save ceiling.
    if (image.dataUrl.length > MENU_IMAGE_MAX_CHARS) {
      return {
        ok: false,
        error: "That image came back too large. Try uploading a photo instead.",
        creditsCost,
      };
    }

    await recordAiGeneration(ctx.merchantId, "image", name);
    const usage = await loadMenuUsage(ctx.merchantId);
    return {
      ok: true,
      imageUrl: image.dataUrl,
      creditsCost,
      creditsRemaining: Math.max(0, usage.maxGenerations - usage.generations),
    };
  } catch (error) {
    if (error instanceof AiError) {
      return { ok: false, error: error.message, creditsCost };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not generate a photo.",
      creditsCost,
    };
  }
}

/** A busy menu writes an event per tap, so the range query needs a ceiling. */
const MENU_EVENT_SCAN_LIMIT = 20000;

/**
 * Guest activity + AI spend for the analytics tab.
 *
 * Reads through the admin client after checking the caller's role, the same
 * shape the queue and reservation panels use. Both tables are append-only, so
 * this pulls the range's rows and rolls them up in memory rather than adding
 * per-panel aggregate RPCs.
 */
export async function getMenuAnalytics(input?: {
  range?: DashboardDateRange;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  analytics?: MenuAnalytics;
  /** True when the range hit the scan ceiling, so the numbers are a floor. */
  truncated?: boolean;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canViewAnalytics(ctx.role)) {
      return { ok: false, error: "You do not have access to analytics." };
    }

    const range = input?.range ?? "7d";
    const start = dashboardRangeStart(range);
    const admin = createAdminClient();

    let events = admin
      .from("menu_events")
      .select("event, item_name, lang, session_key, created_at")
      .eq("merchant_id", ctx.merchantId)
      .order("created_at", { ascending: false })
      .limit(MENU_EVENT_SCAN_LIMIT);
    // `null` start means "all time" for the shared range picker.
    if (start) events = events.gte("created_at", start.toISOString());
    if (input?.branchId) events = events.eq("branch_id", input.branchId);

    // ai_usage is billed per merchant and carries no branch, so a branch-scoped
    // view shows that merchant's whole AI spend rather than dropping the panel.
    let usage = admin
      .from("ai_usage")
      .select("feature, kind, total_tokens, created_at")
      .eq("merchant_id", ctx.merchantId)
      .order("created_at", { ascending: false })
      .limit(MENU_EVENT_SCAN_LIMIT);
    if (start) usage = usage.gte("created_at", start.toISOString());

    // menu_orders is deliberately not read here. The guest menu has no
    // send-to-kitchen step, so those rows predate the current product and
    // ranking dishes by them would report sales this menu never made.
    const [eventRes, usageRes] = await Promise.all([events, usage]);
    if (eventRes.error) return { ok: false, error: eventRes.error.message };
    if (usageRes.error) return { ok: false, error: usageRes.error.message };

    return {
      ok: true,
      truncated: (eventRes.data ?? []).length >= MENU_EVENT_SCAN_LIMIT,
      analytics: computeMenuAnalytics({
        range,
        events: (eventRes.data ?? []) as MenuEventRow[],
        usage: (usageRes.data ?? []) as AiUsageRow[],
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load analytics.",
    };
  }
}

/** Credit the wallet after a verified Razorpay AI Credit pack payment. */
export async function applyPurchasedAiCreditPack(input: {
  packId: string;
  paymentId: string;
}): Promise<{ ok: boolean; credits?: number; available?: number; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role !== "owner") {
      return { ok: false, error: "Only the owner can buy AI Credits." };
    }
    const { getAiCreditPack } = await import("@/lib/ai/credits-config");
    const pack = getAiCreditPack(input.packId);
    if (!pack) return { ok: false, error: "Unknown credit pack." };

    const { addPurchasedAiCredits } = await import("@/lib/ai/credits");
    const balance = await addPurchasedAiCredits({
      merchantId: ctx.merchantId,
      credits: pack.credits,
      packId: pack.id,
      paymentId: input.paymentId,
    });
    return {
      ok: true,
      credits: pack.credits,
      available: balance.available,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not apply credits.",
    };
  }
}
