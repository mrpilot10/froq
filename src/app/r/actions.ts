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
  resolveGuestSocialLinks,
  type GuestSocialLinks,
} from "@/lib/merchant/guest-social-links";
import {
  resolveReservationTarget,
  sendReservationNotification,
} from "@/lib/reservations/notify";
import { resolveJoinBranchId } from "@/lib/queue/live-board";
import {
  ensureHeldQueueEntryForReservation,
  releaseQueueHoldForReservation,
} from "@/lib/queue/reservation-holds";

export interface ReservationPageMerchant {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  socialLinks: GuestSocialLinks;
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
  /** Branch from `?b=` — stamped onto new requests so the merchant board sees them. */
  branchSlug?: string | null;
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
  /** Assigned table when the restaurant has one. */
  tableNumber: number | null;
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
  merchant: ReservationMerchantBrand;
  /**
   * Reservation ↔ AI Menu — show "View our AI menu" once the booking is
   * confirmed (and later successful states).
   */
  aiMenuEnabled: boolean;
  /** Customer hub / menu token (`frq_…`) for `/m/{{token}}`. */
  customerPublicToken: string | null;
}

/** Branding + contact chrome shared by the request and status pages. */
export interface ReservationMerchantBrand {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  socialLinks: GuestSocialLinks;
}

const REQUEST_WINDOW_DAYS = 60;

const PUBLIC_RESERVATION_COLUMNS = `${RESERVATION_COLUMNS}, merchant_id`;

const RESERVATION_CONTACT_SELECT =
  "phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id, queue_open_time, queue_close_time";

function preferBranch(
  branchValue: string | null | undefined,
  merchantValue: string | null | undefined,
): string | undefined {
  return branchValue?.trim() || merchantValue?.trim() || undefined;
}

/**
 * Contact details for the branch that holds the booking, falling back to the
 * merchant default — the same precedence the queue guest page uses.
 */
async function loadBranchContact(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  branchId?: string | null,
) {
  if (branchId) {
    const { data } = await admin
      .from("branches")
      .select(RESERVATION_CONTACT_SELECT)
      .eq("id", branchId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await admin
    .from("branches")
    .select(RESERVATION_CONTACT_SELECT)
    .eq("merchant_id", merchantId)
    .eq("is_default", true)
    .maybeSingle();
  return data ?? null;
}

/** Merchant branding + contact chrome for the reservation page header. */
async function loadMerchantBrand(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  branchId?: string | null,
): Promise<ReservationMerchantBrand | null> {
  const { data } = await admin
    .from("merchants")
    .select(`slug, business_name, brand_color, logo_url, ${RESERVATION_CONTACT_SELECT}`)
    .eq("id", merchantId)
    .maybeSingle();
  if (!data?.slug) return null;

  const branch = await loadBranchContact(admin, merchantId, branchId);

  return {
    slug: data.slug,
    businessName: data.business_name,
    brandColor: data.brand_color,
    logoUrl: data.logo_url,
    phone: preferBranch(branch?.phone, data.phone),
    address: preferBranch(branch?.address, data.address),
    googleMapsUrl: preferBranch(branch?.google_maps_url, data.google_maps_url),
    socialLinks: resolveGuestSocialLinks(branch, data),
  };
}

function toPublicReservation(
  reservation: Reservation,
  merchant: PublicReservation["merchant"],
  extras?: {
    aiMenuEnabled?: boolean;
    customerPublicToken?: string | null;
  },
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
    tableNumber: reservation.tableNumber,
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
    aiMenuEnabled: extras?.aiMenuEnabled === true,
    customerPublicToken: extras?.customerPublicToken ?? null,
  };
}

function publicExtrasFromFound(found: {
  aiMenuEnabled: boolean;
  customerPublicToken: string | null;
}) {
  return {
    aiMenuEnabled: found.aiMenuEnabled,
    customerPublicToken: found.customerPublicToken,
  };
}

async function loadReservationAiMenuExtras(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  customerId: string | null,
): Promise<{ aiMenuEnabled: boolean; customerPublicToken: string | null }> {
  const { isReservationAiMenuEnabled } = await import(
    "@/lib/reservations/ai-menu"
  );
  const [aiMenuEnabled, customerRes] = await Promise.all([
    isReservationAiMenuEnabled(merchantId),
    customerId
      ? admin
          .from("customers")
          .select("public_token")
          .eq("id", customerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    aiMenuEnabled,
    customerPublicToken: customerRes.data?.public_token ?? null,
  };
}

/**
 * Load a booking by its own public token. This is the guest's page — no login,
 * the unguessable `rsv_…` token is the credential, same as the loyalty hub.
 */
async function readReservationByToken(
  token: string,
): Promise<
  | {
      ok: true;
      reservation: Reservation;
      merchantId: string;
      merchant: PublicReservation["merchant"];
      aiMenuEnabled: boolean;
      customerPublicToken: string | null;
    }
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

  const merchant = await loadMerchantBrand(admin, row.merchant_id, row.branch_id);
  if (!merchant) return { ok: false, error: "Reservation not found." };

  const extras = await loadReservationAiMenuExtras(
    admin,
    row.merchant_id,
    row.customer_id ?? null,
  );

  return {
    ok: true,
    reservation: toReservation(row),
    merchantId: row.merchant_id,
    merchant,
    aiMenuEnabled: extras.aiMenuEnabled,
    customerPublicToken: extras.customerPublicToken,
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
      reservation: toPublicReservation(
        found.reservation,
        found.merchant,
        publicExtrasFromFound(found),
      ),
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
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
      };
    }

    await recordReservationEvent({
      reservationId: found.reservation.id,
      merchantId: found.merchantId,
      event: "suggestion_accepted",
      actor: { kind: "guest" },
    });

    await ensureHeldQueueEntryForReservation({
      ...row,
      merchant_id: found.merchantId,
    });

    return {
      ok: true,
      reservation: toPublicReservation(toReservation(row), found.merchant, publicExtrasFromFound(found)),
    };
  } catch {
    return { ok: false, error: "Couldn't confirm the new time." };
  }
}

/**
 * Guest changes their own booking in place — same reservation number and
 * token, new slot. Does not cancel. Confirmed stays confirmed; pending stays
 * pending. Any merchant proposal in flight is withdrawn.
 */
export async function updatePublicReservation(input: {
  token: string;
  date: string;
  time: string;
  partySize: number;
}): Promise<{ ok: boolean; error?: string; reservation?: PublicReservation }> {
  try {
    const found = await readReservationByToken(input.token);
    if (!found.ok) return { ok: false, error: found.error };
    if (!isOpenReservation(found.reservation.status)) {
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
      };
    }

    const page = await resolveReservationPage(found.merchant.slug);
    if (!page.ok) return { ok: false, error: "Couldn't load available times." };
    const merchant = page.merchant;
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
        error: `Up to ${merchant.maxPartySize} guests online — please call the restaurant for more.`,
      };
    }

    const sameSlot =
      found.reservation.date === input.date &&
      found.reservation.time === time &&
      found.reservation.partySize === partySize &&
      !hasOpenSuggestion(found.reservation);
    if (sameSlot) {
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
      };
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: row, error } = await admin
      .from("reservations")
      .update({
        reservation_date: input.date,
        reservation_time: time,
        party_size: partySize,
        // Guest took a new slot — any merchant proposal is moot.
        suggested_at: null,
        suggested_date: null,
        suggested_time: null,
        suggestion_accepted_at: null,
        // Reminders track the previous slot; reset so the new one gets them.
        reminder_24h_sent_at: null,
        reminder_2h_sent_at: null,
        reminder_30m_sent_at: null,
        updated_at: nowIso,
      })
      .eq("id", found.reservation.id)
      .in("status", ["pending", "confirmed"])
      .select(PUBLIC_RESERVATION_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, error: "Couldn't update your reservation." };
    if (!row) {
      return {
        ok: true,
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
      };
    }

    const updated = toReservation(row);
    await recordReservationEvent({
      reservationId: updated.id,
      merchantId: found.merchantId,
      event: "rescheduled",
      actor: { kind: "guest" },
      detail: `${input.date} at ${time}, ${partySize} guest${partySize === 1 ? "" : "s"}`,
    });

    // Drop the old hold, then recreate if this booking is still confirmed today.
    await releaseQueueHoldForReservation(updated.id, "rescheduled");
    if (updated.status === "confirmed") {
      await ensureHeldQueueEntryForReservation({
        ...row,
        merchant_id: found.merchantId,
      });
    }

    return {
      ok: true,
      reservation: toPublicReservation(updated, found.merchant, publicExtrasFromFound(found)),
    };
  } catch {
    return { ok: false, error: "Couldn't update your reservation." };
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
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
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
        reservation: toPublicReservation(found.reservation, found.merchant, publicExtrasFromFound(found)),
      };
    }

    await recordReservationEvent({
      reservationId: found.reservation.id,
      merchantId: found.merchantId,
      event: "cancelled",
      actor: { kind: "guest" },
    });

    await releaseQueueHoldForReservation(found.reservation.id, "cancelled");

    return {
      ok: true,
      reservation: toPublicReservation(toReservation(row), found.merchant, publicExtrasFromFound(found)),
    };
  } catch {
    return { ok: false, error: "Couldn't cancel your reservation." };
  }
}

export async function resolveReservationPage(
  slug: string,
  branchSlug?: string | null,
): Promise<{ ok: true; merchant: ReservationPageMerchant } | { ok: false }> {
  try {
    const raw = slug.trim();
    if (!raw) return { ok: false };

    const admin = createAdminClient();
    const { data: row } = await admin
      .from("merchants")
      .select(
        `id, slug, business_name, brand_color, logo_url, reservation_description, reservation_max_party_size, reservation_interval_minutes, reservation_open_time, reservation_close_time, reservation_allow_same_day, reservation_allow_notes, reservation_paused, ${RESERVATION_CONTACT_SELECT}`,
      )
      .eq("slug", raw)
      .maybeSingle();
    if (!row?.slug) return { ok: false };

    const branchId = await resolveJoinBranchId(row.id, branchSlug);
    const branch = await loadBranchContact(admin, row.id, branchId);

    const settings = reservationSettingsFromProfile({
      reservationDescription: row.reservation_description ?? undefined,
      reservationMaxPartySize: row.reservation_max_party_size,
      reservationIntervalMinutes: row.reservation_interval_minutes,
      // Prefer branch store timings; merchant reservation_* is a legacy mirror.
      queueOpenTime: branch?.queue_open_time
        ? formatTimeForInput(branch.queue_open_time)
        : undefined,
      queueCloseTime: branch?.queue_close_time
        ? formatTimeForInput(branch.queue_close_time)
        : undefined,
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
        phone: preferBranch(branch?.phone, row.phone),
        address: preferBranch(branch?.address, row.address),
        googleMapsUrl: preferBranch(branch?.google_maps_url, row.google_maps_url),
        socialLinks: resolveGuestSocialLinks(branch, row),
        description: settings.description,
        maxPartySize: settings.maxPartySize,
        allowNotes: settings.allowNotes,
        allowSameDay: settings.allowSameDay,
        slots: buildReservationSlots(settings),
        minDate: settings.allowSameDay ? today : addDays(today, 1),
        maxDate: addDays(today, REQUEST_WINDOW_DAYS),
        paused: row.reservation_paused === true,
        branchSlug: branchSlug?.trim() || null,
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
  /** Branch from the QR (`?b=`) — defaults to the merchant's main branch. */
  branchSlug?: string | null;
}): Promise<{ ok: boolean; error?: string; token?: string }> {
  try {
    const slug = input.slug.trim();
    const name = input.name.trim();
    if (!slug) return { ok: false, error: "Invalid reservation link." };
    if (!name) return { ok: false, error: "Please enter your name." };

    const captcha = await verifyTurnstileToken(input.captchaToken);
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const resolved = await resolveReservationPage(slug, input.branchSlug);
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
        error: `Up to ${merchant.maxPartySize} guests online — please call the restaurant for more.`,
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

    const branchId = await resolveJoinBranchId(merchantRow.id, input.branchSlug);

    const customer = await ensureGuestCustomer({
      merchantId: merchantRow.id,
      branchId,
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
        branch_id: branchId,
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
        merchantId: merchantRow.id,
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

