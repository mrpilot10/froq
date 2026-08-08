import type {
  ReservationEventRow,
  ReservationRow,
} from "@/lib/supabase/database.types";
import { formatTimeForInput } from "@/lib/merchant/queue-hours";
import { normalizeMemberRole } from "@/lib/merchant/roles";
import type {
  Reservation,
  ReservationEvent,
  ReservationEventName,
} from "@/lib/merchant/reservations";

function ms(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Columns every reservation read needs — keep in sync with {@link toReservation}. */
export const RESERVATION_COLUMNS =
  "id, branch_id, reservation_number, public_token, customer_id, customer_name, customer_phone, customer_whatsapp, party_size, reservation_date, reservation_time, status, notes, merchant_notes, decline_reason, suggested_at, suggested_date, suggested_time, suggestion_accepted_at, confirmed_at, declined_at, cancelled_at, cancelled_by, completed_at, no_show_at, reminder_24h_sent_at, reminder_2h_sent_at, reminder_30m_sent_at, notify_failed_template, notify_failed_reason, notify_failed_at, dining_table_id, table_number, created_at";

type ReservationReadRow = Omit<ReservationRow, "merchant_id" | "updated_at">;

type ReservationEventReadRow = Pick<
  ReservationEventRow,
  "id" | "event" | "actor_kind" | "actor_name" | "actor_role" | "detail" | "created_at"
>;

export function toReservationEvent(row: ReservationEventReadRow): ReservationEvent {
  return {
    id: row.id,
    event: row.event as ReservationEventName,
    actorKind:
      row.actor_kind === "guest" || row.actor_kind === "system"
        ? row.actor_kind
        : "staff",
    actorName: row.actor_name,
    // Role only means something for a teammate; guest and cron entries have none.
    actorRole: row.actor_role ? normalizeMemberRole(row.actor_role) : null,
    detail: row.detail,
    atMs: ms(row.created_at) ?? Date.now(),
  };
}

export function toReservation(row: ReservationReadRow): Reservation {
  // Most recent reminder wins in the timeline — earlier nudges are implied.
  const reminderSentAtMs =
    ms(row.reminder_30m_sent_at) ??
    ms(row.reminder_2h_sent_at) ??
    ms(row.reminder_24h_sent_at);

  return {
    id: row.id,
    branchId: row.branch_id,
    number: row.reservation_number,
    publicToken: row.public_token,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerWhatsapp: row.customer_whatsapp,
    partySize: row.party_size,
    date: row.reservation_date,
    time: formatTimeForInput(row.reservation_time),
    status: row.status,
    tableNumber: row.table_number ?? null,
    diningTableId: row.dining_table_id ?? null,
    notes: row.notes ?? "",
    merchantNotes: row.merchant_notes ?? "",
    declineReason: row.decline_reason ?? "",
    suggestedAtMs: ms(row.suggested_at),
    suggestedDate: row.suggested_date,
    suggestedTime: row.suggested_time ? formatTimeForInput(row.suggested_time) : null,
    suggestionAcceptedAtMs: ms(row.suggestion_accepted_at),
    confirmedAtMs: ms(row.confirmed_at),
    declinedAtMs: ms(row.declined_at),
    cancelledAtMs: ms(row.cancelled_at),
    cancelledBy: row.cancelled_by === "customer" ? "customer" : row.cancelled_by ? "merchant" : null,
    completedAtMs: ms(row.completed_at),
    noShowAtMs: ms(row.no_show_at),
    reminderSentAtMs,
    notifyFailure: row.notify_failed_reason
      ? {
          template: row.notify_failed_template ?? "",
          reason: row.notify_failed_reason,
          atMs: ms(row.notify_failed_at),
        }
      : null,
    createdAtMs: ms(row.created_at) ?? Date.now(),
  };
}
