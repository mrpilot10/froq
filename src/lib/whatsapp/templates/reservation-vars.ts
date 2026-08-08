/**
 * Reservation WhatsApp body variables.
 *
 * Meta contract (do not change count or order without re-approving templates):
 *   {{1}} customer name
 *   {{2}} business name
 *   {{3}} date        — e.g. "15 Aug 2026"
 *   {{4}} time        — e.g. "7:30 PM"
 *   {{5}} party size  — digits only, e.g. "2"
 *
 * URL button {{1}} = reservation public token (`rsv_…`)
 * → https://froq.io/r/{{1}}
 *
 * Approved Meta body copy (utility). Keep static text short so long café
 * names still fit the 1024-char body limit at send time:
 *
 * reservation_request_received
 *   Hi {{1}}, we've received your table request at {{2}} for {{3}} at {{4}}
 *   ({{5}} guests). We'll confirm shortly.
 *
 * reservation_confirmed
 *   Hi {{1}}, your table at {{2}} is confirmed for {{3}} at {{4}}
 *   ({{5}} guests). See you then!
 *
 * reservation_declined
 *   Hi {{1}}, sorry — {{2}} can't take your booking for {{3}} at {{4}}
 *   ({{5}} guests).
 *
 * reservation_updated
 *   Hi {{1}}, {{2}} proposed a new time: {{3}} at {{4}} for {{5}} guests.
 *   Open the link to accept or decline.
 *
 * reservation_reminder
 *   Hi {{1}}, reminder: your table at {{2}} is on {{3}} at {{4}}
 *   ({{5}} guests).
 *
 * Button label on every template: "View reservation"
 */

import {
  formatReservationDateForWhatsApp,
  formatReservationTimeForWhatsApp,
} from "@/lib/merchant/reservations";
import { requireReservationPublicToken } from "@/lib/reservations/link";
import {
  requireNonEmptyString,
  WhatsAppTemplateValidationError,
} from "./types";

/** Soft cap so long restaurant names don't blow Meta's body budget. */
const MAX_NAME_CHARS = 60;

/**
 * Meta rejects some symbols inside variable values (#, $, %). Strip those and
 * collapse whitespace / newlines so a messy store name still sends cleanly.
 */
function sanitizeWhatsAppVar(value: string, field: string): string {
  const cleaned = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[#$%]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    throw new WhatsAppTemplateValidationError(`${field} is required.`, field);
  }
  if (cleaned.length <= MAX_NAME_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_NAME_CHARS - 1).trimEnd()}…`;
}

function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return first || "there";
}

function partySizeDigits(value: unknown): string {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 1) {
    throw new WhatsAppTemplateValidationError(
      "partySize must be at least 1.",
      "partySize",
    );
  }
  return String(Math.round(n));
}

export interface ReservationWhatsAppVarInput {
  customerName: string;
  businessName: string;
  /** YYYY-MM-DD store-local. */
  date: string;
  /** HH:MM store-local. */
  time: string;
  partySize: number | string;
  /** Reservation page token (`rsv_…`) for the URL button. */
  reservationToken: string;
}

export interface ReservationWhatsAppVars {
  customerName: string;
  businessName: string;
  date: string;
  time: string;
  partySize: string;
  reservationToken: string;
  /** Body {{1}}…{{5}}. */
  body: [string, string, string, string, string];
}

/**
 * Build sanitized body vars + URL token for every reservation lifecycle template.
 */
export function buildReservationWhatsAppVars(
  input: ReservationWhatsAppVarInput,
): ReservationWhatsAppVars {
  const customerName = sanitizeWhatsAppVar(
    firstName(input.customerName.trim() || "there"),
    "customerName",
  );
  const businessName = sanitizeWhatsAppVar(input.businessName, "businessName");
  const date = sanitizeWhatsAppVar(
    formatReservationDateForWhatsApp(input.date),
    "date",
  );
  const time = sanitizeWhatsAppVar(
    formatReservationTimeForWhatsApp(input.time),
    "time",
  );
  const partySize = partySizeDigits(input.partySize);

  let reservationToken: string;
  try {
    reservationToken = requireReservationPublicToken(
      input.reservationToken,
      "reservationToken",
    );
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid reservationToken.",
      "reservationToken",
    );
  }

  return {
    customerName,
    businessName,
    date,
    time,
    partySize,
    reservationToken,
    body: [customerName, businessName, date, time, partySize],
  };
}

/** Ensures a non-empty display name before first-name extraction. */
export function requireCustomerDisplayName(value: unknown): string {
  return requireNonEmptyString(
    typeof value === "string" && value.trim() ? value : "there",
    "customerName",
  );
}
