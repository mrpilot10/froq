"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  entitlementsFromRows,
  isProductEnabled,
} from "@/lib/merchant/entitlements";
import {
  resolveGuestSocialLinks,
  type GuestSocialLinks,
} from "@/lib/merchant/guest-social-links";
import { fetchPlaceRating, type PlaceRating } from "@/lib/merchant/place-rating";
import { resolveJoinBranchId } from "@/lib/queue/live-board";
import type { MerchantProduct } from "@/lib/merchant/types";

/**
 * One QR, every guest-facing product. This resolves the landing page behind
 * `/b/{slug}`: who the business is, what Google thinks of it, and which of
 * Loyalty / Queue / Reservations / AI Menu the guest can actually open.
 */

const MERCHANT_SELECT =
  "id, slug, business_name, brand_color, logo_url, phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id";

const BRANCH_SELECT =
  "name, phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id";

type HubMerchantRow = {
  id: string;
  slug: string;
  business_name: string;
  brand_color: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_business_url: string | null;
  google_place_id: string | null;
};

type HubBranchRow = {
  name: string | null;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_business_url: string | null;
  google_place_id: string | null;
};

export type HubPageMerchant = {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  /** Named branch the guest scanned into, when it isn't the default one. */
  branchName?: string;
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  socialLinks: GuestSocialLinks;
  /** Null whenever Google has nothing to say — the header just drops the pill. */
  rating: PlaceRating | null;
  /** Products the guest can open, in display order. */
  products: MerchantProduct[];
  /** `?b=` passthrough, so every product link keeps the scanned branch. */
  branchSlug: string | null;
};

/** Order the bento grid reads in — the everyday actions first. */
const PRODUCT_ORDER: MerchantProduct[] = ["menu", "loyalty", "queue", "reservation"];

function pick(
  branchValue: string | null | undefined,
  merchantValue: string | null | undefined,
): string | undefined {
  return branchValue?.trim() || merchantValue?.trim() || undefined;
}

/**
 * An AI Menu with nothing on it is a dead end, so the tile only appears once
 * the merchant has a live dish. The other products handle their own empty
 * states (queue closed, bookings paused) on their own pages.
 */
async function menuHasLiveItems(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
): Promise<boolean> {
  const { count } = await admin
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("status", "live")
    .eq("is_available", true);
  return (count ?? 0) > 0;
}

/** Just the display name, for page metadata — the full resolve is too heavy for a title. */
export async function resolveHubName(slug: string): Promise<string | null> {
  try {
    const raw = slug.trim();
    if (!raw) return null;
    const { data } = await createAdminClient()
      .from("merchants")
      .select("business_name")
      .eq("slug", raw)
      .maybeSingle();
    return data?.business_name?.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveHubPage(
  slug: string,
  branchSlug?: string | null,
): Promise<{ ok: true; merchant: HubPageMerchant } | { ok: false }> {
  try {
    const raw = slug.trim();
    if (!raw) return { ok: false };

    const admin = createAdminClient();
    const { data: merchantData } = await admin
      .from("merchants")
      .select(MERCHANT_SELECT)
      .eq("slug", raw)
      .maybeSingle();
    if (!merchantData?.slug) return { ok: false };

    const row = merchantData as HubMerchantRow;
    const branchId = await resolveJoinBranchId(row.id, branchSlug);

    const [{ data: branchData }, { data: productRows }] = await Promise.all([
      branchId
        ? admin
            .from("branches")
            .select(BRANCH_SELECT)
            .eq("id", branchId)
            .eq("merchant_id", row.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("merchant_products")
        .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
        .eq("merchant_id", row.id),
    ]);

    const branch = (branchData as HubBranchRow | null) ?? null;
    const entitlements = entitlementsFromRows(productRows ?? []);

    const enabled = PRODUCT_ORDER.filter((product) =>
      isProductEnabled(entitlements, product),
    );
    const products = enabled.includes("menu")
      ? (await menuHasLiveItems(admin, row.id))
        ? enabled
        : enabled.filter((product) => product !== "menu")
      : enabled;

    const placeId = pick(branch?.google_place_id, row.google_place_id);
    // The default branch is just "the shop" to a guest — only name an outlet
    // they explicitly scanned into.
    const scannedBranch = branchSlug?.trim() ? branch?.name?.trim() : "";

    return {
      ok: true,
      merchant: {
        slug: row.slug,
        businessName: row.business_name,
        brandColor: row.brand_color,
        logoUrl: row.logo_url,
        branchName: scannedBranch || undefined,
        phone: pick(branch?.phone, row.phone),
        address: pick(branch?.address, row.address),
        googleMapsUrl: pick(branch?.google_maps_url, row.google_maps_url),
        socialLinks: resolveGuestSocialLinks(branch, row),
        rating: await fetchPlaceRating(placeId),
        products,
        branchSlug: branchSlug?.trim() || null,
      },
    };
  } catch {
    return { ok: false };
  }
}
