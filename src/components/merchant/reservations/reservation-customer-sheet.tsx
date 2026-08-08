"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import {
  buildReservationTimeline,
  formatDateLabel,
  formatReservationNumber,
  formatTimeLabel,
  reservationStartMs,
  RESERVATION_STATUS_META,
  splitTimeLabel,
  timelineActorLabel,
  timelineActors,
  type Reservation,
  type ReservationEvent,
} from "@/lib/merchant/reservations";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";
import {
  fetchReservationCustomerBookings,
  fetchReservationEvents,
} from "@/app/merchant/reservation-actions";
import { updateCustomerMerchantNotes } from "@/app/merchant/actions";

interface ReservationCustomerSheetProps {
  customer: UnifiedCustomer | null;
  branchId: string | null;
  onClose: () => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function timelineTime(atMs: number | null) {
  if (atMs == null) return "";
  return new Date(atMs).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Reservations → Customers drill-down: a guest's rolled-up booking record, the
 * list of every booking behind it, and a per-booking timeline one level deeper.
 */
export function ReservationCustomerSheet({
  customer,
  branchId,
  onClose,
}: ReservationCustomerSheetProps) {
  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="rcust-sheet-name"
      className="merchant-theme"
    >
      {customer ? (
        <ReservationCustomerSheetBody
          key={`${customer.key}:${branchId ?? "all"}`}
          customer={customer}
          branchId={branchId}
        />
      ) : null}
    </BottomSheet>
  );
}

function ReservationCustomerSheetBody({
  customer,
  branchId,
}: {
  customer: UnifiedCustomer;
  branchId: string | null;
}) {
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(customer.customerId);
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(customer.email);
  const [savedNotes, setSavedNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [events, setEvents] = useState<ReservationEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchReservationCustomerBookings({
      customerId: customer.customerId,
      phone: customer.phone,
      branchId,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Could not load bookings.");
        return;
      }
      setBookings(result.bookings);
      setCustomerId(result.customerId);
      if (result.email) setResolvedEmail(result.email);
      setSavedNotes(result.merchantNotes);
      setNotes(result.merchantNotes);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.customerId, customer.phone, branchId]);

  useEffect(() => {
    if (!selectedBookingId) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    setEvents(null);
    void fetchReservationEvents({ reservationId: selectedBookingId }).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          toast.error(result.error ?? "Could not load booking.");
          setSelectedBookingId(null);
          return;
        }
        setEvents(result.events);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedBookingId]);

  const stats = customer.reservation;
  const email = resolvedEmail;
  const selectedBooking =
    bookings.find((row) => row.id === selectedBookingId) ?? null;
  const lastBookedMs =
    bookings[0] != null
      ? reservationStartMs(bookings[0].date, bookings[0].time)
      : (stats?.lastBookedMs ?? null);
  const notesDirty = Boolean(customerId) && notes.trim() !== savedNotes.trim();

  const saveNotes = () => {
    if (!customerId) return;
    setSavingNotes(true);
    void updateCustomerMerchantNotes(customerId, notes)
      .then((result) => {
        if (result.ok) {
          toast.success("Note saved");
          setSavedNotes(notes.trim());
        } else {
          toast.error(result.error ?? "Could not save note");
        }
      })
      .finally(() => setSavingNotes(false));
  };

  if (selectedBookingId && selectedBooking) {
    const status = RESERVATION_STATUS_META[selectedBooking.status];
    const timeline = buildReservationTimeline(selectedBooking);
    const actors = events ? timelineActors(events) : {};
    const detailLoading = events === null;

    return (
      <div className="merchant-drawer">
        <button
          type="button"
          className="qhist-session-back"
          onClick={() => {
            setSelectedBookingId(null);
            setEvents(null);
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.6} aria-hidden />
          {customer.name}
        </button>

        <div className="merchant-drawer-head">
          <div className="merchant-drawer-head-copy">
            <h3 id="rcust-sheet-name" className="merchant-drawer-name">
              {formatReservationNumber(selectedBooking.number)}
            </h3>
            <p className="qhist-session-sheet-sub">
              <span className={`merchant-badge merchant-badge--${status.cls}`}>
                {status.label}
              </span>
              {` · ${formatDateLabel(selectedBooking.date)} · ${formatTimeLabel(selectedBooking.time)} · ${selectedBooking.partySize} guests`}
            </p>
          </div>
        </div>

        <div className="merchant-settings-group">
          <h3 className="merchant-settings-title">Timeline</h3>
          {detailLoading ? (
            <div className="resv-timeline" aria-busy="true">
              {[0, 1, 2].map((index) => (
                <div key={index} className="resv-timeline-step is-done">
                  <div className="resv-timeline-rail">
                    <span className="sk" style={{ width: 22, height: 22, borderRadius: 999 }} />
                    {index < 2 ? (
                      <span className="sk" style={{ width: 2, flex: 1, minHeight: 14 }} />
                    ) : null}
                  </div>
                  <div className="resv-timeline-copy">
                    <div className="sk sk-line" style={{ width: 120 }} />
                    <div className="sk sk-line" style={{ width: 90, marginTop: 6 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Same rail as the booking drawer — it's the same timeline, just
               reached from the guest instead of the board. */
            <div className="resv-timeline">
              {timeline.map((step, index) => {
                const by = step.done ? timelineActorLabel(actors[step.id]) : null;
                return (
                  <div
                    key={step.id}
                    className={`resv-timeline-step${step.done ? " is-done" : ""}`}
                  >
                    <div className="resv-timeline-rail">
                      <span className="resv-timeline-dot" aria-hidden>
                        {step.done ? (
                          <Check size={12} strokeWidth={3} />
                        ) : (
                          <Clock3 size={12} strokeWidth={2.6} />
                        )}
                      </span>
                      {index < timeline.length - 1 ? (
                        <span className="resv-timeline-line" aria-hidden />
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
          )}
        </div>
      </div>
    );
  }

  const lastStatus = stats?.lastStatus
    ? RESERVATION_STATUS_META[stats.lastStatus]
    : null;

  return (
    <div className="merchant-drawer">
      <div className="qcust-head">
        <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
          {getInitials(customer.name)}
        </div>
        <div className="qcust-head-copy">
          <h3 id="rcust-sheet-name" className="qcust-head-name">
            {customer.name}
          </h3>
          <p className="qcust-head-meta">
            {lastStatus ? (
              <span className={`merchant-badge merchant-badge--${lastStatus.cls}`}>
                {lastStatus.label}
              </span>
            ) : (
              <span>Reservation guest</span>
            )}
            {lastBookedMs != null ? (
              <span>
                Last booked{" "}
                {new Date(lastBookedMs).toLocaleDateString([], {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="qcust-stats" aria-label="Reservation metrics">
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.bookings ?? 0}</span>
          <span className="qcust-stat-label">Bookings</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.completed ?? 0}</span>
          <span className="qcust-stat-label">Completed</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.noShows ?? 0}</span>
          <span className="qcust-stat-label">No-shows</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.guests ?? 0}</span>
          <span className="qcust-stat-label">Guests</span>
        </div>
      </div>

      <div className="qcust-contact">
        <a className="qcust-contact-row" href={`tel:${customer.phone}`}>
          <span className="qcust-contact-icon" aria-hidden>
            <Phone size={15} strokeWidth={2.3} />
          </span>
          <span className="qcust-contact-copy">
            <span className="qcust-contact-label">Mobile</span>
            <span className="qcust-contact-value">
              {formatPhoneDisplay(customer.phone)}
            </span>
          </span>
        </a>

        {email ? (
          <a className="qcust-contact-row" href={`mailto:${email}`}>
            <span className="qcust-contact-icon" aria-hidden>
              <Mail size={15} strokeWidth={2.3} />
            </span>
            <span className="qcust-contact-copy">
              <span className="qcust-contact-label">Email</span>
              <span className="qcust-contact-value">{email}</span>
            </span>
          </a>
        ) : loading ? null : (
          <div className="qcust-contact-row is-empty">
            <span className="qcust-contact-icon" aria-hidden>
              <Mail size={15} strokeWidth={2.3} />
            </span>
            <span className="qcust-contact-copy">
              <span className="qcust-contact-label">Email</span>
              <span className="qcust-contact-value">Not provided</span>
            </span>
          </div>
        )}
      </div>

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">
          Booking history{" "}
          {!loading && bookings.length > 0 ? (
            <span className="qcust-visit-count">{bookings.length}</span>
          ) : null}
        </h3>

        {loading ? (
          <div className="rcust-booking-list" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rcust-booking-row">
                <span className="sk" style={{ width: 50, height: 46, borderRadius: 11 }} />
                <div className="rcust-booking-copy">
                  <div className="sk sk-line" style={{ width: 90 }} />
                  <div className="sk sk-line" style={{ width: 140, marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="cust-timeline-empty">{error}</p>
        ) : bookings.length === 0 ? (
          <p className="cust-timeline-empty">No bookings recorded</p>
        ) : (
          <ul className="rcust-booking-list">
            {bookings.map((booking) => {
              const status = RESERVATION_STATUS_META[booking.status];
              const slot = splitTimeLabel(booking.time);
              const ref = formatReservationNumber(booking.number);
              return (
                <li key={booking.id}>
                  <button
                    type="button"
                    className={`rcust-booking-row rcust-booking-row--${status.cls}`}
                    onClick={() => setSelectedBookingId(booking.id)}
                    aria-label={`Open booking ${ref}`}
                  >
                    <span className="resv-stub">
                      <span className="resv-stub-slot">
                        <span className="resv-stub-time">{slot.value}</span>
                        <span className="resv-stub-suffix">{slot.suffix}</span>
                      </span>
                      <span className="resv-stub-ref">{ref}</span>
                    </span>
                    <span className="rcust-booking-copy">
                      <span className="rcust-booking-title">
                        <span
                          className={`merchant-badge merchant-badge--${status.cls}`}
                        >
                          {status.label}
                        </span>
                      </span>
                      <span className="rcust-booking-facts">
                        <span>{formatDateLabel(booking.date)}</span>
                        <span>
                          {booking.partySize}{" "}
                          {booking.partySize === 1 ? "guest" : "guests"}
                        </span>
                        {booking.notes ? (
                          <span className="rcust-booking-note">{booking.notes}</span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      strokeWidth={2.4}
                      className="rcust-booking-chevron"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="auth-field">
        <span className="auth-label">Merchant notes</span>
        <textarea
          className="auth-input merchant-textarea"
          rows={2}
          placeholder={
            customerId
              ? "Private note — regular, prefers window seat…"
              : "Notes unavailable for guests without a customer profile"
          }
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          disabled={loading || !customerId}
        />
        {notesDirty ? (
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            disabled={savingNotes}
            onClick={saveNotes}
          >
            {savingNotes ? "Saving…" : "Save note"}
          </button>
        ) : null}
      </label>
    </div>
  );
}
