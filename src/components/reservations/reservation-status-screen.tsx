"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  Check,
  Clock3,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { FroqFooter } from "@/components/shared/froq-footer";
import {
  buildReservationTimeline,
  formatDateLabel,
  formatReservationNumber,
  formatTimeLabel,
  isOpenReservation,
  RESERVATION_STATUS_META,
} from "@/lib/merchant/reservations";
import {
  acceptSuggestedTime,
  cancelPublicReservation,
  getPublicReservation,
  type PublicReservation,
} from "@/app/r/actions";

interface ReservationStatusScreenProps {
  reservation: PublicReservation;
}

/** Logo stand-in when the restaurant hasn't uploaded one. */
function brandInitial(businessName: string) {
  const match = businessName.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

const STATUS_COPY: Record<
  PublicReservation["status"],
  { title: string; body: string }
> = {
  pending: {
    title: "Reservation pending",
    body: "We'll notify you on WhatsApp once the restaurant has reviewed your request.",
  },
  confirmed: {
    title: "Table confirmed",
    body: "See you then. We'll send a reminder before your reservation.",
  },
  declined: {
    title: "Reservation declined",
    body: "The restaurant couldn't take this booking.",
  },
  cancelled: {
    title: "Reservation cancelled",
    body: "This table is no longer held.",
  },
  completed: {
    title: "Thanks for dining with us",
    body: "Hope you enjoyed it — book again whenever you like.",
  },
  no_show: {
    title: "Marked as a no show",
    body: "The table wasn't claimed.",
  },
};

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

/**
 * The guest's reservation page — the single source of truth for a booking.
 * WhatsApp only ever links here; accepting a new time, cancelling and checking
 * status all happen on this page.
 */
export function ReservationStatusScreen({
  reservation: initial,
}: ReservationStatusScreenProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useBrandTheme(reservation.merchant.brandColor);

  const { token, status, merchant } = reservation;
  const proposed =
    reservation.suggestedDate && reservation.suggestedTime
      ? { date: reservation.suggestedDate, time: reservation.suggestedTime }
      : null;

  // Keep the page live while the booking is still open, so the restaurant's
  // decision shows up without the guest reloading.
  useEffect(() => {
    if (!isOpenReservation(status)) return;
    let cancelled = false;
    const sync = async () => {
      const result = await getPublicReservation(token);
      if (cancelled || !result.ok || !result.reservation) return;
      setReservation(result.reservation);
    };
    const id = window.setInterval(() => void sync(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, status]);

  const accept = useCallback(async () => {
    setBusy(true);
    try {
      const result = await acceptSuggestedTime(token);
      if (!result.ok || !result.reservation) {
        toast.error(result.error ?? "Couldn't confirm the new time.");
        return;
      }
      setReservation(result.reservation);
      toast.success("New time confirmed");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const cancel = useCallback(async () => {
    setBusy(true);
    try {
      const result = await cancelPublicReservation(token);
      if (!result.ok || !result.reservation) {
        toast.error(result.error ?? "Couldn't cancel your reservation.");
        return;
      }
      setReservation(result.reservation);
      setConfirmCancel(false);
      toast.success("Reservation cancelled");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const statusMeta = RESERVATION_STATUS_META[status];
  const copy = proposed
    ? {
        title: "New time proposed",
        body: `${merchant.businessName} can't take your original time. Accept the new slot below, or decline if it doesn't work.`,
      }
    : STATUS_COPY[status];
  const closed = !isOpenReservation(status);

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo" style={{ background: merchant.brandColor }}>
            {merchant.logoUrl ? (
              <Image
                src={merchant.logoUrl}
                alt={merchant.businessName}
                width={56}
                height={56}
                unoptimized
              />
            ) : (
              <span className="merchant-auth-logo-letter" aria-hidden="true">
                {brandInitial(merchant.businessName)}
              </span>
            )}
          </div>
          <h1 className="merchant-auth-brand">{merchant.businessName}</h1>
          <p className="merchant-auth-tag">
            Reservation {formatReservationNumber(reservation.number)}
          </p>
        </header>

        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-badge" aria-hidden="true">
              {proposed ? (
                <CalendarDays size={24} strokeWidth={2.2} color="#fff" />
              ) : status === "confirmed" || status === "completed" ? (
                <Check size={24} strokeWidth={2.4} color="#fff" />
              ) : status === "pending" ? (
                <Clock3 size={24} strokeWidth={2.2} color="#fff" />
              ) : (
                <X size={24} strokeWidth={2.4} color="#fff" />
              )}
            </div>
            <h2 className="auth-title">{copy.title}</h2>
            <p className="auth-sub">{copy.body}</p>
            <span className={`merchant-badge merchant-badge--${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          </div>

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
          </div>

          <div className="merchant-drawer-rows">
            <div className="profile-row">
              <div className="profile-row-icon">
                <Users size={18} strokeWidth={2.2} />
              </div>
              <div className="profile-row-copy">
                <div className="profile-row-label">Booked for</div>
                <div className="profile-row-value">{reservation.name}</div>
              </div>
            </div>

            {reservation.notes ? (
              <div className="profile-row">
                <div className="profile-row-icon">
                  <MessageSquare size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Your note</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {reservation.notes}
                  </div>
                </div>
              </div>
            ) : null}

            {status === "declined" && reservation.declineReason ? (
              <div className="profile-row">
                <div className="profile-row-icon">
                  <X size={18} strokeWidth={2.2} />
                </div>
                <div className="profile-row-copy">
                  <div className="profile-row-label">Reason</div>
                  <div className="profile-row-value profile-row-value--soft">
                    {reservation.declineReason}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {proposed ? (
            <div className="merchant-confirm">
              <p className="merchant-confirm-text">
                New time: {formatDateLabel(proposed.date)} at{" "}
                {formatTimeLabel(proposed.time)} for {reservation.partySize}{" "}
                {reservation.partySize === 1 ? "guest" : "guests"}.
              </p>
              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={busy}
                onClick={() => void accept()}
              >
                {busy ? "Confirming…" : "Accept new time"}
              </button>
              <button
                type="button"
                className="qjoin-leave"
                disabled={busy}
                onClick={() => void cancel()}
              >
                Decline new time
              </button>
            </div>
          ) : null}

          <div className="merchant-settings-group">
            <h3 className="merchant-settings-title">Timeline</h3>
            <div className="resv-timeline">
              {buildReservationTimeline(reservation).map((step, index, all) => (
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {status === "confirmed" && !proposed ? (
            confirmCancel ? (
              <div className="merchant-confirm">
                <p className="merchant-confirm-text">
                  Cancel your table for {formatDateLabel(reservation.date)} at{" "}
                  {formatTimeLabel(reservation.time)}?
                </p>
                <div className="merchant-confirm-actions">
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--reject"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--danger"
                    disabled={busy}
                    onClick={() => void cancel()}
                  >
                    {busy ? "Cancelling…" : "Cancel table"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="qjoin-leave"
                onClick={() => setConfirmCancel(true)}
              >
                Cancel reservation
              </button>
            )
          ) : null}

          {status === "pending" && !proposed ? (
            <p className="qjoin-hint" style={{ marginTop: 16 }}>
              <CalendarClock size={15} strokeWidth={2.2} />
              Keep this page handy — it always shows the latest status.
            </p>
          ) : null}

          {closed ? (
            <button
              type="button"
              className="qjoin-again"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => router.push(`/r/${merchant.slug}`)}
            >
              Book another table
            </button>
          ) : null}
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
