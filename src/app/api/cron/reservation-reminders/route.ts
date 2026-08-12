import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processReservationReminders } from "@/lib/reservations/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reservation-reminders
 * Sends due reservation reminders (24h / 2h / 30m before the table).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReservationReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "reservation_reminders_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
