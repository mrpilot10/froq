/**
 * Shared queue WhatsApp body variables.
 *
 * Reused by queue_first_notify, call/reminder, skipped, and seated templates.
 * URL button {{1}} always uses the existing customers.public_token (frq_…).
 */

import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { formatBookingSize, formatEstimatedWaitTime } from "@/lib/queue/format";
import {
  requireNonEmptyString,
  requireNumberAsString,
  WhatsAppTemplateValidationError,
} from "./types";

function requirePublicToken(value: string): string {
  try {
    return requireCustomerPublicToken(value, "publicToken");
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid publicToken.",
      "publicToken",
    );
  }
}

function requireBookingSize(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WhatsAppTemplateValidationError("bookingSize must be a number.", "bookingSize");
  }
  if (value < 1) {
    throw new WhatsAppTemplateValidationError(
      "bookingSize must be at least 1.",
      "bookingSize",
    );
  }
  return formatBookingSize(value);
}

function requireQueuePosition(value: number | string, field = "queuePosition"): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WhatsAppTemplateValidationError(`${field} must be a number.`, field);
    }
    return requireNumberAsString(value, field);
  }
  return requireNonEmptyString(value, field);
}

function requireEstimatedWaitMinutes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WhatsAppTemplateValidationError(
      "estimatedWaitMinutes must be a number.",
      "estimatedWaitMinutes",
    );
  }
  if (value < 0) {
    throw new WhatsAppTemplateValidationError(
      "estimatedWaitMinutes cannot be negative.",
      "estimatedWaitMinutes",
    );
  }
  return formatEstimatedWaitTime(value);
}

/** Shared fields for call / reminder / skipped / seated templates. */
export interface QueuePartyWhatsAppVarInput {
  customerName: string;
  businessName: string;
  bookingSize: number;
  /** Existing customers.public_token (frq_…). Never generate a new one. */
  publicToken: string;
}

export interface QueuePartyWhatsAppVars {
  customerName: string;
  businessName: string;
  bookingSizeLabel: string;
  publicToken: string;
  /** Body {{1}}…{{3}}: name, business, booking size. */
  body: [string, string, string];
}

/**
 * Body for queue_call_now / reminders / skipped / seated:
 *   {{1}} customer name
 *   {{2}} business name
 *   {{3}} booking size ("1 person" / "2 people")
 */
export function buildQueuePartyWhatsAppVars(
  input: QueuePartyWhatsAppVarInput,
): QueuePartyWhatsAppVars {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const bookingSizeLabel = requireBookingSize(input.bookingSize);
  const publicToken = requirePublicToken(input.publicToken);

  return {
    customerName,
    businessName,
    bookingSizeLabel,
    publicToken,
    body: [customerName, businessName, bookingSizeLabel],
  };
}

export interface QueueJoinedWhatsAppVarInput extends QueuePartyWhatsAppVarInput {
  /** Position in the live waitlist (e.g. 3). */
  queuePosition: number | string;
  /** Estimated wait in whole minutes. */
  estimatedWaitMinutes: number;
}

export interface QueueJoinedWhatsAppVars {
  customerName: string;
  businessName: string;
  bookingSizeLabel: string;
  queuePosition: string;
  estimatedWaitLabel: string;
  publicToken: string;
  /**
   * Body {{1}}…{{5}} for queue_first_notify:
   * name, business, booking size, queue #, estimated wait.
   * publicToken is only for the URL button (https://a-t.cc/{{1}}).
   */
  body: [string, string, string, string, string];
}

/**
 * Body for queue_first_notify (Meta):
 *   {{1}} customer name
 *   {{2}} business name
 *   {{3}} booking size
 *   {{4}} queue position / number
 *   {{5}} estimated wait ("5 mins", "1 hour 15 mins", …)
 *
 * URL button {{1}} = publicToken (separate from body).
 */
export function buildQueueJoinedWhatsAppVars(
  input: QueueJoinedWhatsAppVarInput,
): QueueJoinedWhatsAppVars {
  const party = buildQueuePartyWhatsAppVars(input);
  const queuePosition = requireQueuePosition(input.queuePosition);
  const estimatedWaitLabel = requireEstimatedWaitMinutes(input.estimatedWaitMinutes);

  return {
    ...party,
    queuePosition,
    estimatedWaitLabel,
    body: [
      party.customerName,
      party.businessName,
      party.bookingSizeLabel,
      queuePosition,
      estimatedWaitLabel,
    ],
  };
}

/** @deprecated Prefer buildQueueJoinedWhatsAppVars — same payload for queue_first_notify. */
export const buildQueueFirstNotifyWhatsAppVars = buildQueueJoinedWhatsAppVars;

/** @deprecated Prefer buildQueueJoinedWhatsAppVars / buildQueuePartyWhatsAppVars. */
export type QueueWhatsAppVarInput = QueueJoinedWhatsAppVarInput;
/** @deprecated Prefer QueueJoinedWhatsAppVars. */
export type QueueWhatsAppVars = QueueJoinedWhatsAppVars;
/** @deprecated Prefer buildQueueJoinedWhatsAppVars. */
export const buildQueueWhatsAppVars = buildQueueJoinedWhatsAppVars;
