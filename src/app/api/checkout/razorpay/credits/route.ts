import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAiCreditPack } from "@/lib/ai/credits-config";
import {
  createRazorpayOrder,
  getRazorpayKeyId,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  packId: z.string().min(1).max(40),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerEmail: z.string().trim().email().optional(),
  customerPhone: z.string().trim().min(10).max(20).optional(),
});

function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * One-time Razorpay order for an AI Credit pack.
 * Notes carry pack_id so verify + apply can credit the wallet.
 */
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

    const pack = getAiCreditPack(parsed.packId);
    if (!pack) {
      return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, owner_user_id")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (!merchant) {
      return NextResponse.json(
        { error: "Only the business owner can buy AI Credits." },
        { status: 403 },
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
    const order = await createRazorpayOrder({
      receipt,
      amountInr: pack.priceInr,
      notes: {
        kind: "ai_credit_pack",
        pack_id: pack.id,
        credits: String(pack.credits),
        product: "menu",
        merchant_id: merchant.id,
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
        packId: pack.id,
        credits: pack.credits,
        packLabel: pack.label,
        priceInr: pack.priceInr,
        product: "menu",
        planName: pack.label,
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
