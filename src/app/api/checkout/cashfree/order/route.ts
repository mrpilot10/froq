import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPlanById } from "@/lib/merchant/pricing";
import { createCashfreeOrder } from "@/lib/payments/cashfree";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  planId: z.string().min(1).max(40),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerEmail: z.string().trim().email().optional(),
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

    // Price is derived server-side from the plan id so the amount can't be
    // tampered with from the client.
    const plan = getPlanById(parsed.planId);
    const customerPhone = normalizePhone(user.phone);
    if (!customerPhone) {
      return NextResponse.json({ error: "A verified phone number is required." }, { status: 400 });
    }

    const orderId = `froq_${user.id.slice(0, 8)}_${Date.now()}`;
    const order = await createCashfreeOrder({
      orderId,
      amount: plan.price,
      customerId: user.id,
      customerName: parsed.customerName?.trim() || "Froq Merchant",
      customerEmail: parsed.customerEmail?.trim() || user.email || "merchant@froq.io",
      customerPhone,
    });

    return NextResponse.json(
      {
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
