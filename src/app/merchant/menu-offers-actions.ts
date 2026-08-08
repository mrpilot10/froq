"use server";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireMerchantContext } from "@/lib/merchant/server-context";
import { canEditMenu } from "@/lib/merchant/roles";
import { syncMenuTranslations } from "@/lib/menu/translate-store";
import {
  OFFER_MAX_COUNT,
  sanitizeOfferBadge,
  sanitizeOfferDetail,
  sanitizeOfferTitle,
  type MenuOffer,
} from "@/lib/menu/offers";
import type { MenuOfferRow } from "@/lib/supabase/database.types";

const OFFER_COLUMNS = "id, badge, title, detail, is_active, sort_order";

/** Offer copy shows on the guest sheet, so it is translated like dish text. */
function retranslate(merchantId: string): void {
  after(async () => {
    await syncMenuTranslations(merchantId).catch(() => 0);
  });
}

function mapOffer(row: Pick<MenuOfferRow, "id" | "badge" | "title" | "detail" | "is_active" | "sort_order">): MenuOffer {
  return {
    id: row.id,
    badge: row.badge,
    title: row.title,
    detail: row.detail ?? "",
    isActive: row.is_active !== false,
    sortOrder: row.sort_order,
  };
}

export type MenuOffersResult = {
  ok: boolean;
  error?: string;
  offers: MenuOffer[];
};

export async function fetchMenuOffers(): Promise<MenuOffersResult> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, offers: [] };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("menu_offers")
      .select(OFFER_COLUMNS)
      .eq("merchant_id", ctx.merchantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error: error.message, offers: [] };
    return { ok: true, offers: (data ?? []).map(mapOffer) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't load offers.",
      offers: [],
    };
  }
}

export type SaveMenuOfferInput = {
  id?: string | null;
  badge: string;
  title: string;
  detail: string;
  isActive?: boolean;
};

export type SaveMenuOfferResult = {
  ok: boolean;
  error?: string;
  offer?: MenuOffer;
};

export async function saveMenuOffer(
  input: SaveMenuOfferInput,
): Promise<SaveMenuOfferResult> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canEditMenu(ctx.role)) {
      return { ok: false, error: "Only owners and managers can edit offers." };
    }

    const badge = sanitizeOfferBadge(input.badge);
    const title = sanitizeOfferTitle(input.title);
    const detail = sanitizeOfferDetail(input.detail ?? "");
    if (!badge) return { ok: false, error: "Add a short badge (e.g. 20% OFF)." };
    if (!title) return { ok: false, error: "Add a title for this offer." };

    const admin = createAdminClient();
    const existingId = input.id?.trim() || null;

    if (existingId) {
      const { data, error } = await admin
        .from("menu_offers")
        .update({
          badge,
          title,
          detail,
          is_active: input.isActive !== false,
        })
        .eq("merchant_id", ctx.merchantId)
        .eq("id", existingId)
        .select(OFFER_COLUMNS)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Offer not found." };
      retranslate(ctx.merchantId);
      return { ok: true, offer: mapOffer(data) };
    }

    const { count, error: countError } = await admin
      .from("menu_offers")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", ctx.merchantId);
    if (countError) return { ok: false, error: countError.message };
    if ((count ?? 0) >= OFFER_MAX_COUNT) {
      return { ok: false, error: `You can add up to ${OFFER_MAX_COUNT} offers.` };
    }

    const { data: last } = await admin
      .from("menu_offers")
      .select("sort_order")
      .eq("merchant_id", ctx.merchantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("menu_offers")
      .insert({
        merchant_id: ctx.merchantId,
        badge,
        title,
        detail,
        is_active: input.isActive !== false,
        sort_order: (last?.sort_order ?? -1) + 1,
      })
      .select(OFFER_COLUMNS)
      .single();

    if (error) return { ok: false, error: error.message };
    retranslate(ctx.merchantId);
    return { ok: true, offer: mapOffer(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't save offer.",
    };
  }
}

export async function deleteMenuOffer(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canEditMenu(ctx.role)) {
      return { ok: false, error: "Only owners and managers can delete offers." };
    }

    const offerId = id.trim();
    if (!offerId) return { ok: false, error: "Missing offer." };

    const admin = createAdminClient();
    const { error } = await admin
      .from("menu_offers")
      .delete()
      .eq("merchant_id", ctx.merchantId)
      .eq("id", offerId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't delete offer.",
    };
  }
}
