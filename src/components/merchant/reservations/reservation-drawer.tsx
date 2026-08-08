"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Phone,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { fetchReservationEvents } from "@/app/merchant/reservation-actions";
import { assignReservationTable } from "@/app/merchant/table-actions";
import { AssignTableSheet } from "../queue/seat-at-table-sheet";
import {
  buildReservationTimeline,
  drawerActionsFor,
  formatDateLabel,
  formatReservationNumber,
  formatTimeLabel,
  hasOpenSuggestion,
  notifyFailureText,
  RESERVATION_ACTION_LABELS,
  RESERVATION_STATUS_META,
  timelineActorLabel,
  timelineActors,
  type Reservation,
  type ReservationActionId,
  type ReservationEvent,
} from "@/lib/merchant/reservations";
import { ReservationSlotPicker } from "./reservation-slot-picker";
import { toast } from "sonner";

interface ReservationDrawerProps {
  reservation: Reservation | null;
  /** Bookable slots from the merchant's reservation settings. */
  slots: string[];
  busy?: boolean;
  onClose: () => void;
  onAction: (
    action: ReservationActionId,
    input?: { reason?: string; tableId?: string | null },
  ) => Promise<boolean> | boolean;
  onSuggest: (input: { date: string; time: string }) => Promise<boolean> | boolean;
  onSaveNotes: (merchantNotes: string) => Promise<boolean> | boolean;
  /** After table assign — parent refreshes the row. */
  onTableAssigned?: (next: {
    diningTableId: string | null;
    tableNumber: number | null;
  }) => void;
}

type Panel = "decline" | "suggest" | null;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function timelineTime(atMs: number | null): string {
  if (atMs == null) return "";
  return new Date(atMs).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function ReservationDrawer({
  reservation,
  slots,
  busy = false,
  onClose,
  onAction,
  onSuggest,
  onSaveNotes,
  onTableAssigned,
}: ReservationDrawerProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [suggestDate, setSuggestDate] = useState("");
  const [suggestTime, setSuggestTime] = useState("");
  const [events, setEvents] = useState<ReservationEvent[]>([]);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [assigningTable, setAssigningTable] = useState(false);

  // Reset the per-booking panels whenever the drawer switches reservation.
  useEffect(() => {
    setPanel(null);
    setReason("");
    setNotes(reservation?.merchantNotes ?? "");
    setSuggestDate(reservation?.suggestedDate ?? reservation?.date ?? "");
    setSuggestTime(reservation?.suggestedTime ?? reservation?.time ?? "");
    setEvents([]);
  }, [
    reservation?.id,
    reservation?.merchantNotes,
    reservation?.date,
    reservation?.time,
    reservation?.suggestedDate,
    reservation?.suggestedTime,
  ]);

  // Staff names live in reservation_events, not on the booking row.
  useEffect(() => {
    if (!reservation?.id) return;
    let cancelled = false;
    void fetchReservationEvents({ reservationId: reservation.id }).then((result) => {
      if (cancelled || !result.ok) return;
      setEvents(result.events);
    });
    return () => {
      cancelled = true;
    };
  }, [reservation?.id, reservation?.status, reservation?.suggestedAtMs]);

  const status = reservation ? RESERVATION_STATUS_META[reservation.status] : null;
  const actions = reservation ? drawerActionsFor(reservation.status) : [];
  const notifyFailure = reservation?.notifyFailure
    ? notifyFailureText(reservation.notifyFailure)
    : null;
  const actors = timelineActors(events);
  const pendingSuggestion = reservation ? hasOpenSuggestion(reservation) : false;
  const notesDirty = reservation ? notes.trim() !== reservation.merchantNotes.trim() : false;

  const runAction = async (action: ReservationActionId) => {
    if (action === "decline") {
      setPanel("decline");
      return;
    }
    if (action === "suggest") {
      setPanel("suggest");
      return;
    }
    await onAction(action);
  };

  const actionGroups = {
    primary: actions.filter((a) => a === "confirm" || a === "complete"),
    negative: actions.filter(
      (a) => a === "decline" || a === "cancel" || a === "no_show",
    ),
    alternate: actions.filter((a) => a === "suggest"),
  };

  const renderAction = (action: ReservationActionId) => (
    <button
      key={action}
      type="button"
      className={
        action === "confirm" || action === "complete"
          ? "queue-act queue-act--served"
          : action === "suggest"
            ? "queue-act queue-act--suggest"
            : "queue-act queue-act--left"
      }
      disabled={busy}
      onClick={() => void runAction(action)}
    >
      {action === "confirm" || action === "complete" ? (
        <Check size={14} strokeWidth={2.3} />
      ) : action === "suggest" ? (
        <CalendarDays size={14} strokeWidth={2.3} />
      ) : (
        <X size={14} strokeWidth={2.3} />
      )}
      {RESERVATION_ACTION_LABELS[action]}
    </button>
  );

  return (
    <>
    <BottomSheet
      open={reservation !== null}
      onClose={onClose}
      labelledBy="reservation-drawer-title"
      className="merchant-theme"
    >
      {reservation && status && (
        <div className="merchant-drawer resv-drawer">
          <div className="merchant-drawer-head">
            <div className="merchant-avatar merchant-avatar--lg">
              {initials(reservation.customerName)}
            </div>
            <div className="merchant-drawer-head-copy">
              <h3 id="reservation-drawer-title" className="merchant-drawer-name">
                {reservation.customerName}
              </h3>
              <div className="resv-drawer-head-meta">
                <span className={`merchant-badge merchant-badge--${status.cls}`}>
                  {status.label}
                </span>
                <span className="resv-drawer-ref">
                  {formatReservationNumber(reservation.number)}
                </span>
              </div>
            </div>
            <a
              className="resv-drawer-call"
              href={`tel:${reservation.customerPhone.replace(/[^\d+]/g, "")}`}
              aria-label={`Call ${reservation.customerName}`}
            >
              <Phone size={18} strokeWidth={2.3} />
              Call
            </a>
          </div>

          {notifyFailure ? (
            <div className="resv-drawer-alert" role="status">
              <AlertTriangle size={15} strokeWidth={2.3} aria-hidden="true" />
              <div>
                <strong>{notifyFailure.chip}</strong>
                <p>{notifyFailure.detail}</p>
              </div>
            </div>
          ) : null}

          <div className="resv-drawer-facts">
            <div className="resv-drawer-fact">
              <span className="resv-drawer-fact-label">When</span>
              <span className="resv-drawer-fact-value">
                {formatDateLabel(reservation.date)} · {formatTimeLabel(reservation.time)}
              </span>
            </div>
            <div className="resv-drawer-fact">
              <span className="resv-drawer-fact-label">Party</span>
              <span className="resv-drawer-fact-value">
                {reservation.partySize}{" "}
                {reservation.partySize === 1 ? "guest" : "guests"}
              </span>
            </div>
            <button
              type="button"
              className="resv-drawer-fact resv-drawer-fact--action"
              onClick={() => {
                if (!reservation.branchId) {
                  toast.error("This booking has no branch.");
                  return;
                }
                setTablePickerOpen(true);
              }}
            >
              <span className="resv-drawer-fact-label">Table</span>
              <span className="resv-drawer-fact-value">
                {reservation.tableNumber != null
                  ? `T${reservation.tableNumber}`
                  : "Assign"}
              </span>
            </button>
          </div>

          {(reservation.notes ||
            reservation.customerWhatsapp ||
            pendingSuggestion ||
            reservation.declineReason) && (
            <div className="resv-drawer-details">
              {reservation.notes ? (
                <div className="resv-drawer-detail">
                  <span className="resv-drawer-detail-label">Guest note</span>
                  <span className="resv-drawer-detail-value">{reservation.notes}</span>
                </div>
              ) : null}
              {reservation.customerWhatsapp &&
              reservation.customerWhatsapp.replace(/\D/g, "") !==
                reservation.customerPhone.replace(/\D/g, "") ? (
                <div className="resv-drawer-detail">
                  <span className="resv-drawer-detail-label">WhatsApp</span>
                  <span className="resv-drawer-detail-value">
                    {formatPhoneDisplay(reservation.customerWhatsapp)}
                  </span>
                </div>
              ) : null}
              {pendingSuggestion ? (
                <div className="resv-drawer-detail">
                  <span className="resv-drawer-detail-label">Proposed</span>
                  <span className="resv-drawer-detail-value">
                    {formatDateLabel(reservation.suggestedDate!)} at{" "}
                    {formatTimeLabel(reservation.suggestedTime!)}
                  </span>
                </div>
              ) : null}
              {reservation.declineReason ? (
                <div className="resv-drawer-detail">
                  <span className="resv-drawer-detail-label">Decline reason</span>
                  <span className="resv-drawer-detail-value">
                    {reservation.declineReason}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div className="merchant-settings-group resv-drawer-timeline">
            <h3 className="merchant-settings-title">Timeline</h3>
            <div className="resv-timeline">
              {buildReservationTimeline(reservation).map((step, index, all) => {
                const by = step.done ? timelineActorLabel(actors[step.id]) : null;
                return (
                <div
                  key={step.id}
                  className={`resv-timeline-step${step.done ? " is-done" : ""}`}
                >
                  <div className="resv-timeline-rail">
                    <span className="resv-timeline-dot" aria-hidden="true">
                      {step.done ? (
                        <Check size={12} strokeWidth={3} />
                      ) : (
                        <Clock3 size={12} strokeWidth={2.6} />
                      )}
                    </span>
                    {index < all.length - 1 ? (
                      <span className="resv-timeline-line" aria-hidden="true" />
                    ) : null}
                  </div>
                  <div className="resv-timeline-copy">
                    <div className="resv-timeline-label">{step.label}</div>
                    <div className="resv-timeline-time">
                      {step.atMs != null
                        ? timelineTime(step.atMs)
                        : step.id === "attendance"
                          ? "Coming soon"
                          : "Pending"}
                      {by ? ` · ${by}` : ""}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <label className="auth-field resv-drawer-notes">
            <span className="auth-label">Merchant notes</span>
            <textarea
              className="auth-input merchant-textarea"
              rows={2}
              placeholder="Private note — table 4, birthday cake…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            {notesDirty ? (
              <button
                type="button"
                className="merchant-action-btn merchant-action-btn--reject merchant-action-btn--block"
                disabled={savingNotes}
                onClick={() => {
                  setSavingNotes(true);
                  void Promise.resolve(onSaveNotes(notes)).finally(() =>
                    setSavingNotes(false),
                  );
                }}
              >
                {savingNotes ? "Saving…" : "Save note"}
              </button>
            ) : null}
          </label>

          {panel === "decline" ? (
            <div className="merchant-confirm">
              <p className="merchant-confirm-text">
                Decline {reservation.customerName}&apos;s table for{" "}
                {formatDateLabel(reservation.date)} at {formatTimeLabel(reservation.time)}?
              </p>
              <label className="auth-field">
                <span className="auth-label">Reason (optional)</span>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Fully booked at that time"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="merchant-confirm-actions">
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--reject"
                  onClick={() => setPanel(null)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--danger"
                  disabled={busy}
                  onClick={() => {
                    void Promise.resolve(onAction("decline", { reason })).then((ok) => {
                      if (ok) setPanel(null);
                    });
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : panel === "suggest" ? (
            <div className="merchant-confirm">
              <p className="merchant-confirm-text">
                Propose a different slot. The guest gets a WhatsApp link and accepts or
                declines it on their reservation page — the table isn&apos;t held until
                they accept.
              </p>
              <ReservationSlotPicker
                slots={slots}
                date={suggestDate}
                time={suggestTime}
                onDateChange={setSuggestDate}
                onTimeChange={setSuggestTime}
              />
              <div className="merchant-confirm-actions">
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--reject"
                  onClick={() => setPanel(null)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--approve"
                  disabled={busy || !suggestDate || !suggestTime}
                  onClick={() => {
                    void Promise.resolve(
                      onSuggest({ date: suggestDate, time: suggestTime }),
                    ).then((ok) => {
                      if (ok) setPanel(null);
                    });
                  }}
                >
                  Send new time
                </button>
              </div>
            </div>
          ) : actions.length === 0 ? (
            <p className="merchant-field-hint resv-drawer-closed">
              This reservation is closed — no further action needed.
            </p>
          ) : (
            /* Grouped, not gridded: the outcome you'll pick most sits on its
               own line, the two ways a booking falls through share the next,
               and rescheduling closes. A flat grid left long labels wrapping
               onto two lines at uneven heights. */
            <div className="resv-drawer-controls">
              {actionGroups.primary.map(renderAction)}
              {actionGroups.negative.length > 0 ? (
                <div className="resv-drawer-control-pair">
                  {actionGroups.negative.map(renderAction)}
                </div>
              ) : null}
              {actionGroups.alternate.map(renderAction)}
            </div>
          )}
        </div>
      )}
    </BottomSheet>

    {/* Same picker the board and the queue use, so a table is chosen the same
        way wherever staff are standing. */}
    <AssignTableSheet
      open={tablePickerOpen}
      branchId={reservation?.branchId}
      partySize={reservation?.partySize ?? 1}
      guestName={reservation?.customerName ?? "guest"}
      purpose="assign"
      date={reservation?.date}
      time={reservation?.time}
      ignoreReservationId={reservation?.id}
      selectedTableId={reservation?.diningTableId ?? null}
      busy={assigningTable}
      onClose={() => setTablePickerOpen(false)}
      onConfirm={(tableId) => {
        if (!reservation) return;
        setAssigningTable(true);
        void assignReservationTable({
          reservationId: reservation.id,
          tableId,
        })
          .then((result) => {
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't assign table.");
              return;
            }
            onTableAssigned?.({
              diningTableId: tableId,
              tableNumber: result.tableNumber ?? null,
            });
            toast.success(
              result.tableNumber != null
                ? `Assigned Table ${result.tableNumber}`
                : "Table cleared",
            );
            setTablePickerOpen(false);
          })
          .finally(() => setAssigningTable(false));
      }}
    />
    </>
  );
}
