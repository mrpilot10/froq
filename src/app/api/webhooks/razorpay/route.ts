import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  paymentEntityToLedgerRow,
  recordSubscriptionEvent,
  upsertPaymentLedgerRows,
  type RazorpayPaymentEntity,
} from "@/lib/admin/razorpay-ledger";

export const runtime = "nodejs";
export const maxDuration = 30;

function webhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function paiseToInr(paise: number | null | undefined): number {
  return (Number(paise) || 0) / 100;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "RAZORPAY_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: {
    event?: string;
    id?: string | null;
    created_at?: number;
    payload?: {
      payment?: { entity?: RazorpayPaymentEntity };
      refund?: {
        entity?: {
          id?: string;
          payment_id?: string;
          amount?: number;
          status?: string;
          created_at?: number;
        };
      };
      subscription?: {
        entity?: {
          id?: string;
          status?: string;
          created_at?: number;
          ended_at?: number | null;
        };
      };
      invoice?: {
        entity?: {
          id?: string;
          status?: string;
          payment_id?: string | null;
          subscription_id?: string | null;
          amount?: number;
          created_at?: number;
          error_code?: string | null;
          error_description?: string | null;
        };
      };
    };
  };

  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = payload.event ?? "unknown";
  // Razorpay may not always send a stable event id — fall back to hash.
  const eventId =
    (typeof payload.id === "string" && payload.id) ||
    crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 40);

  const admin = createAdminClient();
  const { error: idempError } = await admin
    .from("razorpay_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
    });

  if (idempError) {
    // Duplicate delivery
    if (/duplicate|unique/i.test(idempError.message)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error(
      JSON.stringify({
        scope: "razorpay_webhook",
        event: "idempotency_write_failed",
        message: idempError.message,
      }),
    );
  }

  try {
    if (
      eventType === "payment.captured" ||
      eventType === "payment.authorized" ||
      eventType === "payment.failed"
    ) {
      const entity = payload.payload?.payment?.entity;
      if (entity?.id) {
        const subId =
          typeof entity.notes?.subscription_id === "string"
            ? entity.notes.subscription_id
            : null;
        await upsertPaymentLedgerRows([
          paymentEntityToLedgerRow(entity, "webhook", subId),
        ]);
        if (eventType === "payment.failed" && subId) {
          await recordSubscriptionEvent({
            subscriptionId: subId,
            eventType: "payment.failed",
            paymentId: entity.id,
            status: entity.status,
            amountInr: paiseToInr(entity.amount),
            errorCode: entity.error_code,
            errorDescription: entity.error_description,
            occurredAt: unixToIso(entity.created_at),
          });
        }
      }
    }

    if (
      eventType === "refund.created" ||
      eventType === "refund.processed" ||
      eventType === "refund.failed"
    ) {
      const refund = payload.payload?.refund?.entity;
      const paymentId = refund?.payment_id;
      if (paymentId) {
        // Re-fetch is ideal; without SDK call here, bump refunded amount from payload.
        const refundedInr = paiseToInr(refund.amount);
        await admin
          .from("razorpay_payment_ledger")
          .update({
            amount_refunded_inr: refundedInr,
            synced_at: new Date().toISOString(),
            source: "webhook",
          })
          .eq("payment_id", paymentId);
      }
    }

    if (eventType.startsWith("subscription.")) {
      const sub = payload.payload?.subscription?.entity;
      if (sub?.id) {
        await recordSubscriptionEvent({
          subscriptionId: sub.id,
          eventType,
          status: sub.status,
          occurredAt:
            unixToIso(sub.ended_at ?? sub.created_at) ??
            new Date().toISOString(),
        });
      }
    }

    if (
      eventType === "invoice.paid" ||
      eventType === "invoice.payment_failed"
    ) {
      const invoice = payload.payload?.invoice?.entity;
      if (invoice?.subscription_id) {
        await recordSubscriptionEvent({
          subscriptionId: invoice.subscription_id,
          eventType,
          paymentId: invoice.payment_id,
          status: invoice.status,
          amountInr: paiseToInr(invoice.amount),
          errorCode: invoice.error_code,
          errorDescription: invoice.error_description,
          occurredAt: unixToIso(invoice.created_at),
        });
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "razorpay_webhook",
        event: "handler_failed",
        type: eventType,
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event: eventType });
}
