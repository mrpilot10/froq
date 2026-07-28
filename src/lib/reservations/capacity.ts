import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  entitlementsFromRows,
  isProductEnabled,
  isTrialActive,
} from "@/lib/merchant/entitlements";
import {
  RESERVATION_TRIAL_LIMITS,
  trialBookingLimitError,
} from "@/lib/merchant/plan-limits";

export type ReservationCapacityResult =
  | { ok: true }
  /** `error` is merchant-facing; guests get generic copy from the caller. */
  | { ok: false; reason: "locked" | "trial_limit"; error: string };

/**
 * Single gate for creating a reservation, shared by the public request form and
 * the merchant's own booking page, so neither side can walk past a cap the
 * other enforces.
 */
export async function checkReservationCapacity(
  merchantId: string,
): Promise<ReservationCapacityResult> {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("merchant_products")
    .select("product, plan_id, status, onboarded_at, trial_started_at, trial_ends_at")
    .eq("merchant_id", merchantId);

  const entitlements = entitlementsFromRows(rows ?? []);
  if (!isProductEnabled(entitlements, "reservation")) {
    return {
      ok: false,
      reason: "locked",
      error: "Reservations isn't active on your account.",
    };
  }

  const reservation = entitlements.reservation;
  if (!isTrialActive(reservation) || !reservation?.trialStartedAt) return { ok: true };

  const { count } = await admin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .gte("created_at", reservation.trialStartedAt);

  if ((count ?? 0) >= RESERVATION_TRIAL_LIMITS.maxBookingsPerTrial) {
    return { ok: false, reason: "trial_limit", error: trialBookingLimitError() };
  }

  return { ok: true };
}
