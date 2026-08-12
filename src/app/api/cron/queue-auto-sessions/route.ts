import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processQueueAutoSessions } from "@/lib/queue/auto-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/queue-auto-sessions
 * Auto-starts / auto-closes live queue sessions from merchant store hours.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processQueueAutoSessions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "queue_auto_sessions_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
