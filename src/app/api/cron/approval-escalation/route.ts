import { NextResponse } from "next/server";
import { processApprovalEscalationReminders } from "@/lib/notifications/approval-escalation";

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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
