import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ReservationEventName } from "@/lib/merchant/reservations";
import type { MemberRole } from "@/lib/merchant/types";

/**
 * Who acted. Staff actors carry a snapshot of their name and role; the guest and
 * the reminder cron have no teammate behind them.
 */
export type ReservationEventActor =
  | { kind: "staff"; userId: string; name: string | null; role: MemberRole }
  | { kind: "guest" }
  | { kind: "system" };

/**
 * Append one action to a booking's trail.
 *
 * Bookkeeping never blocks the action it describes: a failure here is logged and
 * swallowed, because losing a trail entry is far better than failing a
 * confirmation the merchant already told the guest about.
 */
export async function recordReservationEvent(input: {
  reservationId: string;
  merchantId: string;
  event: ReservationEventName;
  actor: ReservationEventActor;
  detail?: string | null;
}): Promise<void> {
  const { actor } = input;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("reservation_events").insert({
      reservation_id: input.reservationId,
      merchant_id: input.merchantId,
      event: input.event,
      actor_kind: actor.kind,
      actor_user_id: actor.kind === "staff" ? actor.userId : null,
      actor_name: actor.kind === "staff" ? actor.name : null,
      actor_role: actor.kind === "staff" ? actor.role : null,
      detail: input.detail?.trim() || null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "reservation_events",
        level: "error",
        event: "record_failed",
        reservationEvent: input.event,
        error: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
  }
}
