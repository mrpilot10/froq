import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanById } from "@/lib/merchant/pricing";
import { productLabel } from "@/lib/admin/plans";
import {
  getRazorpayClient,
  razorpayErrorMessage,
} from "@/lib/payments/razorpay";

export type RazorpayPaymentRow = {
  id: string;
  amountInr: number;
  feeInr: number;
  taxInr: number;
  netInr: number;
  currency: string;
  status: string;
  method: string;
  email: string | null;
  contact: string | null;
  orderId: string | null;
  createdAt: string;
};

export type RazorpaySubscriptionRow = {
  id: string;
  status: string;
  planId: string;
  paidCount: number;
  totalCount: number;
  currentStart: string | null;
  currentEnd: string | null;
};

export type LocalSubscriptionRow = {
  merchantId: string;
  businessName: string;
  product: string;
  productLabel: string;
  planId: string | null;
  planName: string | null;
  razorpaySubscriptionId: string;
  status: string;
  purchasedAt: string;
};

export type PaymentsOverview = {
  generatedAt: string;
  configured: boolean;
  error: string | null;
  totals: {
    capturedCount: number;
    capturedInr: number;
    feesInr: number;
    taxInr: number;
    netInr: number;
    failedCount: number;
  };
  recentPayments: RazorpayPaymentRow[];
  recentSubscriptions: RazorpaySubscriptionRow[];
  localSubscriptions: LocalSubscriptionRow[];
  pending: string[];
};

function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0) return "•••";
  return `${value.slice(0, Math.min(2, at))}…@${value.slice(at + 1)}`;
}

function maskContact(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `…${digits.slice(-4)}`;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function paiseToInr(paise: number | null | undefined): number {
  return (Number(paise) || 0) / 100;
}

export async function getPaymentsOverview(): Promise<PaymentsOverview> {
  const pending = [
    "Wire RAZORPAY_WEBHOOK_SECRET → POST /api/webhooks/razorpay for realtime ledger",
    "Settlement bank payout sync (beyond payment fee/tax)",
  ];

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const configured = Boolean(keyId && keySecret);

  const admin = createAdminClient();
  const [{ data: productRows }, { data: merchants }] = await Promise.all([
    admin
      .from("merchant_products")
      .select(
        "merchant_id, product, plan_id, status, purchased_at, razorpay_subscription_id",
      )
      .not("razorpay_subscription_id", "is", null)
      .order("purchased_at", { ascending: false })
      .limit(100),
    admin.from("merchants").select("id, business_name"),
  ]);

  const nameById = new Map(
    (merchants ?? []).map((m) => [m.id as string, m.business_name as string]),
  );

  const localSubscriptions: LocalSubscriptionRow[] = (productRows ?? [])
    .filter((r) => r.razorpay_subscription_id)
    .map((r) => {
      const planId = (r.plan_id as string | null) ?? null;
      return {
        merchantId: r.merchant_id as string,
        businessName: nameById.get(r.merchant_id as string) ?? "Unknown",
        product: r.product as string,
        productLabel: productLabel(r.product as string),
        planId,
        planName: planId ? getPlanById(planId).name : null,
        razorpaySubscriptionId: r.razorpay_subscription_id as string,
        status: r.status as string,
        purchasedAt: r.purchased_at as string,
      };
    });

  if (!configured) {
    return {
      generatedAt: new Date().toISOString(),
      configured: false,
      error: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured",
      totals: {
        capturedCount: 0,
        capturedInr: 0,
        feesInr: 0,
        taxInr: 0,
        netInr: 0,
        failedCount: 0,
      },
      recentPayments: [],
      recentSubscriptions: [],
      localSubscriptions,
      pending,
    };
  }

  try {
    const razorpay = getRazorpayClient();
    const [paymentsRes, subsRes] = await Promise.all([
      razorpay.payments.all({ count: 50 }),
      razorpay.subscriptions.all({ count: 25 }),
    ]);

    const paymentItems = (paymentsRes.items ?? []) as unknown as Array<
      Record<string, unknown>
    >;
    const recentPayments: RazorpayPaymentRow[] = paymentItems.map((p) => {
      const amountInr = paiseToInr(p.amount as number);
      const feeInr = paiseToInr(p.fee as number);
      const taxInr = paiseToInr(p.tax as number);
      return {
        id: String(p.id),
        amountInr,
        feeInr,
        taxInr,
        netInr: amountInr - feeInr,
        currency: String(p.currency ?? "INR"),
        status: String(p.status ?? "unknown"),
        method: String(p.method ?? "—"),
        email: maskEmail(typeof p.email === "string" ? p.email : null),
        contact: maskContact(typeof p.contact === "string" ? p.contact : null),
        orderId: typeof p.order_id === "string" ? p.order_id : null,
        createdAt: unixToIso(p.created_at as number) ?? new Date().toISOString(),
      };
    });

    const captured = recentPayments.filter((p) => p.status === "captured");
    const failed = recentPayments.filter((p) => p.status === "failed");

    const recentSubscriptions: RazorpaySubscriptionRow[] = (
      (subsRes.items ?? []) as unknown as Array<Record<string, unknown>>
    ).map((s) => ({
      id: String(s.id),
      status: String(s.status ?? "unknown"),
      planId: String(s.plan_id ?? "—"),
      paidCount: Number(s.paid_count) || 0,
      totalCount: Number(s.total_count) || 0,
      currentStart: unixToIso(s.current_start as number | null),
      currentEnd: unixToIso(s.current_end as number | null),
    }));

    return {
      generatedAt: new Date().toISOString(),
      configured: true,
      error: null,
      totals: {
        capturedCount: captured.length,
        capturedInr: captured.reduce((s, p) => s + p.amountInr, 0),
        feesInr: captured.reduce((s, p) => s + p.feeInr, 0),
        taxInr: captured.reduce((s, p) => s + p.taxInr, 0),
        netInr: captured.reduce((s, p) => s + p.netInr, 0),
        failedCount: failed.length,
      },
      recentPayments,
      recentSubscriptions,
      localSubscriptions,
      pending,
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      configured: true,
      error: razorpayErrorMessage(error, "Razorpay API request failed"),
      totals: {
        capturedCount: 0,
        capturedInr: 0,
        feesInr: 0,
        taxInr: 0,
        netInr: 0,
        failedCount: 0,
      },
      recentPayments: [],
      recentSubscriptions: [],
      localSubscriptions,
      pending,
    };
  }
}
