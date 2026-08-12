import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/authorize";
import { processApprovalEscalationReminders } from "@/lib/notifications/approval-escalation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/approval-escalation
 * Staff (3h) / manager (6h) reminders for pending stamp approvals.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processApprovalEscalationReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "approval_escalation_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: "Cron job failed." }, { status: 500 });
  }
}
