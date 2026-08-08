import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MENU_PREVIEW } from "@/lib/merchant/feature-flags";

function aiMenuLog(event: string, fields: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "reservation_ai_menu",
      event,
      ...fields,
      at: new Date().toISOString(),
    }),
  );
}

/**
 * True when Reservation ↔ AI Menu should run for this merchant:
 * Settings toggle ON + AI Menu available (MENU_PREVIEW unlock, or an active
 * menu plan / unexpired trial).
 */
export async function isReservationAiMenuEnabled(
  merchantId: string,
): Promise<boolean> {
  if (!merchantId) return false;
  const admin = createAdminClient();

  const { data: merchant, error: merchantError } = await admin
    .from("merchants")
    .select("reservation_ai_menu_enabled")
    .eq("id", merchantId)
    .maybeSingle();
  if (merchantError) {
    aiMenuLog("merchant_lookup_failed", {
      merchantId,
      error: merchantError.message,
    });
    return false;
  }
  if (merchant?.reservation_ai_menu_enabled !== true) return false;

  if (MENU_PREVIEW) return true;

  const { data: product, error: productError } = await admin
    .from("merchant_products")
    .select("status, plan_id, trial_ends_at")
    .eq("merchant_id", merchantId)
    .eq("product", "menu")
    .maybeSingle();
  if (productError) {
    aiMenuLog("product_lookup_failed", {
      merchantId,
      error: productError.message,
    });
    return false;
  }
  if (!product || product.status !== "active") return false;
  if (!product.plan_id && product.trial_ends_at) {
    const ends = Date.parse(product.trial_ends_at);
    return Number.isFinite(ends) && ends > Date.now();
  }
  return true;
}

export type ReservationConfirmedNotifyTemplate =
  | "reservation_confirmed"
  | "reservation_confirmed_menu";

export async function reservationConfirmedNotifyTemplate(
  merchantId: string,
): Promise<ReservationConfirmedNotifyTemplate> {
  const enabled = await isReservationAiMenuEnabled(merchantId);
  const template: ReservationConfirmedNotifyTemplate = enabled
    ? "reservation_confirmed_menu"
    : "reservation_confirmed";
  aiMenuLog("confirmed_template", { merchantId, enabled, template });
  return template;
}
