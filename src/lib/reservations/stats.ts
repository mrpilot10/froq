import type { Reservation, ReservationStats } from "@/lib/merchant/reservations";
import { reservationToday } from "@/lib/merchant/reservations";

/** Dashboard cards — always scoped to the store's current day. */
export function computeReservationStats(
  reservations: Reservation[],
  today = reservationToday(),
): ReservationStats {
  const rows = reservations.filter((r) => r.date === today);
  return {
    today: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    completed: rows.filter((r) => r.status === "completed").length,
    noShows: rows.filter((r) => r.status === "no_show").length,
  };
}

export interface ReservationHistorySummary {
  /** Past bookings in the selected range. */
  total: number;
  /** Guests who turned up and were seated. */
  seated: number;
  noShows: number;
  /** Cancelled by either side, plus requests the merchant declined. */
  droppedOff: number;
}

/** Totals for the history header, over the bookings already in hand. */
export function computeReservationHistorySummary(
  reservations: Reservation[],
): ReservationHistorySummary {
  return {
    total: reservations.length,
    seated: reservations.filter((r) => r.status === "completed").length,
    noShows: reservations.filter((r) => r.status === "no_show").length,
    droppedOff: reservations.filter(
      (r) => r.status === "cancelled" || r.status === "declined",
    ).length,
  };
}

export interface ReservationAnalytics {
  /** Reservations created for the store's current day. */
  today: number;
  total: number;
  confirmedRate: number;
  noShows: number;
  completed: number;
  averagePartySize: number;
  /** Bookings per day, oldest first — feeds the existing trend chart. */
  daily: Array<{ date: string; count: number }>;
}

/**
 * Aggregate a window of reservations for the analytics cards. `confirmedRate`
 * counts every reservation the merchant accepted (confirmed, completed or
 * no-show) against everything they actually reviewed, so untouched pending
 * requests never drag the number down.
 */
export function computeReservationAnalytics(
  reservations: Reservation[],
  today = reservationToday(),
): ReservationAnalytics {
  const total = reservations.length;
  const accepted = reservations.filter(
    (r) => r.status === "confirmed" || r.status === "completed" || r.status === "no_show",
  ).length;
  const reviewed = reservations.filter((r) => r.status !== "pending").length;
  const seats = reservations.reduce((sum, r) => sum + r.partySize, 0);

  const byDate = new Map<string, number>();
  for (const r of reservations) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
  }

  return {
    today: reservations.filter((r) => r.date === today).length,
    total,
    confirmedRate: reviewed > 0 ? Math.round((accepted / reviewed) * 100) : 0,
    noShows: reservations.filter((r) => r.status === "no_show").length,
    completed: reservations.filter((r) => r.status === "completed").length,
    averagePartySize: total > 0 ? Math.round((seats / total) * 10) / 10 : 0,
    daily: [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count })),
  };
}
