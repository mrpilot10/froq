import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatReservationDateForWhatsApp,
  formatReservationTimeForWhatsApp,
  formatReservationWhenAbsolute,
} from "@/lib/merchant/reservations";
import type { GuestCustomer } from "@/lib/merchant/guest-customer";
import type { ReservationDeclinedData } from "@/lib/notifications/types";

/**
 * Reservation lifecycle templates handled by the messaging service.
 *
 * WhatsApp is a notification channel only: each template carries a single
 * "View reservation" CTA and no quick replies. Cancellations are reflected on
 * the reservation page rather than messaged.
 */
export type ReservationTemplate =
  | "reservation_request_received"
  | "reservation_confirmed"
  | "reservation_confirmed_menu"
  | "reservation_declined"
  | "reservation_updated"
  | "reservation_reminder";

/** Everything a background send needs — never re-query inside `after()`. */
export interface ReservationNotifyTarget {
  businessName: string;
  /** Merchant public slug — for reservation_confirmed_menu /menu/{{1}}. */
  menuSlug: string | null;
  /** Merchant's WhatsApp notifications toggle. */
  enabled: boolean;
  customer: Pick<
    GuestCustomer,
    "phone" | "name" | "email" | "publicToken" | "whatsappAvailable" | "preferred"
  > | null;
}

function reservationLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    scope: "reservation_notifications",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/**
 * Stamp the booking with the outcome of its last send, so a guest who was never
 * reached is visible on the dashboard instead of only in the server log. Cheap
 * enough to always write: these sends already cost a round trip to the provider.
 */
async function recordNotifyOutcome(
  reservationToken: string,
  template: ReservationTemplate,
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("reservations")
      .update(
        reason
          ? {
              notify_failed_template: template,
              notify_failed_reason: reason,
              notify_failed_at: new Date().toISOString(),
            }
          : {
              notify_failed_template: null,
              notify_failed_reason: null,
              notify_failed_at: null,
            },
      )
      .eq("public_token", reservationToken);
  } catch (error) {
    // Bookkeeping must never mask the send result it is describing.
    reservationLog("warn", "outcome_write_failed", {
      template,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Send one reservation message through the existing messaging service.
 * Safe to call from `after()` — never throws.
 *
 * When `template` is `reservation_confirmed` and `merchantId` is set, may
 * upgrade to `reservation_confirmed_menu` when Reservation ↔ AI Menu is on.
 */
export async function sendReservationNotification(input: {
  target: ReservationNotifyTarget;
  template: ReservationTemplate;
  /** Used to resolve reservation_confirmed → reservation_confirmed_menu. */
  merchantId?: string;
  /** Reservation page token — the CTA on standard reservation templates. */
  reservationToken: string;
  date: string;
  time: string;
  partySize: number;
  declineReason?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const { target } = input;
  let template = input.template;
  if (template === "reservation_confirmed" && input.merchantId) {
    const { reservationConfirmedNotifyTemplate } = await import(
      "@/lib/reservations/ai-menu"
    );
    template = await reservationConfirmedNotifyTemplate(input.merchantId);
  }
  // Turning WhatsApp off is a choice, not a failure — nothing to flag.
  if (!target.enabled) return { ok: true, skipped: true };
  if (!target.customer) {
    reservationLog("warn", "no_customer", { template });
    await recordNotifyOutcome(input.reservationToken, template, "no_customer");
    return { ok: false, error: "no_customer" };
  }

  const data: ReservationDeclinedData = {
    businessName: target.businessName,
    when: formatReservationWhenAbsolute(input.date, input.time),
    date: formatReservationDateForWhatsApp(input.date),
    time: formatReservationTimeForWhatsApp(input.time),
    partySize: input.partySize,
    reservationToken: input.reservationToken,
    reason: input.declineReason?.trim() || undefined,
    ...(target.menuSlug ? { menuSlug: target.menuSlug } : {}),
  };

  try {
    const { sendCustomerNotification } = await import("@/lib/notifications");
    const result = await sendCustomerNotification({
      customer: {
        phone: target.customer.phone,
        name: target.customer.name,
        email: target.customer.email,
        publicToken: target.customer.publicToken,
        whatsappAvailable: target.customer.whatsappAvailable,
        preferredNotificationChannel: target.customer.preferred,
      },
      template,
      data,
      dedupeKey: `reservation:${input.reservationToken}:${template}`,
    });
    if (!result.ok) {
      reservationLog("error", "send_failed", { template, error: result.error });
      await recordNotifyOutcome(
        input.reservationToken,
        template,
        result.error ?? "send_failed",
      );
      return { ok: false, error: result.error };
    }
    await recordNotifyOutcome(input.reservationToken, template, null);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "notification_failed";
    reservationLog("error", "send_threw", { template, error: message });
    await recordNotifyOutcome(input.reservationToken, template, message);
    return { ok: false, error: message };
  }
}

/**
 * Resolve the merchant's business name + WhatsApp preference and the guest's
 * notification identity in one place, before scheduling a background send.
 */
export async function resolveReservationTarget(input: {
  merchantId: string;
  customerId: string | null;
}): Promise<ReservationNotifyTarget> {
  const admin = createAdminClient();
  const [merchantRes, customerRes] = await Promise.all([
    admin
      .from("merchants")
      .select("business_name, slug, reservation_whatsapp_enabled")
      .eq("id", input.merchantId)
      .maybeSingle(),
    input.customerId
      ? admin
          .from("customers")
          .select("name, phone, email, public_token, whatsapp_available, preferred_notification_channel")
          .eq("id", input.customerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const customerRow = customerRes.data;
  return {
    businessName: merchantRes.data?.business_name ?? "the restaurant",
    menuSlug: merchantRes.data?.slug?.trim() || null,
    enabled: merchantRes.data?.reservation_whatsapp_enabled !== false,
    customer:
      customerRow && customerRow.public_token
        ? {
            name: customerRow.name,
            phone: customerRow.phone,
            email: (customerRow.email as string | null) ?? null,
            publicToken: customerRow.public_token,
            whatsappAvailable: customerRow.whatsapp_available === true,
            preferred:
              customerRow.preferred_notification_channel === "whatsapp"
                ? "whatsapp"
                : "sms",
          }
        : null,
  };
}
