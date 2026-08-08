"use client";

import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import {
  formatDateLabel,
  formatReservationNumber,
  formatTimeLabel,
  hasOpenSuggestion,
  notifyFailureText,
  RESERVATION_ROW_ACTION_LABELS,
  RESERVATION_STATUS_META,
  rowActionsFor,
  splitTimeLabel,
  type Reservation,
  type ReservationActionId,
} from "@/lib/merchant/reservations";

/** Booking actions borrow the queue's action tones so both boards read alike. */
const ACTION_CLASS: Record<ReservationActionId, string> = {
  confirm: "queue-act queue-act--served",
  complete: "queue-act queue-act--served",
  decline: "queue-act queue-act--left",
  cancel: "queue-act queue-act--left",
  no_show: "queue-act queue-act--left",
  suggest: "queue-act queue-act--suggest",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function ActionIcon({ action }: { action: ReservationActionId }) {
  if (action === "confirm" || action === "complete") {
    return <Check size={14} strokeWidth={2.3} />;
  }
  if (action === "suggest") return <CalendarDays size={14} strokeWidth={2.3} />;
  return <X size={14} strokeWidth={2.3} />;
}

interface ReservationRowProps {
  reservation: Reservation;
  busy?: boolean;
  /**
   * History already groups by day and repeats one guest down the list, so that
   * variant drops the avatar and carries the outcome in the column rail.
   */
  variant?: "board" | "history";
  onView: () => void;
  /** Omitted on read-only lists (history), which never act on a booking. */
  onAction?: (action: ReservationActionId) => void;
  onSuggest?: () => void;
}

/**
 * A booking on the board, built from the queue guest card. The queue's position
 * token becomes a ticket stub — slot time over booking ref — because the time is
 * what staff scan a booking list for; the ref only matters once they've found it.
 */
export function ReservationRow({
  reservation,
  busy = false,
  variant = "board",
  onView,
  onAction,
  onSuggest,
}: ReservationRowProps) {
  const status = RESERVATION_STATUS_META[reservation.status];
  const actions = onAction ? rowActionsFor(reservation.status) : [];
  const notifyFailure = reservation.notifyFailure
    ? notifyFailureText(reservation.notifyFailure)
    : null;
  const hasActions = actions.length > 0;
  const isHistory = variant === "history";
  const slot = splitTimeLabel(reservation.time);
  const ref = formatReservationNumber(reservation.number);

  return (
    <div
      className={`panel-card queue-entry resv-entry resv-entry--${status.cls}${
        isHistory ? " resv-entry--history" : ""
      }${hasActions ? " has-actions" : ""}`}
    >
      <div className="queue-entry-main">
        <button
          type="button"
          className="queue-entry-open"
          aria-label={`View reservation ${ref} for ${reservation.customerName}`}
          onClick={onView}
        >
          <span className="resv-stub">
            <span className="resv-stub-slot">
              <span className="resv-stub-time">{slot.value}</span>
              <span className="resv-stub-suffix">{slot.suffix}</span>
            </span>
            <span className="resv-stub-ref">{ref}</span>
          </span>
          {isHistory ? null : (
            <span className="merchant-avatar">
              {initials(reservation.customerName)}
            </span>
          )}
          <span className="queue-entry-copy">
            <span className="merchant-list-title">
              <span className="resv-entry-name">{reservation.customerName}</span>
              {isHistory ? null : (
                <span className={`merchant-badge merchant-badge--${status.cls}`}>
                  {status.label}
                </span>
              )}
              {notifyFailure ? (
                <span className="resv-row-unnotified" title={notifyFailure.detail}>
                  <AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />
                  {notifyFailure.chip}
                </span>
              ) : null}
            </span>
            {hasOpenSuggestion(reservation) ? (
              <span className="queue-entry-meta resv-entry-proposed">
                Proposed {formatDateLabel(reservation.suggestedDate!)}{" "}
                {formatTimeLabel(reservation.suggestedTime!)} — waiting on guest
              </span>
            ) : null}
            {reservation.notes ? (
              <span className="queue-entry-meta resv-entry-note">
                {reservation.notes}
              </span>
            ) : null}
          </span>

          {/* Party and table sit in fixed columns rather than trailing the
              guest's name, so they land on the same vertical lines down the
              list — and the row's dead space between name and actions goes. */}
          <span className="resv-entry-cols">
            <span className="resv-col resv-col--party">
              {reservation.partySize}{" "}
              {reservation.partySize === 1 ? "guest" : "guests"}
            </span>
            <span className="resv-col resv-col--table">
              {reservation.tableNumber != null ? (
                <span className="resv-fact-table">
                  Table {reservation.tableNumber}
                </span>
              ) : (
                <span className="resv-col-empty">No table</span>
              )}
            </span>
            {isHistory ? (
              <span className="resv-col resv-col--status">
                <span className={`merchant-badge merchant-badge--${status.cls}`}>
                  {status.label}
                </span>
              </span>
            ) : null}
          </span>

          <ChevronRight
            size={18}
            strokeWidth={2.2}
            className="merchant-list-arrow queue-entry-chevron"
            aria-hidden="true"
          />
        </button>

        {hasActions ? (
          <div className="queue-entry-trailing resv-entry-trailing">
            <div className="queue-entry-actions resv-entry-actions">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={ACTION_CLASS[action]}
                  disabled={busy}
                  onClick={() =>
                    action === "suggest" ? onSuggest?.() : onAction?.(action)
                  }
                >
                  <ActionIcon action={action} />
                  {RESERVATION_ROW_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
