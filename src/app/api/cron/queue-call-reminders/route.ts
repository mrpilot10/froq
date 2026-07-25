import { NextResponse } from "next/server";
import { processQueueCallReminders } from "@/lib/notifications/queue-call-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron auth: project env CRON_SECRET is sent as
 * Authorization: Bearer <CRON_SECRET> on scheduled invocations.
 */
function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
