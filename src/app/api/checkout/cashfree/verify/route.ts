import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCashfreeOrderStatus } from "@/lib/payments/cashfree";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  orderId: z.string().min(1).max(120),
});

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
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    // Order ids are scoped to the user (froq_{userIdPrefix}_{ts}); reject ids
    // that don't belong to the authenticated session.
    if (!parsed.orderId.startsWith(`froq_${user.id.slice(0, 8)}_`)) {
      return NextResponse.json({ error: "Order does not belong to this account." }, { status: 403 });
    }

    const status = await getCashfreeOrderStatus(parsed.orderId);

    return NextResponse.json(
      { paid: status.isPaid, orderStatus: status.orderStatus },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify the payment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
