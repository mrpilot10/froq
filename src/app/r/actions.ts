"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";
import { ensureGuestCustomer } from "@/lib/merchant/guest-customer";
import { formatTimeForInput, normalizeTimeInput } from "@/lib/merchant/queue-hours";
import {
  addDays,
  buildReservationSlots,
  hasOpenSuggestion,
  isOpenReservation,
  reservationSettingsFromProfile,
  reservationToday,
  type Reservation,
  type ReservationStatus,
} from "@/lib/merchant/reservations";
import { checkReservationCapacity } from "@/lib/reservations/capacity";
import { recordReservationEvent } from "@/lib/reservations/events";
import { isReservationPublicToken } from "@/lib/reservations/link";
import { RESERVATION_COLUMNS, toReservation } from "@/lib/reservations/mappers";
import {
  resolveReservationTarget,
  sendReservationNotification,
} from "@/lib/reservations/notify";

export interface ReservationPageMerchant {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  description: string;
  maxPartySize: number;
  allowNotes: boolean;
  allowSameDay: boolean;
  /** Bookable HH:MM slots from the merchant's opening hours + interval. */
  slots: string[];
  /** Earliest bookable date (today, or tomorrow when same-day is off). */
  minDate: string;
  /** Requests are accepted up to 60 days out. */
  maxDate: string;
  /** Restaurant has stopped taking online requests. */
  paused: boolean;
}

/** A guest's own booking, as shown on their reservation page. */
export interface PublicReservation {
  token: string;
  number: number;
  status: ReservationStatus;
  date: string;
  time: string;
  partySize: number;
  name: string;
  notes: string;
  declineReason: string;
  /** Slot the restaurant proposed — the guest accepts or declines it. */
  suggestedDate: string | null;
  suggestedTime: string | null;
  createdAtMs: number;
  confirmedAtMs: number | null;
  suggestedAtMs: number | null;
  suggestionAcceptedAtMs: number | null;
  declinedAtMs: number | null;
  cancelledAtMs: number | null;
  completedAtMs: number | null;
  noShowAtMs: number | null;
  reminderSentAtMs: number | null;
  cancelledBy: "merchant" | "customer" | null;
  merchant: {
    slug: string;
    businessName: string;
    brandColor: string;
    logoUrl: string | null;
  };
}

const REQUEST_WINDOW_DAYS = 60;

const PUBLIC_RESERVATION_COLUMNS = `${RESERVATION_COLUMNS}, merchant_id`;

/** Merchant branding for the reservation page header. */
async function loadMerchantBrand(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
): Promise<PublicReservation["merchant"] | null> {
  const { data } = await admin
    .from("merchants")
    .select("slug, business_name, brand_color, logo_url")
    .eq("id", merchantId)
    .maybeSingle();
  if (!data?.slug) return null;
  return {
    slug: data.slug,
    businessName: data.business_name,
    brandColor: data.brand_color,
    logoUrl: data.logo_url,
  };
}

function toPublicReservation(
  reservation: Reservation,
  merchant: PublicReservation["merchant"],
): PublicReservation {
  return {
    token: reservation.publicToken,
    number: reservation.number,
    status: reservation.status,
    date: reservation.date,
    time: reservation.time,
    partySize: reservation.partySize,
    name: reservation.customerName,
    notes: reservation.notes,
    declineReason: reservation.declineReason,
    suggestedDate: hasOpenSuggestion(reservation) ? reservation.suggestedDate : null,
    suggestedTime: hasOpenSuggestion(reservation) ? reservation.suggestedTime : null,
    createdAtMs: reservation.createdAtMs,
    confirmedAtMs: reservation.confirmedAtMs,
    suggestedAtMs: reservation.suggestedAtMs,
    suggestionAcceptedAtMs: reservation.suggestionAcceptedAtMs,
    declinedAtMs: reservation.declinedAtMs,
    cancelledAtMs: reservation.cancelledAtMs,
    completedAtMs: reservation.completedAtMs,
    noShowAtMs: reservation.noShowAtMs,
    reminderSentAtMs: reservation.reminderSentAtMs,
    cancelledBy: reservation.cancelledBy,
    merchant,
  };
}

/**
 * Load a booking by its own public token. This is the guest's page — no login,
 * the unguessable `rsv_…` token is the credential, same as the loyalty hub.
 */
async function readReservationByToken(
  token: string,
): Promise<
  | { ok: true; reservation: Reservation; merchantId: string; merchant: PublicReservation["merchant"] }
  | { ok: false; error: string }
> {
  if (!isReservationPublicToken(token)) {
    return { ok: false, error: "Reservation not found." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("reservations")
    .select(PUBLIC_RESERVATION_COLUMNS)
    .eq("public_token", token.trim())
    .maybeSingle();
  if (!row) return { ok: false, error: "Reservation not found." };

  const merchant = await loadMerchantBrand(admin, row.merchant_id);
  if (!merchant) return { ok: false, error: "Reservation not found." };

  return {
    ok: true,
    reservation: toReservation(row),
    merchantId: row.merchant_id,
    merchant,
  };
}

/** The guest's reservation page. */
export async function getPublicReservation(
  token: string,
): Promise<{ ok: boolean; error?: string; reservation?: PublicReservation }> {
  try {
    const found = await readReservationByToken(token);
    if (!found.ok) return { ok: false, error: found.error };
    return {
      ok: true,
      reservation: toPublicReservation(found.reservation, found.merchant),
    };
  } catch {
    return { ok: false, error: "Couldn't load your reservation." };
  }
}

/**
 * Guest accepts the restaurant's proposed slot: the proposal becomes the
 * booking and the table is confirmed.
 */
export async function acceptSuggestedTime(
  token: string,
): Promise<{ ok: boolean; error?: string; reservation?: PublicReservation }> {
  try {
    const found = await readReservationByToken(token);
    if (!found.ok) return { ok: false, error: found.error };
    if (!hasOpenSuggestion(found.reservation)) {
      return { ok: false, error: "There's no new time to accept." };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row, error } = await admin
      .from("reservations")
      .update({
        reservation_date: found.reservation.suggestedDate,
        reservation_time: found.reservation.suggestedTime,
        status: "confirmed",
        confirmed_at: nowIso,
        suggestion_accepted_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", found.reservation.id)
      .eq("status", "pending")
      .is("suggestion_accepted_at", null)
      .select(PUBLIC_RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: "Couldn't confirm the new time." };
    if (!row) {
      // Someone got there first — show whatever the booking looks like now.
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant),
      };
    }

    await recordReservationEvent({
      reservationId: found.reservation.id,
      merchantId: found.merchantId,
      event: "suggestion_accepted",
      actor: { kind: "guest" },
    });

    return {
      ok: true,
      reservation: toPublicReservation(toReservation(row), found.merchant),
    };
  } catch {
    return { ok: false, error: "Couldn't confirm the new time." };
  }
}

/**
 * Guest turns down the proposed slot, or cancels a table they no longer need.
 * Both end the same way: cancelled, by the customer. No message goes out — the
 * merchant sees it on the dashboard in realtime.
 */
export async function cancelPublicReservation(
  token: string,
): Promise<{ ok: boolean; error?: string; reservation?: PublicReservation }> {
  try {
    const found = await readReservationByToken(token);
    if (!found.ok) return { ok: false, error: found.error };
    if (!isOpenReservation(found.reservation.status)) {
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant),
      };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row, error } = await admin
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        cancelled_by: "customer",
        updated_at: nowIso,
      })
      .eq("id", found.reservation.id)
      .in("status", ["pending", "confirmed"])
      .select(PUBLIC_RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: "Couldn't cancel your reservation." };
    if (!row) {
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant),
      };
    }

    await recordReservationEvent({
      reservationId: found.reservation.id,
      merchantId: found.merchantId,
      event: "cancelled",
      actor: { kind: "guest" },
    });

    return {
      ok: true,
      reservation: toPublicReservation(toReservation(row), found.merchant),
    };
  } catch {
    return { ok: false, error: "Couldn't cancel your reservation." };
  }
}

export async function resolveReservationPage(
  slug: string,
): Promise<{ ok: true; merchant: ReservationPageMerchant } | { ok: false }> {
  try {
    const raw = slug.trim();
    if (!raw) return { ok: false };

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("merchants")
      .select(
        "slug, business_name, brand_color, logo_url, reservation_description, reservation_max_party_size, reservation_interval_minutes, reservation_open_time, reservation_close_time, reservation_allow_same_day, reservation_allow_notes, reservation_paused",
      )
      .eq("slug", raw)
      .maybeSingle();
    if (!row?.slug) return { ok: false };

    const settings = reservationSettingsFromProfile({
      reservationDescription: row.reservation_description ?? undefined,
      reservationMaxPartySize: row.reservation_max_party_size,
      reservationIntervalMinutes: row.reservation_interval_minutes,
      reservationOpenTime: formatTimeForInput(row.reservation_open_time),
      reservationCloseTime: formatTimeForInput(row.reservation_close_time),
      reservationAllowSameDay: row.reservation_allow_same_day,
      reservationAllowNotes: row.reservation_allow_notes,
    });

    const today = reservationToday();
    return {
      ok: true,
      merchant: {
        slug: row.slug,
        businessName: row.business_name,
        brandColor: row.brand_color,
        logoUrl: row.logo_url,
        description: settings.description,
        maxPartySize: settings.maxPartySize,
        allowNotes: settings.allowNotes,
        allowSameDay: settings.allowSameDay,
        slots: buildReservationSlots(settings),
        minDate: settings.allowSameDay ? today : addDays(today, 1),
        maxDate: addDays(today, REQUEST_WINDOW_DAYS),
        paused: row.reservation_paused === true,
      },
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Public QR / link request → pending reservation + reservation_request_received.
 * Returns the booking's own token so the guest lands on their reservation page.
 *
 * Anonymous, writes to the merchant's book and sends a WhatsApp message to the
 * supplied number, so it gets the same Cloudflare-side check as the queue join.
 */
export async function requestReservation(input: {
  slug: string;
  name: string;
  phone: string;
  partySize: number;
  date: string;
  time: string;
  notes?: string;
  captchaToken?: string;
}): Promise<{ ok: boolean; error?: string; token?: string }> {
  try {
    const slug = input.slug.trim();
    const name = input.name.trim();
    if (!slug) return { ok: false, error: "Invalid reservation link." };
    if (!name) return { ok: false, error: "Please enter your name." };

    const captcha = await verifyTurnstileToken(input.captchaToken);
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const resolved = await resolveReservationPage(slug);
    if (!resolved.ok) return { ok: false, error: "Restaurant not found." };
    const merchant = resolved.merchant;

    // Checked again here, not just in the UI: a stale tab could still post.
    if (merchant.paused) {
      return {
        ok: false,
        error: `${merchant.businessName} isn't taking online bookings right now.`,
      };
    }

    const time = normalizeTimeInput(input.time);
    if (!time || !merchant.slots.includes(time)) {
      return { ok: false, error: "Pick one of the available times." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: "Pick a date." };
    }
    if (input.date < merchant.minDate) {
      return {
        ok: false,
        error: merchant.allowSameDay
          ? "Pick a date that hasn't passed."
          : "Same-day bookings aren't available. Please pick a later date.",
      };
    }
    if (input.date > merchant.maxDate) {
      return { ok: false, error: "Please pick a date within the next 60 days." };
    }

    const partySize = Math.round(input.partySize);
    if (!Number.isFinite(partySize) || partySize < 1) {
      return { ok: false, error: "Select how many guests are coming." };
    }
    if (partySize > merchant.maxPartySize) {
      return {
        ok: false,
        error: `For parties over ${merchant.maxPartySize}, please call the restaurant.`,
      };
    }

    const admin = createAdminClient();
    const { data: merchantRow } = await admin
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!merchantRow?.id) return { ok: false, error: "Restaurant not found." };

    // Guests never see the merchant's billing state, just that it's closed.
    const capacity = await checkReservationCapacity(merchantRow.id);
    if (!capacity.ok) {
      return {
        ok: false,
        error: "This restaurant isn't taking online bookings right now.",
      };
    }

    const customer = await ensureGuestCustomer({
      merchantId: merchantRow.id,
      name,
      phone: input.phone,
    });
    if (!customer) return { ok: false, error: "Enter a valid 10-digit mobile number." };

    // One open request per guest per day — a double tap shouldn't create two.
    const { data: duplicate } = await admin
      .from("reservations")
      .select("public_token")
      .eq("merchant_id", merchantRow.id)
      .eq("customer_phone", customer.phone)
      .eq("reservation_date", input.date)
      .in("status", ["pending", "confirmed"])
      .limit(1)
      .maybeSingle();
    if (duplicate) return { ok: true, token: duplicate.public_token };

    const { data: row, error } = await admin
      .from("reservations")
      .insert({
        merchant_id: merchantRow.id,
        customer_id: customer.id,
        customer_name: name,
        customer_phone: customer.phone,
        customer_whatsapp: customer.phone,
        party_size: partySize,
        reservation_date: input.date,
        reservation_time: time,
        status: "pending",
        notes: merchant.allowNotes ? input.notes?.trim() || null : null,
      })
      .select("id, public_token")
      .single();

    if (error || !row) {
      console.error("requestReservation insert failed", error?.message);
      return { ok: false, error: "Couldn't send your request. Try again." };
    }

    await recordReservationEvent({
      reservationId: row.id,
      merchantId: merchantRow.id,
      event: "created",
      actor: { kind: "guest" },
      detail: "Requested from the booking page",
    });

    // Capture everything the send needs before returning.
    const target = await resolveReservationTarget({
      merchantId: merchantRow.id,
      customerId: customer.id,
    });
    after(async () => {
      await sendReservationNotification({
        target,
        template: "reservation_request_received",
        reservationToken: row.public_token,
        date: input.date,
        time,
        partySize,
      });
    });

    return { ok: true, token: row.public_token };
  } catch (error) {
    console.error("requestReservation exception", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't send your request.",
    };
  }
}

