import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processBirthdayBonusStampNotifications } from "@/lib/notifications/birthday-double-stamps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/birthday-double-stamps
 * Sends birthday_bonus_stamps WhatsApp (+ email when available) at 9:00 AM Asia/Kolkata.
 * Cron runs hourly; the job no-ops outside that local hour.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processBirthdayBonusStampNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "birthday_bonus_stamps_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
