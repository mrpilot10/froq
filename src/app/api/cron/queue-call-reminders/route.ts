import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processQueueCallReminders } from "@/lib/notifications/queue-call-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/queue-call-reminders
 * Sends due queue reminders (CALL_REMINDER_MINUTES). Catches up missed sends.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processQueueCallReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "queue_call_reminders_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
