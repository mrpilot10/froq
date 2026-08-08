"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Clock3,
  MessageSquare,
  Minus,
  Pencil,
  Plus,
  Share2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { FroqFooter } from "@/components/shared/froq-footer";
import { FollowUs } from "@/components/loyalty/social-row";
import { BusinessContactRow } from "@/components/loyalty/business-contact-row";
import {
  ReservationDateField,
  ReservationTimeField,
} from "@/components/merchant/reservations/reservation-slot-picker";
import {
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
  resolveReservationPage,
  updatePublicReservation,
  type PublicReservation,
  type ReservationPageMerchant,
} from "@/app/r/actions";

interface ReservationStatusScreenProps {
  reservation: PublicReservation;
}

/** Logo stand-in when the restaurant hasn't uploaded one. */
function brandInitial(businessName: string) {
  const match = businessName.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

function guestInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

const STATUS_COPY: Record<
  PublicReservation["status"],
  { title: string; body: string }
> = {
  pending: {
    title: "Awaiting Approval",
    body: "We'll message you on WhatsApp once the restaurant reviews it.",
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

/** Pass colours track the outcome, reusing the queue ticket's status tints. */
const STATUS_TINT: Record<PublicReservation["status"], string> = {
  pending: "waiting",
  confirmed: "seated",
  declined: "left",
  cancelled: "left",
  completed: "seated",
  no_show: "left",
};

/**
 * The guest's reservation page — the single source of truth for a booking.
 * WhatsApp only ever links here; accepting a new time, sharing, changing and
 * cancelling all happen on this page.
 */
export function ReservationStatusScreen({
  reservation: initial,
}: ReservationStatusScreenProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [form, setForm] = useState<ReservationPageMerchant | null>(null);
  const [editDate, setEditDate] = useState(initial.date);
  const [editTime, setEditTime] = useState(initial.time);
  const [editParty, setEditParty] = useState(initial.partySize);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

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
      setModifyOpen(false);
      toast.success("Reservation cancelled");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const openModify = useCallback(async () => {
    setFormError("");
    setEditDate(reservation.date);
    setEditTime(reservation.time);
    setEditParty(reservation.partySize);
    setModifyOpen(true);
    if (form) return;
    setFormLoading(true);
    try {
      const resolved = await resolveReservationPage(merchant.slug);
      if (!resolved.ok) {
        setFormError("Couldn't load available times.");
        return;
      }
      setForm(resolved.merchant);
    } catch {
      setFormError("Couldn't load available times.");
    } finally {
      setFormLoading(false);
    }
  }, [reservation.date, reservation.time, reservation.partySize, form, merchant.slug]);

  const closeModify = useCallback(() => {
    if (busy) return;
    setModifyOpen(false);
    setFormError("");
  }, [busy]);

  const saveChanges = useCallback(async () => {
    if (!editTime) {
      setFormError("Pick a time.");
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const result = await updatePublicReservation({
        token,
        date: editDate,
        time: editTime,
        partySize: editParty,
      });
      if (!result.ok || !result.reservation) {
        setFormError(result.error ?? "Couldn't update your reservation.");
        return;
      }
      setReservation(result.reservation);
      setModifyOpen(false);
      toast.success("Reservation updated");
    } finally {
      setBusy(false);
    }
  }, [token, editDate, editTime, editParty]);

  const share = useCallback(async () => {
    const url = window.location.href;
    const text = `My table at ${merchant.businessName} — ${formatDateLabel(
      reservation.date,
    )} at ${formatTimeLabel(reservation.time)}`;
    // navigator.share needs a user gesture and a secure context; the copy
    // fallback covers desktop browsers and anyone who dismisses the sheet.
    if (navigator.share) {
      try {
        await navigator.share({ title: merchant.businessName, text, url });
        return;
      } catch {
        return; // Guest dismissed the share sheet — not an error worth a toast.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }, [merchant.businessName, reservation.date, reservation.time]);

  const statusMeta = RESERVATION_STATUS_META[status];
  const copy = proposed
    ? {
        title: "New time proposed",
        body: `${merchant.businessName} can't take your original time. Accept the new slot below, or decline it.`,
      }
    : STATUS_COPY[status];
  const open = isOpenReservation(status);

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo" style={{ background: merchant.brandColor }}>
            {merchant.logoUrl ? (
              <Image
                src={merchant.logoUrl}
                alt={merchant.businessName}
                width={88}
                height={88}
                unoptimized
              />
            ) : (
              <span className="merchant-auth-logo-letter" aria-hidden="true">
                {brandInitial(merchant.businessName)}
              </span>
            )}
          </div>
          <h1 className="merchant-auth-brand">{merchant.businessName}</h1>
          <BusinessContactRow
            phone={merchant.phone}
            address={merchant.address}
            googleMapsUrl={merchant.googleMapsUrl}
            website={merchant.socialLinks.website}
          />
        </header>

        <div className="pass-stack">
          <div className="pass-shadow-card s2" />
          <div className="pass-shadow-card s1" />

          <div className="pass rpass">
            <div className="pass-top">
              <div className="pass-brand">
                <div className="pass-brand-mark">
                  {merchant.logoUrl ? (
                    <Image
                      src={merchant.logoUrl}
                      alt={merchant.businessName}
                      width={32}
                      height={32}
                      unoptimized
                      className="pass-brand-logo-img"
                    />
                  ) : (
                    <span aria-hidden="true">
                      {brandInitial(merchant.businessName)}
                    </span>
                  )}
                </div>
                <div className="pass-brand-name">{merchant.businessName}</div>
              </div>
              <span className={`qpass-status qpass-status--${STATUS_TINT[status]}`}>
                {statusMeta.label}
              </span>
            </div>

            {/* Pending / confirmed / completed / cancelled: icon above copy,
                both centered — reads as a result, not a form. Declined +
                proposed-time keep the side-by-side row. */}
            {status === "pending" ||
            status === "confirmed" ||
            status === "completed" ||
            status === "cancelled" ? (
              <div className="rpass-outcome">
                <div className="rpass-icon rpass-icon--round" aria-hidden="true">
                  {status === "pending" ? (
                    <Clock3 size={28} strokeWidth={2} />
                  ) : status === "cancelled" ? (
                    <X size={28} strokeWidth={2.4} />
                  ) : (
                    <Check size={28} strokeWidth={2.6} />
                  )}
                </div>
                <h2 className="pass-title">{copy.title}</h2>
                <p className="pass-subtitle">{copy.body}</p>
                {(status === "confirmed" || status === "completed") &&
                reservation.aiMenuEnabled &&
                reservation.customerPublicToken ? (
                  <a
                    className="qjoin-ai-menu"
                    href={`/m/${encodeURIComponent(reservation.customerPublicToken)}`}
                    style={{ marginTop: 16 }}
                  >
                    <UtensilsCrossed size={16} strokeWidth={2.3} aria-hidden="true" />
                    View our AI menu
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="pass-headline">
                <div className="pass-headline-text">
                  <h2 className="pass-title">{copy.title}</h2>
                  <p className="pass-subtitle">{copy.body}</p>
                </div>
                <div className="rpass-icon" aria-hidden="true">
                  {proposed ? (
                    <CalendarDays size={30} strokeWidth={2} />
                  ) : (
                    <X size={30} strokeWidth={2.4} />
                  )}
                </div>
              </div>
            )}

            <div className="qpass-stats rpass-stats">
              <div className="qpass-stat">
                <span className="rpass-stat-value">
                  {formatDateLabel(reservation.date)}
                </span>
                <span className="qpass-stat-label">Date</span>
              </div>
              <div className="qpass-stat">
                <span className="rpass-stat-value">
                  {formatTimeLabel(reservation.time)}
                </span>
                <span className="qpass-stat-label">Time</span>
              </div>
              <div className="qpass-stat">
                <span className="rpass-stat-value">{reservation.partySize}</span>
                <span className="qpass-stat-label">
                  {reservation.partySize === 1 ? "Guest" : "Guests"}
                </span>
              </div>
              {reservation.tableNumber != null ? (
                <div className="qpass-stat">
                  <span className="rpass-stat-value">{reservation.tableNumber}</span>
                  <span className="qpass-stat-label">Table</span>
                </div>
              ) : null}
            </div>

            <div className="pass-divider" />

            <div className="pass-bottom">
              <div>
                <div className="pass-bottom-label">Reservation</div>
                <div className="pass-bottom-value">
                  {formatReservationNumber(reservation.number)}
                </div>
              </div>
              <div className="pass-bottom-r">
                <div className="pass-reward-caption">
                  <div className="pass-customer-name">{reservation.name}</div>
                </div>
                <div className="pass-avatar">{guestInitials(reservation.name)}</div>
              </div>
            </div>
          </div>
        </div>

        {open && !proposed ? (
          <div className="rpass-actions">
            <button
              type="button"
              className="rpass-action rpass-action--share"
              onClick={() => void share()}
              aria-label="Share reservation"
            >
              <Share2 size={18} strokeWidth={2.2} />
              <span>Share</span>
            </button>
            <button
              type="button"
              className="rpass-action rpass-action--primary"
              onClick={() => void openModify()}
            >
              <Pencil size={16} strokeWidth={2.3} />
              Modify booking
            </button>
          </div>
        ) : null}

        {proposed ? (
          <div className="auth-card rpass-panel">
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

        <BottomSheet open={modifyOpen && open && !proposed} onClose={closeModify} labelledBy="rpass-modify-title">
          <div className="thanks-head">
            <div className="thanks-badge" aria-hidden="true">
              <Pencil size={24} strokeWidth={2.4} color="#fff" />
            </div>
            <h3 id="rpass-modify-title" className="thanks-title">
              Modify booking
            </h3>
            <p className="thanks-sub">
              Update your guests, date, or time. Changes keep this same reservation.
            </p>
          </div>

          <div className="rpass-modify resv-form">
            {formLoading || !form ? (
              <p className="rpass-modify-copy">
                {formError || "Loading times…"}
              </p>
            ) : (
              <>
                <div className="resv-duo">
                  <div className="auth-field">
                    <span className="resv-label-row">
                      <span className="auth-label">Guests</span>
                      <span className="resv-cap">Max {form.maxPartySize}</span>
                    </span>
                    <div className="resv-stepper">
                      <button
                        type="button"
                        className="resv-stepper-btn"
                        aria-label="Fewer guests"
                        onClick={() => setEditParty((n) => Math.max(1, n - 1))}
                        disabled={editParty <= 1 || busy}
                      >
                        <Minus size={15} strokeWidth={2.6} />
                      </button>
                      <span className="resv-stepper-value">{editParty}</span>
                      <button
                        type="button"
                        className="resv-stepper-btn"
                        aria-label="More guests"
                        onClick={() =>
                          setEditParty((n) => Math.min(form.maxPartySize, n + 1))
                        }
                        disabled={editParty >= form.maxPartySize || busy}
                      >
                        <Plus size={15} strokeWidth={2.6} />
                      </button>
                    </div>
                  </div>

                  <ReservationDateField
                    date={editDate}
                    minDate={form.minDate}
                    maxDate={form.maxDate}
                    onDateChange={(next) => {
                      setEditDate(next);
                      setFormError("");
                    }}
                  />
                </div>

                <ReservationTimeField
                  slots={form.slots}
                  date={editDate}
                  time={editTime}
                  hidePastToday
                  onTimeChange={(next) => {
                    setEditTime(next);
                    setFormError("");
                  }}
                />

                {formError ? (
                  <p className="auth-error" role="alert">
                    {formError}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="cta-btn auth-submit"
                  disabled={busy || !editTime}
                  onClick={() => void saveChanges()}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </>
            )}

            <button
              type="button"
              className="rpass-modify-cancel"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancel table
            </button>
          </div>
        </BottomSheet>

        {reservation.notes || (status === "declined" && reservation.declineReason) ? (
          <div className="auth-card rpass-panel">
            <div className="merchant-drawer-rows">
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
          </div>
        ) : null}

        {!open ? (
          <button
            type="button"
            className="cta-btn"
            onClick={() => router.push(`/r/${merchant.slug}`)}
          >
            Book another table
          </button>
        ) : null}

        <FollowUs
          links={merchant.socialLinks}
          className="follow-us follow-us--footer"
        />
        <FroqFooter />
      </div>
    </div>
  );
}
