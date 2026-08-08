import "server-only";

import { createHash } from "crypto";
import { Resend } from "resend";
import { noteResendQuotaHeaders } from "@/lib/admin/resend-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerNotificationEmail } from "@/lib/notifications/customer-email";
import type {
  CustomerNotificationDataMap,
  CustomerNotificationTemplate,
  NotifiableCustomer,
} from "@/lib/notifications/types";

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Froq <hello@froq.io>";
}

function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) return null;
  return email;
}

/**
 * Stable fingerprint for dedupe when callers don't pass an explicit key.
 * Same template + customer + payload → same key (retries won't double-email).
 */
export function defaultNotificationDedupeKey(
  template: CustomerNotificationTemplate,
  customer: NotifiableCustomer,
  data: unknown,
): string {
  const material = JSON.stringify({
    template,
    token: customer.publicToken || customer.phone,
    email: customer.email ?? null,
    data,
  });
  const hash = createHash("sha256").update(material).digest("hex").slice(0, 32);
  return `cust_notif:${template}:${hash}`;
}

/**
 * Claim a dedupe slot. Returns false if this email was already attempted.
 */
async function claimEmailDedupe(dedupeKey: string, kind: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("email_send_log").insert({
      kind,
      status: "pending",
      cost_usd: 0,
      cost_inr: 0,
      dedupe_key: dedupeKey,
    });
    if (error) {
      // Unique violation → already claimed
      if (
        error.code === "23505" ||
        /duplicate|unique/i.test(error.message)
      ) {
        return false;
      }
      // Column missing / other — still allow send; metering will log separately
      console.warn(
        JSON.stringify({
          scope: "customer_notifications",
          event: "email_dedupe_claim_failed",
          message: error.message,
          at: new Date().toISOString(),
        }),
      );
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

async function markDedupeResult(
  dedupeKey: string,
  input: {
    status: "sent" | "failed";
    resendId?: string | null;
    to?: string | null;
    errorMessage?: string | null;
  },
): Promise<void> {
  try {
    const { costInrForEmail, costUsdForEmail } = await import(
      "@/lib/email/pricing"
    );
    const to = input.to?.trim() ?? "";
    const at = to.lastIndexOf("@");
    const toDomain = at > 0 ? to.slice(at + 1).toLowerCase() : null;
    const admin = createAdminClient();
    await admin
      .from("email_send_log")
      .update({
        status: input.status,
        cost_usd: costUsdForEmail(input.status),
        cost_inr: costInrForEmail(input.status),
        resend_id: input.resendId ?? null,
        to_domain: toDomain,
        error_message: input.errorMessage?.slice(0, 500) ?? null,
      })
      .eq("dedupe_key", dedupeKey);
  } catch {
    // Best-effort — original claim row remains as pending
  }
}

export type CustomerEmailSendResult =
  | { ok: true; skipped?: false; id?: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

/**
 * Parallel email channel for customer notifications.
 * Never throws. Safe to fire alongside WhatsApp/SMS.
 */
export async function sendCustomerNotificationEmail<
  T extends CustomerNotificationTemplate,
>(input: {
  customer: NotifiableCustomer;
  template: T;
  data: CustomerNotificationDataMap[T];
  /** Stable key so retries don't double-send. Auto-derived when omitted. */
  dedupeKey?: string;
}): Promise<CustomerEmailSendResult> {
  const to = normalizeEmail(input.customer.email);
  if (!to) {
    return { ok: true, skipped: true, reason: "no_email" };
  }

  const kind = `customer_${input.template}`;
  const dedupeKey =
    input.dedupeKey?.trim() ||
    defaultNotificationDedupeKey(input.template, input.customer, input.data);

  const claimed = await claimEmailDedupe(dedupeKey, kind);
  if (!claimed) {
    return { ok: true, skipped: true, reason: "duplicate" };
  }

  const resend = getResend();
  if (!resend) {
    await markDedupeResult(dedupeKey, {
      status: "failed",
      to,
      errorMessage: "missing_RESEND_API_KEY",
    });
    return { ok: false, error: "Email delivery is not configured." };
  }

  try {
    const content = buildCustomerNotificationEmail(
      input.template,
      input.customer,
      input.data,
    );
    const { data, error, headers } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    noteResendQuotaHeaders(headers);
    if (error) {
      await markDedupeResult(dedupeKey, {
        status: "failed",
        to,
        errorMessage: error.message,
      });
      return { ok: false, error: error.message };
    }
    await markDedupeResult(dedupeKey, {
      status: "sent",
      to,
      resendId: data?.id ?? null,
    });
    return { ok: true, id: data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email_failed";
    await markDedupeResult(dedupeKey, {
      status: "failed",
      to,
      errorMessage: message,
    });
    return { ok: false, error: message };
  }
}
