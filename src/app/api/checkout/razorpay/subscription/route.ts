import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlanById } from "@/lib/merchant/pricing";
import {
  createRazorpaySubscription,
  getRazorpayKeyId,
} from "@/lib/payments/razorpay";
import { isRazorpaySubscriptionPlan } from "@/lib/payments/razorpay-plans";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  planId: z.string().min(1).max(40),
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

    if (!isRazorpaySubscriptionPlan(parsed.planId)) {
      return NextResponse.json(
        { error: "This plan is not available as a Razorpay subscription." },
        { status: 400 },
      );
    }

    const plan = getPlanById(parsed.planId);
    if (
      plan.product !== "loyalty" &&
      plan.product !== "menu" &&
      plan.product !== "queue"
    ) {
      return NextResponse.json(
        {
          error:
            "Subscription checkout is only set up for Loyalty Stamps, Queue Management, and AI Menu for now.",
        },
        { status: 400 },
      );
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
    // Auth window: customer must complete Checkout within 30 minutes.
    const expireBy = Math.floor(Date.now() / 1000) + 30 * 60;

    const subscription = await createRazorpaySubscription({
      froqPlanId: plan.id,
      expireBy,
      notes: {
        plan_id: plan.id,
        product: plan.product,
        user_id: user.id,
        froq_receipt: receipt,
      },
    });

    return NextResponse.json(
      {
        mode: "subscription" as const,
        keyId: getRazorpayKeyId(),
        subscriptionId: subscription.subscriptionId,
        razorpayPlanId: subscription.planId,
        receipt,
        amount: Math.round(plan.price * 100),
        currency: "INR",
        planName: plan.name,
        product: plan.product,
        froqPlanId: plan.id,
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
      error instanceof Error ? error.message : "Could not start the subscription.";
    console.error("[razorpay/subscription]", message, error);
    const status =
      /not configured|credentials|unauthorized|authentication/i.test(message)
        ? 401
        : /invalid|not found|not available|mobile number|Invalid checkout/i.test(
              message,
            )
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
