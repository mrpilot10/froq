import { NextResponse } from "next/server";
import { processRewardWaitUnlocks } from "@/lib/notifications/reward-wait-unlock";

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
 * GET /api/cron/reward-wait-unlock
 * Unlocks waiting rewards when reward_unlock_at has passed.
 * No WhatsApp (no approved wait-end template yet).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processRewardWaitUnlocks();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(
      JSON.stringify({
        scope: "cron",
        event: "reward_wait_unlock_failed",
        error: message,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
