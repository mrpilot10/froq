import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getRazorpayClient,
  razorpayErrorMessage,
} from "@/lib/payments/razorpay";

export type RazorpayFeeTotals = {
  synced: number;
  mtdFeeInr: number;
  mtdTaxInr: number;
  last30dFeeInr: number;
  last30dTaxInr: number;
  error: string | null;
};

export type RazorpayPaymentEntity = {
  id?: string;
  amount?: number;
  amount_refunded?: number;
  fee?: number;
  tax?: number;
  currency?: string;
  status?: string;
  method?: string;
  email?: string | null;
  contact?: string | null;
  order_id?: string | null;
  international?: boolean;
  error_code?: string | null;
  error_description?: string | null;
  created_at?: number;
  notes?: Record<string, string> | null;
  card?: { country?: string | null } | null;
};

function paiseToInr(paise: number | null | undefined): number {
  return (Number(paise) || 0) / 100;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function resolveCountry(p: RazorpayPaymentEntity): string {
  if (p.card?.country) return String(p.card.country).toUpperCase();
  if (p.international) return "INTL";
  return "IN";
}

function resolveSubscriptionId(p: RazorpayPaymentEntity): string | null {
  const notes = p.notes ?? {};
  if (typeof notes.subscription_id === "string") return notes.subscription_id;
  // Razorpay sometimes embeds under notes differently; leave null if absent.
  return null;
}

export function paymentEntityToLedgerRow(
  p: RazorpayPaymentEntity,
  source: "api_sync" | "webhook",
  subscriptionId?: string | null,
) {
  const amountInr = paiseToInr(p.amount);
  const feeInr = paiseToInr(p.fee);
  const taxInr = paiseToInr(p.tax);
  const refundedInr = paiseToInr(p.amount_refunded);
  return {
    payment_id: String(p.id),
    amount_inr: amountInr,
    amount_refunded_inr: refundedInr,
    fee_inr: feeInr,
    tax_inr: taxInr,
    net_inr: amountInr - feeInr - refundedInr,
    status: String(p.status ?? "unknown"),
    method: typeof p.method === "string" ? p.method : null,
    currency: String(p.currency ?? "INR"),
    order_id: typeof p.order_id === "string" ? p.order_id : null,
    subscription_id:
      subscriptionId ?? resolveSubscriptionId(p),
    email: typeof p.email === "string" ? p.email : null,
    contact: typeof p.contact === "string" ? p.contact : null,
    international: Boolean(p.international),
    country: resolveCountry(p),
    error_code: typeof p.error_code === "string" ? p.error_code : null,
    error_description:
      typeof p.error_description === "string"
        ? p.error_description.slice(0, 500)
        : null,
    paid_at: unixToIso(p.created_at) ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
    source,
    raw: p as unknown as Record<string, unknown>,
  };
}

export async function upsertPaymentLedgerRows(
  rows: Array<ReturnType<typeof paymentEntityToLedgerRow>>,
): Promise<{ error: string | null }> {
  if (rows.length === 0) return { error: null };
  const admin = createAdminClient();
  const { error } = await admin
    .from("razorpay_payment_ledger")
    .upsert(rows, { onConflict: "payment_id" });
  return { error: error?.message ?? null };
}

export async function recordSubscriptionEvent(input: {
  subscriptionId: string;
  eventType: string;
  paymentId?: string | null;
  status?: string | null;
  amountInr?: number | null;
  errorCode?: string | null;
  errorDescription?: string | null;
  occurredAt?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("razorpay_subscription_events").insert({
      subscription_id: input.subscriptionId,
      event_type: input.eventType,
      payment_id: input.paymentId ?? null,
      status: input.status ?? null,
      amount_inr: input.amountInr ?? null,
      error_code: input.errorCode ?? null,
      error_description: input.errorDescription?.slice(0, 500) ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
  } catch {
    // Unique conflicts / transient errors — ignore for metering path.
  }
}

/**
 * Paginate Razorpay payments for a Unix window and upsert into
 * razorpay_payment_ledger. Then roll fee/tax MTD + 30d from the ledger.
 */
export async function syncRazorpayPaymentLedger(opts: {
  monthStartIso: string;
  since30Iso: string;
  /** How far back to pull payments (default 90d for Revenue). */
  lookbackDays?: number;
}): Promise<RazorpayFeeTotals> {
  const empty: RazorpayFeeTotals = {
    synced: 0,
    mtdFeeInr: 0,
    mtdTaxInr: 0,
    last30dFeeInr: 0,
    last30dTaxInr: 0,
    error: null,
  };

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    return { ...empty, error: "Razorpay not configured" };
  }

  const admin = createAdminClient();
  const lookbackDays = opts.lookbackDays ?? 90;
  const fromUnix = Math.floor(
    (Date.now() - lookbackDays * 86_400_000) / 1000,
  );
  const toUnix = Math.floor(Date.now() / 1000);

  try {
    const razorpay = getRazorpayClient();
    let skip = 0;
    let synced = 0;
    const pageSize = 100;
    const maxPages = 30;

    for (let page = 0; page < maxPages; page += 1) {
      const res = await razorpay.payments.all({
        from: fromUnix,
        to: toUnix,
        count: pageSize,
        skip,
      });
      const items = ((res.items ?? []) as unknown) as RazorpayPaymentEntity[];
      if (items.length === 0) break;

      const rows = items
        .filter((p) => p.id)
        .map((p) => paymentEntityToLedgerRow(p, "api_sync"));

      const { error } = await upsertPaymentLedgerRows(rows);
      if (error) return { ...empty, error };

      for (const p of items) {
        if (p.status === "failed" && p.id) {
          const subId = resolveSubscriptionId(p);
          if (subId) {
            await recordSubscriptionEvent({
              subscriptionId: subId,
              eventType: "payment.failed",
              paymentId: p.id,
              status: p.status,
              amountInr: paiseToInr(p.amount),
              errorCode: p.error_code,
              errorDescription: p.error_description,
              occurredAt: unixToIso(p.created_at),
            });
          }
        }
      }

      synced += rows.length;
      if (items.length < pageSize) break;
      skip += pageSize;
    }

    // Pull recent subscriptions for halted / cancelled signals.
    try {
      const subsRes = await razorpay.subscriptions.all({ count: 50 });
      const subs = ((subsRes.items ?? []) as unknown) as Array<{
        id?: string;
        status?: string;
        created_at?: number;
        ended_at?: number | null;
      }>;
      for (const s of subs) {
        if (!s.id) continue;
        const status = String(s.status ?? "");
        if (["halted", "cancelled", "completed", "expired"].includes(status)) {
          await recordSubscriptionEvent({
            subscriptionId: s.id,
            eventType: `subscription.${status}`,
            status,
            occurredAt:
              unixToIso(s.ended_at ?? s.created_at) ?? new Date().toISOString(),
          });
        }
      }
    } catch {
      // Optional enrichment.
    }

    const [{ data: mtdRows }, { data: d30Rows }] = await Promise.all([
      admin
        .from("razorpay_payment_ledger")
        .select("fee_inr, tax_inr, status")
        .eq("status", "captured")
        .gte("paid_at", opts.monthStartIso),
      admin
        .from("razorpay_payment_ledger")
        .select("fee_inr, tax_inr, status")
        .eq("status", "captured")
        .gte("paid_at", opts.since30Iso),
    ]);

    const sum = (rows: Array<{ fee_inr: number; tax_inr: number }> | null) => {
      let fee = 0;
      let tax = 0;
      for (const r of rows ?? []) {
        fee += Number(r.fee_inr) || 0;
        tax += Number(r.tax_inr) || 0;
      }
      return { fee, tax };
    };

    const mtd = sum(mtdRows);
    const d30 = sum(d30Rows);

    return {
      synced,
      mtdFeeInr: mtd.fee,
      mtdTaxInr: mtd.tax,
      last30dFeeInr: d30.fee,
      last30dTaxInr: d30.tax,
      error: null,
    };
  } catch (error) {
    return {
      ...empty,
      error: razorpayErrorMessage(error, "Razorpay ledger sync failed"),
    };
  }
}
