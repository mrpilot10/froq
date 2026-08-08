"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveGuestSocialLinks,
  type GuestSocialLinks,
} from "@/lib/merchant/guest-social-links";
import { resolveJoinBranchId } from "@/lib/queue/live-board";
import {
  isAllergen,
  isDietTag,
  type Allergen,
  type DietTag,
  type MenuCategory,
  type MenuItem,
} from "@/lib/menu/types";
import { readLanguage } from "@/lib/menu/languages";
import { translatedField } from "@/lib/menu/translations";
import {
  DEFAULT_MENU_TAX_RATES,
  normalizeMenuTaxRates,
  type MenuTaxRates,
} from "@/lib/menu/tax";
import { type PopularityCounts } from "@/lib/menu/guest-app/data";
import {
  sanitizeOfferBadge,
  sanitizeOfferDetail,
  sanitizeOfferTitle,
  type GuestMenuOffer,
} from "@/lib/menu/offers";
import {
  entitlementsFromRows,
  isProductEnabled,
} from "@/lib/merchant/entitlements";
import type { MenuCategoryRow, MenuItemRow } from "@/lib/supabase/database.types";

/**
 * Public AI Menu page. Guests land here from the QR / Open Menu link.
 * Only `live` + available dishes are returned — drafts stay merchant-only.
 */

const MERCHANT_SELECT =
  "id, slug, business_name, brand_color, logo_url, phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id, reward_title, reward_name, reward_image_url, total_stamps, queue_open_time, queue_close_time, menu_cgst_percent, menu_sgst_percent, menu_service_charge_percent, menu_show_loyalty_stamps";

const BRANCH_SELECT =
  "id, name, phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id, queue_open_time, queue_close_time";

const ITEM_COLUMNS =
  "id, category_id, name, description, price, image_url, diet, allergens, spice_level, prep_minutes, calories, is_available, status, source, sort_order, translations";

/** Loyalty Stamps promo for the offers sheet — null when the product is off. */
export type MenuLoyaltyPromo = {
  rewardTitle: string;
  rewardName: string;
  rewardImage: string;
  totalStamps: number;
  joinUrl: string;
};

export type MenuPageMerchant = {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  branchName?: string;
  socialLinks: GuestSocialLinks;
};

export type MenuPagePayload = {
  merchant: MenuPageMerchant;
  /**
   * Kept beside `merchant` rather than inside it so it cannot ride along into
   * the guest payload: server-side callers that query by tenant need it, the
   * browser never does.
   */
  merchantId: string;
  /** Branch the QR resolved to, for the same server-side-only reason. */
  branchId: string | null;
  categories: MenuCategory[];
  itemCount: number;
  /** Table number from `?t=` when the QR was table-scoped. */
  tableNumber: number | null;
  /** Units ordered in the past 3 hours — assistant popularity hints. */
  recentOrders: PopularityCounts;
  /** Store open / close times for the guest top bar (HH:MM). */
  openTime: string | null;
  closeTime: string | null;
  /** Loyalty Stamps reward tile when the merchant has that product. */
  loyalty: MenuLoyaltyPromo | null;
  /** Active table offers for the guest Offers sheet. */
  offers: GuestMenuOffer[];
  /** Tax and service charge this venue quotes on a cart. */
  tax: MenuTaxRates;
  /** Language this payload was rendered in — every name and description is in it. */
  lang: string;
  /**
   * Translated dish name back to the English the merchant typed. Orders travel
   * by name, and a kitchen ticket has to stay readable to the kitchen.
   */
  englishNames: Record<string, string>;
};

const EMPTY_POPULARITY: PopularityCounts = { byItemId: {}, byName: {} };

/** Tallies dish units from rounds in the past 3 hours for this branch. */
async function fetchRecentDishCounts(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  branchId: string | null,
  windowMs = 3 * 60 * 60 * 1000,
): Promise<PopularityCounts> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data: orders } = await admin
    .from("menu_orders")
    .select("id, session_id")
    .eq("merchant_id", merchantId)
    .gte("placed_at", since)
    .neq("status", "cancelled")
    .limit(400);
  if (!orders?.length) return EMPTY_POPULARITY;

  let orderIds = orders.map((row) => row.id as string);
  if (branchId) {
    const sessionIds = [...new Set(orders.map((row) => row.session_id as string))];
    const { data: sessions } = await admin
      .from("menu_dining_sessions")
      .select("id")
      .eq("branch_id", branchId)
      .in("id", sessionIds);
    const allowed = new Set((sessions ?? []).map((row) => row.id as string));
    orderIds = orders
      .filter((row) => allowed.has(row.session_id as string))
      .map((row) => row.id as string);
  }
  if (!orderIds.length) return EMPTY_POPULARITY;

  const { data: lines } = await admin
    .from("menu_order_items")
    .select("menu_item_id, name, quantity")
    .in("order_id", orderIds);
  if (!lines?.length) return EMPTY_POPULARITY;

  const byItemId: Record<string, number> = {};
  const byName: Record<string, number> = {};
  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    if (!qty) continue;
    if (line.menu_item_id) {
      byItemId[line.menu_item_id] = (byItemId[line.menu_item_id] ?? 0) + qty;
    }
    const name = typeof line.name === "string" ? line.name.trim() : "";
    if (name) byName[name] = (byName[name] ?? 0) + qty;
  }
  return { byItemId, byName };
}

function mapItem(row: Pick<MenuItemRow, keyof MenuItemRow & string>): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? "",
    price: row.price == null ? null : Number(row.price),
    imageUrl: row.image_url ?? null,
    diet: (row.diet ?? []).filter(isDietTag) as DietTag[],
    allergens: (row.allergens ?? []).filter(isAllergen) as Allergen[],
    spiceLevel: row.spice_level,
    prepMinutes: row.prep_minutes,
    calories: row.calories ?? null,
    isAvailable: row.is_available,
    status: row.status === "draft" ? "draft" : "live",
    source: row.source === "ai" ? "ai" : "manual",
    sortOrder: row.sort_order,
  };
}

function pick(
  branchValue: string | null | undefined,
  merchantValue: string | null | undefined,
) {
  return branchValue?.trim() || merchantValue?.trim() || undefined;
}

function parseTableNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 1 || n > 999) return null;
  return Math.round(n);
}

export async function resolveMenuPage(
  slug: string,
  branchSlug?: string | null,
  tableParam?: string | null,
  langParam?: string | null,
): Promise<{ ok: true; page: MenuPagePayload } | { ok: false }> {
  try {
    const raw = slug.trim();
    if (!raw) return { ok: false };
    const lang = readLanguage(langParam);

    const admin = createAdminClient();
    const { data: merchantRow } = await admin
      .from("merchants")
      .select(MERCHANT_SELECT)
      .eq("slug", raw)
      .maybeSingle();
    if (!merchantRow?.slug) return { ok: false };

    const branchId = await resolveJoinBranchId(merchantRow.id, branchSlug);
    const { data: branchRow } = branchId
      ? await admin
          .from("branches")
          .select(BRANCH_SELECT)
          .eq("id", branchId)
          .eq("merchant_id", merchantRow.id)
          .maybeSingle()
      : { data: null };

    // Guests only see published, in-stock dishes — drafts and sold-outs stay off.
    const [
      { data: categoryRows },
      { data: itemRows },
      recentOrders,
      { data: productRows },
      { data: offerRows },
    ] = await Promise.all([
      admin
        .from("menu_categories")
        .select("id, name, sort_order, translations")
        .eq("merchant_id", merchantRow.id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      admin
        .from("menu_items")
        .select(ITEM_COLUMNS)
        .eq("merchant_id", merchantRow.id)
        .eq("status", "live")
        .eq("is_available", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      fetchRecentDishCounts(admin, merchantRow.id, branchId),
      admin
        .from("merchant_products")
        .select(
          "product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at",
        )
        .eq("merchant_id", merchantRow.id),
      admin
        .from("menu_offers")
        .select("badge, title, detail, sort_order, translations")
        .eq("merchant_id", merchantRow.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const tableNumber = parseTableNumber(tableParam);

    // Dishes are keyed by name everywhere downstream — photos, diet, the cart,
    // the assistant's recommendations. Swapping the name here rather than at
    // render time keeps all of those consistent in one move; `englishNames`
    // carries the original back for anything the kitchen has to read.
    const englishNames: Record<string, string> = {};
    const items = (itemRows ?? []).map((row) => {
      const mapped = mapItem(row as MenuItemRow);
      const translations = (row as MenuItemRow).translations;
      const name = translatedField(translations, lang, "name", mapped.name);
      const description = translatedField(
        translations,
        lang,
        "description",
        mapped.description ?? "",
      );
      if (name !== mapped.name) englishNames[name] = mapped.name;
      const translated = { ...mapped, name, description };
      // Data-URL photos are served from /api/menu/photo/[id] so the page HTML
      // stays lean. Hosted https URLs pass through as-is.
      if (translated.imageUrl?.startsWith("data:")) {
        return { ...translated, imageUrl: `/api/menu/photo/${translated.id}` };
      }
      return translated;
    });
    const byCategory = new Map<string, MenuItem[]>();
    for (const item of items) {
      const list = byCategory.get(item.categoryId);
      if (list) list.push(item);
      else byCategory.set(item.categoryId, [item]);
    }

    // Drop empty sections so guests don't scroll past "Starters" with nothing in it.
    const categories = (categoryRows ?? [])
      .map((row) => {
        const category = row as Pick<
          MenuCategoryRow,
          "id" | "name" | "sort_order" | "translations"
        >;
        return {
          id: category.id,
          name: translatedField(category.translations, lang, "name", category.name),
          sortOrder: category.sort_order,
          items: byCategory.get(category.id) ?? [],
        };
      })
      .filter((category) => category.items.length > 0);

    const entitlements = entitlementsFromRows(productRows ?? []);
    const hasLoyalty = isProductEnabled(entitlements, "loyalty");
    const showLoyaltyStamps = merchantRow.menu_show_loyalty_stamps !== false;
    const rewardImageRaw =
      typeof merchantRow.reward_image_url === "string"
        ? merchantRow.reward_image_url.trim()
        : "";
    // Skip data-URL thumbs in the menu payload — they bloat the HTML. Public
    // paths / hosted URLs pass through; otherwise use the default stamp art.
    const rewardImage =
      rewardImageRaw && !rewardImageRaw.startsWith("data:")
        ? rewardImageRaw
        : "/reward-coffee.png";
    const joinQs = branchSlug?.trim()
      ? `?b=${encodeURIComponent(branchSlug.trim())}`
      : "";
    const loyalty: MenuLoyaltyPromo | null =
      hasLoyalty && showLoyaltyStamps
        ? {
            rewardTitle:
              (merchantRow.reward_title as string | null)?.trim() || "Loyalty stamps",
            rewardName:
              (merchantRow.reward_name as string | null)?.trim() || "Free reward",
            rewardImage,
            totalStamps: Math.min(
              20,
              Math.max(5, Math.floor(Number(merchantRow.total_stamps) || 5)),
            ),
            joinUrl: `/join/${encodeURIComponent(merchantRow.slug)}${joinQs}`,
          }
        : null;

    const openTime =
      pick(branchRow?.queue_open_time, merchantRow.queue_open_time) ?? null;
    const closeTime =
      pick(branchRow?.queue_close_time, merchantRow.queue_close_time) ?? null;

    const offers: GuestMenuOffer[] = (offerRows ?? [])
      .map((row) => {
        const t = (row as { translations?: unknown }).translations;
        const badge = sanitizeOfferBadge(
          translatedField(t, lang, "badge", row.badge ?? ""),
        );
        const title = sanitizeOfferTitle(
          translatedField(t, lang, "title", row.title ?? ""),
        );
        const detail = sanitizeOfferDetail(
          translatedField(t, lang, "detail", row.detail ?? ""),
        );
        if (!badge || !title) return null;
        return { badge, title, detail };
      })
      .filter((offer): offer is GuestMenuOffer => offer != null);

    const page: MenuPagePayload = {
      merchant: {
        slug: merchantRow.slug,
        businessName: merchantRow.business_name,
        brandColor: merchantRow.brand_color,
        logoUrl: merchantRow.logo_url,
        phone: pick(branchRow?.phone, merchantRow.phone),
        address: pick(branchRow?.address, merchantRow.address) ?? "",
        googleMapsUrl: pick(branchRow?.google_maps_url, merchantRow.google_maps_url),
        branchName: branchRow?.name?.trim() || undefined,
        socialLinks: resolveGuestSocialLinks(branchRow, merchantRow),
      },
      merchantId: merchantRow.id,
      branchId,
      categories,
      itemCount: items.length,
      tableNumber,
      openTime,
      closeTime,
      recentOrders,
      loyalty,
      offers,
      // Rates are merchant-wide: a branch bills the same GST as its parent.
      tax: normalizeMenuTaxRates({
        cgstPercent: merchantRow.menu_cgst_percent ?? DEFAULT_MENU_TAX_RATES.cgstPercent,
        sgstPercent: merchantRow.menu_sgst_percent ?? DEFAULT_MENU_TAX_RATES.sgstPercent,
        serviceChargePercent:
          merchantRow.menu_service_charge_percent ??
          DEFAULT_MENU_TAX_RATES.serviceChargePercent,
      }),
      lang,
      englishNames,
    };

    return { ok: true, page };
  } catch {
    return { ok: false };
  }
}
