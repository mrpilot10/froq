import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processBillingNoticeCrons } from "@/lib/notifications/billing-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/billing-notices
 * Owner emails: trial ending (2d / 1d for queue, reservation, menu) and
 * plan usage at 50% / 70% / 100%.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processBillingNoticeCrons();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "billing_notices_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
