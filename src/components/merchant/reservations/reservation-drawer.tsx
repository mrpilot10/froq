"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  MessageSquare,
  Phone,
  Users,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { fetchReservationEvents } from "@/app/merchant/reservation-actions";
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

interface ReservationDrawerProps {
  reservation: Reservation | null;
  /** Bookable slots from the merchant's reservation settings. */
  slots: string[];
  busy?: boolean;
  onClose: () => void;
  onAction: (
    action: ReservationActionId,
    input?: { reason?: string },
  ) => Promise<boolean> | boolean;
  onSuggest: (input: { date: string; time: string }) => Promise<boolean> | boolean;
  onSaveNotes: (merchantNotes: string) => Promise<boolean> | boolean;
}

type Panel = "decline" | "suggest" | null;

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
}: ReservationDrawerProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [suggestDate, setSuggestDate] = useState("");
  const [suggestTime, setSuggestTime] = useState("");
  const [events, setEvents] = useState<ReservationEvent[]>([]);

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

  return (
    <BottomSheet
      open={reservation !== null}
      onClose={onClose}
      labelledBy="reservation-drawer-title"
      className="merchant-theme"
    >
      {reservation && status && (
        <div className="merchant-drawer">
          <div className="merchant-drawer-head">
            <div className="merchant-avatar merchant-avatar--lg">
              {formatReservationNumber(reservation.number).replace("#", "")}
            </div>
            <div className="merchant-drawer-head-copy">
              <h3 id="reservation-drawer-title" className="merchant-drawer-name">
                {reservation.customerName}
              </h3>
              <span className={`merchant-badge merchant-badge--${status.cls}`}>
                {status.label}
              </span>
            </div>
          </div>

          {notifyFailure ? (
            <div className="resv-drawer-alert" role="status">
              <AlertTriangle size={16} strokeWidth={2.3} aria-hidden="true" />
              <div>
                <strong>{notifyFailure.chip}</strong>
                <p>{notifyFailure.detail}</p>
              </div>
            </div>
          ) : null}

          <div className="merchant-drawer-stats">
            <div className="merchant-drawer-stat merchant-drawer-stat--accent">
              <span className="merchant-drawer-stat-label">Date</span>
              <span className="merchant-drawer-stat-value">
                {formatDateLabel(reservation.date)}
              </span>
            </div>
            <div className="merchant-drawer-stat">
              <span className="merchant-drawer-stat-label">Time</span>
              <span className="merchant-drawer-stat-value">
                {formatTimeLabel(reservation.time)}
              </span>
            </div>
            <div className="merchant-drawer-stat">
              <span className="merchant-drawer-stat-label">Guests</span>
              <span className="merchant-drawer-stat-value">{reservation.partySize}</span>
            </div>
            <div className="merchant-drawer-stat">
              <span className="merchant-drawer-stat-label">Booking</span>
              <span className="merchant-drawer-stat-value">
                {formatReservationNumber(reservation.number)}
              </span>
            </div>
          </div>

          <div className="merchant-drawer-rows">
            <a
              className="profile-row"
              href={`tel:${reservation.customerPhone.replace(/[^\d+]/g, "")}`}
            >
              <div className="profile-row-icon">
                <Phone size={18} strokeWidth={2.2} />
              </div>
              <div className="profile-row-copy">
                <div className="profile-row-label">Phone</div>
                <div className="profile-row-value">
                  {formatPhoneDisplay(reservation.customerPhone)}
                </div>
              </div>
            </a>

            <div className="profile-row">
              <div className="profile-row-icon">
                <MessageSquare size={18} strokeWidth={2.2} />
              </div>
              <div className="profile-row-copy">
                <div className="profile-row-label">WhatsApp</div>
                <div className="profile-row-value">
                  {reservation.customerWhatsapp
                    ? formatPhoneDisplay(reservation.customerWhatsapp)
                    : "Not available"}
                </div>
              </div>
            </div>

            {pendingSuggestion ? (
              <div className="profile-row">
                <div className="profile-row-icon">
                  <CalendarDays size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Proposed time</div>
                  <div className="profile-row-value">
                    {formatDateLabel(reservation.suggestedDate!)} at{" "}
                    {formatTimeLabel(reservation.suggestedTime!)}
                  </div>
                  <div className="profile-row-value profile-row-value--soft">
                    Waiting for the guest to accept on their reservation page.
                  </div>
                </div>
              </div>
            ) : null}

            {reservation.notes ? (
              <div className="profile-row">
                <div className="profile-row-icon">
                  <Users size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Guest note</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {reservation.notes}
                  </div>
                </div>
              </div>
            ) : null}

            {reservation.declineReason ? (
              <div className="profile-row">
                <div className="profile-row-icon">
                  <X size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Decline reason</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {reservation.declineReason}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="merchant-settings-group">
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

          <label className="auth-field">
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
                className="merchant-action-btn merchant-action-btn--reject"
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
          ) : (
            <div className="merchant-drawer-actions merchant-drawer-actions--stack">
              {actions.length === 0 ? (
                <p className="merchant-field-hint" style={{ margin: 0 }}>
                  This reservation is closed — no further action needed.
                </p>
              ) : (
                <div className="resv-row-actions">
                  {actions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={`merchant-action-btn ${
                        action === "confirm" || action === "complete"
                          ? "merchant-action-btn--approve"
                          : action === "decline"
                            ? "merchant-action-btn--danger"
                            : "merchant-action-btn--reject"
                      }`}
                      disabled={busy}
                      onClick={() => void runAction(action)}
                    >
                      {action === "confirm" || action === "complete" ? (
                        <Check size={16} strokeWidth={2.3} />
                      ) : action === "suggest" ? (
                        <CalendarDays size={16} strokeWidth={2.3} />
                      ) : (
                        <X size={16} strokeWidth={2.3} />
                      )}
                      {RESERVATION_ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
