"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { suggestTableForParty } from "@/app/merchant/table-actions";
import type { DiningTable } from "@/lib/merchant/dining-tables";

export type AssignTablePurpose = "call" | "seat" | "confirm" | "assign";

interface AssignTableSheetProps {
  open: boolean;
  branchId: string | null | undefined;
  partySize: number;
  guestName: string;
  purpose?: AssignTablePurpose;
  /** Reservation slot — used to mark tables already booked at that time. */
  date?: string | null;
  time?: string | null;
  ignoreReservationId?: string | null;
  ignoreQueueEntryId?: string | null;
  /** Preselects a table already on the record instead of the suggestion. */
  selectedTableId?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (tableId: string | null) => void;
}

const COPY: Record<
  AssignTablePurpose,
  {
    title: (name: string) => string;
    primary: (tableNumber: number | undefined) => string;
    primaryEmpty: string;
    busy: string;
  }
> = {
  call: {
    title: (name) => `Call ${name}`,
    primary: (n) => (n != null ? `Call to Table ${n}` : "Call without table"),
    primaryEmpty: "Call without table",
    busy: "Calling…",
  },
  seat: {
    title: (name) => `Seat ${name}`,
    primary: (n) => (n != null ? `Seat at Table ${n}` : "Seat without table"),
    primaryEmpty: "Seat without table",
    busy: "Seating…",
  },
  confirm: {
    title: (name) => `Confirm ${name}`,
    primary: (n) =>
      n != null ? `Confirm · Table ${n}` : "Confirm without table",
    primaryEmpty: "Confirm without table",
    busy: "Confirming…",
  },
  assign: {
    title: (name) => `Table for ${name}`,
    primary: (n) => (n != null ? `Assign Table ${n}` : "Save without table"),
    primaryEmpty: "Save without table",
    busy: "Saving…",
  },
};

/**
 * Pick (or skip) a table when calling, seating, or confirming a booking.
 * Suggests the smallest free table that fits; staff can choose another.
 */
export function AssignTableSheet({
  open,
  branchId,
  partySize,
  guestName,
  purpose = "seat",
  date = null,
  time = null,
  ignoreReservationId = null,
  ignoreQueueEntryId = null,
  selectedTableId = null,
  busy = false,
  onClose,
  onConfirm,
}: AssignTableSheetProps) {
  const copy = COPY[purpose];
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [occupiedIds, setOccupiedIds] = useState<string[]>([]);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !branchId) return;
    let cancelled = false;
    setLoading(true);
    setSelectedId(null);
    setTables([]);
    void suggestTableForParty({
      branchId,
      partySize,
      date: date ?? undefined,
      time: time ?? undefined,
      ignoreReservationId: ignoreReservationId ?? undefined,
      ignoreQueueEntryId: ignoreQueueEntryId ?? undefined,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't load tables.");
        setTables([]);
        return;
      }
      setTables(result.tables);
      setOccupiedIds(result.occupiedIds);
      setSuggestedId(result.table?.id ?? null);
      // A record that already has a table opens on that table, not the
      // suggestion — otherwise saving would silently move the booking.
      setSelectedId(selectedTableId ?? result.table?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    branchId,
    partySize,
    date,
    time,
    ignoreReservationId,
    ignoreQueueEntryId,
    selectedTableId,
  ]);

  const occupied = new Set(occupiedIds);
  const selectedNumber = tables.find((t) => t.id === selectedId)?.number;
  const freeCount = tables.filter(
    (table) => !occupied.has(table.id) && table.seats >= partySize,
  ).length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="assign-table-title"
      className="merchant-theme"
    >
      <div className="queue-sheet seat-table-sheet">
        <div className="queue-sheet-head">
          <h3 id="assign-table-title" className="queue-sheet-title">
            {copy.title(guestName)}
          </h3>
          <p className="queue-sheet-sub">
            Selecting a table for <strong>Party of {partySize}</strong>
          </p>
        </div>

        {loading ? (
          <div className="seat-table-grid" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                className="sk"
                style={{ width: "100%", height: 102, borderRadius: 16 }}
              />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <p className="merchant-field-hint seat-table-empty">
            No tables configured for this branch. Continue without a table
            number, or add tables in Settings.
          </p>
        ) : (
          <div className="seat-table-block">
            <div className="seat-table-count">
              {freeCount} of {tables.length} free for this party
            </div>
            {/* A grid of table tiles reads like the floor, so staff match it to
                the room instead of reading a list of near-identical rows. */}
            <ul className="seat-table-grid" role="listbox" aria-label="Tables">
              {tables.map((table) => {
                const tooSmall = table.seats < partySize;
                const taken = occupied.has(table.id);
                const disabled = tooSmall || taken;
                const selected = selectedId === table.id;
                const suggested = suggestedId === table.id && !disabled;
                const badge = taken
                  ? {
                      tone: "busy",
                      label:
                        purpose === "call" || purpose === "seat"
                          ? "In use"
                          : "Booked",
                    }
                  : tooSmall
                    ? { tone: "small", label: "Too small" }
                    : suggested
                      ? { tone: "suggested", label: "Suggested" }
                      : null;

                return (
                  <li key={table.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`seat-table-tile${
                        selected ? " is-selected" : ""
                      }${disabled ? " is-disabled" : ""}${
                        taken ? " is-busy" : ""
                      }${suggested ? " is-suggested" : ""}`}
                      disabled={disabled || busy}
                      onClick={() =>
                        setSelectedId((prev) =>
                          prev === table.id ? null : table.id,
                        )
                      }
                    >
                      <span className="seat-table-tile-name">
                        Table {table.number}
                      </span>
                      {/* Seats lead: the question is "does this party fit". */}
                      <span className="seat-table-tile-seatnum">
                        {table.seats}
                      </span>
                      <span className="seat-table-tile-seatword">
                        {table.seats === 1 ? "seat" : "seats"}
                      </span>
                      {/* Always rendered so every tile is the same height. */}
                      {badge ? (
                        <span
                          className={`seat-table-tile-badge seat-table-tile-badge--${badge.tone}`}
                        >
                          {badge.label}
                        </span>
                      ) : (
                        <span className="seat-table-tile-badge is-empty" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* No separate "without table" link: tapping the selected tile clears
            it, and the button below then says so itself. */}
        <div className="seat-table-actions">
          <button
            type="button"
            className="cta-btn cta-btn--brand"
            disabled={busy}
            onClick={() => onConfirm(selectedId)}
          >
            {busy
              ? copy.busy
              : selectedId
                ? copy.primary(selectedNumber)
                : copy.primaryEmpty}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/** @deprecated Prefer {@link AssignTableSheet}. */
export const SeatAtTableSheet = AssignTableSheet;
