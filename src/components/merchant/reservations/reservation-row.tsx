"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import {
  formatDateLabel,
  formatRelativeTime,
  formatReservationNumber,
  formatTimeLabel,
  hasOpenSuggestion,
  notifyFailureText,
  RESERVATION_ROW_ACTION_LABELS,
  RESERVATION_STATUS_META,
  rowActionsFor,
  type Reservation,
  type ReservationActionId,
} from "@/lib/merchant/reservations";

/** Colour tone for each row chip: go, stop, or "let's talk about the time". */
const ACTION_TONE: Record<ReservationActionId, "go" | "stop" | "alt"> = {
  confirm: "go",
  complete: "go",
  decline: "stop",
  cancel: "stop",
  no_show: "stop",
  suggest: "alt",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface ReservationRowProps {
  reservation: Reservation;
  busy?: boolean;
  onView: () => void;
  /** Omitted on read-only lists (history), which never act on a booking. */
  onAction?: (action: ReservationActionId) => void;
  onSuggest?: () => void;
}

/**
 * One booking in a list. Shared by the dashboard and history so both read the
 * same, and so every status keeps the same row height whether or not it has
 * quick actions.
 */
export function ReservationRow({
  reservation,
  busy = false,
  onView,
  onAction,
  onSuggest,
}: ReservationRowProps) {
  const status = RESERVATION_STATUS_META[reservation.status];
  const actions = onAction ? rowActionsFor(reservation.status) : [];
  const notifyFailure = reservation.notifyFailure
    ? notifyFailureText(reservation.notifyFailure)
    : null;

  return (
    <div className="panel-card resv-row">
      <div className="resv-row-main">
        {/* The whole row body opens the drawer; quick actions sit outside it so
            action buttons are never nested inside the row button. */}
        <button
          type="button"
          className="resv-row-open"
          aria-label={`View reservation ${formatReservationNumber(reservation.number)}`}
          onClick={onView}
        >
          <span className="queue-token">{formatReservationNumber(reservation.number)}</span>
          <span className="merchant-avatar">{initials(reservation.customerName)}</span>
          <span className="resv-row-copy">
            <span className="resv-row-titlerow">
              <span className="resv-row-name">{reservation.customerName}</span>
              <span className={`merchant-badge merchant-badge--${status.cls}`}>
                {status.label}
              </span>
              {notifyFailure ? (
                <span className="resv-row-unnotified" title={notifyFailure.detail}>
                  <AlertTriangle size={12} strokeWidth={2.4} aria-hidden="true" />
                  {notifyFailure.chip}
                </span>
              ) : null}
            </span>
            {/* Plain text rather than icon-per-fact, so it wraps cleanly on a
                phone instead of stranding icons and separators on their own. */}
            <span className="resv-row-meta">
              {formatDateLabel(reservation.date)} · {formatTimeLabel(reservation.time)} ·{" "}
              {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
            </span>
            {hasOpenSuggestion(reservation) ? (
              <span className="resv-row-meta resv-row-meta--proposed">
                Proposed {formatDateLabel(reservation.suggestedDate!)}{" "}
                {formatTimeLabel(reservation.suggestedTime!)} — waiting on the guest
              </span>
            ) : null}
          </span>
        </button>

        <div className="resv-row-trailing">
          {actions.length > 0 ? (
            <div className="resv-row-quick">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`resv-act resv-act--${ACTION_TONE[action]}`}
                  disabled={busy}
                  onClick={() =>
                    action === "suggest" ? onSuggest?.() : onAction?.(action)
                  }
                >
                  {RESERVATION_ROW_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          ) : null}
          <span className="resv-row-created">
            {formatRelativeTime(reservation.createdAtMs)}
          </span>
          <ChevronRight
            size={18}
            strokeWidth={2.2}
            className="merchant-list-arrow"
            aria-hidden="true"
          />
        </div>
      </div>

      {reservation.notes ? (
        <p className="resv-note-preview">{reservation.notes}</p>
      ) : null}
    </div>
  );
}
