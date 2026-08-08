import { NextResponse } from "next/server";
import { processReservationQueueHolds } from "@/lib/queue/reservation-holds";

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
 * GET /api/cron/reservation-queue-holds
 * Activates due held slots (held → waiting) and releases grace-period no-shows.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReservationQueueHolds();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "reservation_queue_holds_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
