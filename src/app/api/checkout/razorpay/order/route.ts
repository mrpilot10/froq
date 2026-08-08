import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlanById } from "@/lib/merchant/pricing";
import {
  classifyPlanChange,
  defaultPeriodEnd,
  proratedUpgradeAmount,
} from "@/lib/merchant/billing";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  planId: z.string().min(1).max(40),
  /** When set, charge the prorated upgrade difference instead of full price. */
  fromPlanId: z.string().min(1).max(40).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: z.string().trim().min(10).max(20).optional(),
});

function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    let parsed: z.infer<typeof bodySchema>;
    try {
      parsed = bodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
    }

    const plan = getPlanById(parsed.planId);
    let amountInr = plan.price;
    let chargedAs: "full" | "prorated_upgrade" = "full";

    if (parsed.fromPlanId) {
      const kind = classifyPlanChange(parsed.fromPlanId, parsed.planId);
      if (kind !== "upgrade") {
        return NextResponse.json(
          { error: "Only upgrades can be charged immediately." },
          { status: 400 },
        );
      }

      const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      let periodEnd: string | null = null;
      if (merchant) {
        const { data: entitlement } = await supabase
          .from("merchant_products")
          .select("current_period_end, purchased_at, plan_id")
          .eq("merchant_id", merchant.id)
          .eq("product", plan.product)
          .maybeSingle();
        periodEnd =
          entitlement?.current_period_end ??
          (entitlement?.purchased_at
            ? defaultPeriodEnd(
                entitlement.plan_id ?? parsed.fromPlanId,
                new Date(entitlement.purchased_at),
              ).toISOString()
            : null);
      }

      amountInr = proratedUpgradeAmount(parsed.fromPlanId, parsed.planId, periodEnd);
      chargedAs = "prorated_upgrade";
      if (amountInr <= 0) {
        return NextResponse.json(
          { error: "Nothing to charge for this upgrade." },
          { status: 400 },
        );
      }
    }

    const metaPhone =
      typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "";
    const customerPhone = normalizePhone(
      parsed.customerPhone || metaPhone || user.phone,
    );
    if (!customerPhone || customerPhone.length !== 10) {
      return NextResponse.json(
        { error: "A valid mobile number is required for payment." },
        { status: 400 },
      );
    }

    const receipt = `froq_${user.id.slice(0, 8)}_${Date.now()}`;
    const order = await createRazorpayOrder({
      receipt,
      amountInr,
      notes: {
        plan_id: plan.id,
        product: plan.product,
        user_id: user.id,
        froq_receipt: receipt,
      },
    });

    return NextResponse.json(
      {
        keyId: getRazorpayKeyId(),
        orderId: order.orderId,
        receipt,
        amount: order.amount,
        currency: order.currency,
        chargedAs,
        planName: plan.name,
        product: plan.product,
        customer: {
          name: parsed.customerName?.trim() || "Froq Merchant",
          email: parsed.customerEmail?.trim() || user.email || "merchant@froq.io",
          contact: customerPhone,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start the payment.";
    const status =
      /not configured|credentials|unauthorized|authentication/i.test(message)
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
