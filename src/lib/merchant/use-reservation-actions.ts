"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  saveReservationNotes,
  setReservationStatus,
  suggestReservationTime,
  type ReservationAction,
} from "@/app/merchant/reservation-actions";
import type { Reservation, ReservationActionId } from "@/lib/merchant/reservations";

/** Merchant action ids map 1:1 onto the server action's transitions. */
const ACTION_TO_SERVER: Record<Exclude<ReservationActionId, "suggest">, ReservationAction> =
  {
    confirm: "confirm",
    decline: "decline",
    complete: "complete",
    cancel: "cancel",
    no_show: "no_show",
  };

function successMessage(action: ReservationActionId, name: string): string {
  switch (action) {
    case "confirm":
      return `Confirmed for ${name}`;
    case "decline":
      return "Reservation declined";
    case "complete":
      return `${name} marked as arrived`;
    case "cancel":
      return "Reservation cancelled";
    default:
      return "Marked as a no show";
  }
}

export interface ReservationActions {
  /** Id of the booking a request is in flight for, for per-row spinners. */
  busyId: string | null;
  runAction: (
    reservation: Reservation,
    action: ReservationActionId,
    input?: { reason?: string; tableId?: string | null },
  ) => Promise<boolean>;
  suggest: (
    reservation: Reservation,
    input: { date: string; time: string },
  ) => Promise<boolean>;
  saveNotes: (reservation: Reservation, merchantNotes: string) => Promise<boolean>;
}

/**
 * Status changes, time suggestions and private notes for a list of bookings.
 * Shared by the dashboard and history so both react identically — the server's
 * updated row is applied locally first, then the caller's list is refreshed.
 */
export function useReservationActions(
  applyUpdated: (next: Reservation) => void,
  reload: () => Promise<void> | void,
): ReservationActions {
  const [busyId, setBusyId] = useState<string | null>(null);

  const runAction = useCallback(
    async (
      reservation: Reservation,
      action: ReservationActionId,
      input?: { reason?: string; tableId?: string | null },
    ): Promise<boolean> => {
      // "suggest" needs a date and time, so it goes through suggest() instead.
      if (action === "suggest") return false;
      setBusyId(reservation.id);
      try {
        const result = await setReservationStatus({
          reservationId: reservation.id,
          action: ACTION_TO_SERVER[action],
          reason: input?.reason,
          tableId: input?.tableId,
        });
        if (!result.ok || !result.reservation) {
          toast.error(result.error ?? "Couldn't update the reservation.");
          return false;
        }
        applyUpdated(result.reservation);
        await reload();
        const tableBit =
          action === "confirm" && result.reservation.tableNumber != null
            ? ` · Table ${result.reservation.tableNumber}`
            : "";
        toast.success(
          `${successMessage(action, reservation.customerName)}${tableBit}`,
        );
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [applyUpdated, reload],
  );

  const suggest = useCallback(
    async (reservation: Reservation, input: { date: string; time: string }) => {
      setBusyId(reservation.id);
      try {
        const result = await suggestReservationTime({
          reservationId: reservation.id,
          date: input.date,
          time: input.time,
        });
        if (!result.ok || !result.reservation) {
          toast.error(result.error ?? "Couldn't suggest a new time.");
          return false;
        }
        applyUpdated(result.reservation);
        await reload();
        toast.success("New time sent to the guest");
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [applyUpdated, reload],
  );

  const saveNotes = useCallback(
    async (reservation: Reservation, merchantNotes: string) => {
      const result = await saveReservationNotes({
        reservationId: reservation.id,
        merchantNotes,
      });
      if (!result.ok || !result.reservation) {
        toast.error(result.error ?? "Couldn't save the note.");
        return false;
      }
      applyUpdated(result.reservation);
      toast.success("Note saved");
      return true;
    },
    [applyUpdated],
  );

  return { busyId, runAction, suggest, saveNotes };
}
