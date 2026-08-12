import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processReservationAutoDeclines } from "@/lib/reservations/auto-decline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reservation-auto-decline
 * Declines pending requests the merchant never reviewed within their
 * configured auto-decline window.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReservationAutoDeclines();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "reservation_auto_decline_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
