"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarClock, Minus, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { isValidPhone } from "@/lib/auth/format";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { FroqFooter } from "@/components/shared/froq-footer";
import { ReservationSlotPicker } from "@/components/merchant/reservations/reservation-slot-picker";
import { reservationPath } from "@/lib/reservations/link";
import { requestReservation, type ReservationPageMerchant } from "@/app/r/actions";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";

interface ReservationRequestScreenProps {
  merchant: ReservationPageMerchant;
}

/** Logo stand-in when the restaurant hasn't uploaded one. */
function brandInitial(businessName: string) {
  const match = businessName.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

/** Restaurant identity, shared by the form and the paused notice. */
function BrandHeader({ merchant }: ReservationRequestScreenProps) {
  return (
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
        {merchant.description.trim() ||
          (merchant.paused ? "Table reservations" : "Request a table in a few taps")}
      </p>
    </header>
  );
}

/**
 * Public booking form. On submit the guest is handed straight to their own
 * reservation page, which owns every status and action from then on.
 */
export function ReservationRequestScreen({ merchant }: ReservationRequestScreenProps) {
  useBrandTheme(merchant.brandColor);
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(merchant.minDate);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const captcha = useTurnstile({ action: "reservation-request" });

  const submit = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!time) {
      setError("Pick a time for your table.");
      return;
    }
    if (!captcha.ready) {
      setError(captcha.blockedMessage);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const result = await requestReservation({
        slug: merchant.slug,
        name: name.trim(),
        phone,
        partySize,
        date,
        time,
        notes: notes.trim() || undefined,
        captchaToken: captcha.token ?? undefined,
      });
      captcha.reset();
      if (!result.ok || !result.token) {
        setError(result.error ?? "Couldn't send your request.");
        return;
      }
      toast.success("Reservation requested");
      router.replace(reservationPath(result.token));
    } catch {
      setError("Couldn't send your request. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [name, phone, time, date, partySize, notes, merchant.slug, router, captcha]);

  // Bookings stopped by the restaurant: keep the branding, drop the form so
  // nobody fills it in only to be turned away on submit.
  if (merchant.paused) {
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen auth-screen">
          <BrandHeader merchant={merchant} />

          <div className="auth-card">
            <div className="auth-head">
              <div className="auth-badge" aria-hidden="true">
                <CalendarClock size={24} strokeWidth={2} color="#fff" />
              </div>
              <h2 className="auth-title">Bookings are closed</h2>
              <p className="auth-sub">
                {`${merchant.businessName} isn’t taking online reservations right now. Please check back later, or call the restaurant.`}
              </p>
            </div>
          </div>

          <FroqFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <BrandHeader merchant={merchant} />

        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-badge" aria-hidden="true">
              <CalendarClock size={24} strokeWidth={2} color="#fff" />
            </div>
            <h2 className="auth-title">Request a table</h2>
            <p className="auth-sub">
              Send your details and {merchant.businessName} will confirm on WhatsApp.
            </p>
          </div>

          <label className="auth-field">
            <span className="auth-label">Full name</span>
            <input
              className="auth-input"
              type="text"
              autoComplete="name"
              placeholder="Alex Morgan"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Mobile number</span>
            <div className="auth-phone-row">
              <span className="auth-phone-prefix">+91</span>
              <input
                className="auth-input auth-input-phone"
                type="tel"
                inputMode="numeric"
                placeholder="98765 43210"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
              />
            </div>
          </label>

          <div className="auth-field">
            <div className="queue-party-row qjoin-party">
              <span className="auth-label">Party size</span>
              <div className="queue-stepper">
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="Fewer guests"
                  onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                  disabled={partySize <= 1}
                >
                  <Minus size={16} strokeWidth={2.4} />
                </button>
                <span className="queue-stepper-value">{partySize}</span>
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="More guests"
                  onClick={() =>
                    setPartySize((n) => Math.min(merchant.maxPartySize, n + 1))
                  }
                  disabled={partySize >= merchant.maxPartySize}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>
            <span className="merchant-field-hint">
              <Users size={13} strokeWidth={2.3} aria-hidden="true" /> For parties over{" "}
              {merchant.maxPartySize}, please call the restaurant.
            </span>
          </div>

          <ReservationSlotPicker
            slots={merchant.slots}
            date={date}
            time={time}
            minDate={merchant.minDate}
            maxDate={merchant.maxDate}
            hidePastToday
            onDateChange={(next) => {
              setDate(next);
              setError("");
            }}
            onTimeChange={(next) => {
              setTime(next);
              setError("");
            }}
          />

          {merchant.allowNotes ? (
            <label className="auth-field">
              <span className="auth-label">Notes (optional)</span>
              <textarea
                className="auth-input merchant-textarea"
                rows={2}
                placeholder="Birthday, high chair, seating preference…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          ) : null}

          <TurnstileField {...captcha.fieldProps} />

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            className="cta-btn auth-submit"
            disabled={submitting || !captcha.ready}
            onClick={() => void submit()}
          >
            {submitting ? "Sending…" : "Request reservation"}
          </button>
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
