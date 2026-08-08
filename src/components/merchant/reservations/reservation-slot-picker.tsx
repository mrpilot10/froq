"use client";

import { formatTimeLabel, reservationToday } from "@/lib/merchant/reservations";

interface ReservationDateFieldProps {
  date: string;
  onDateChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  label?: string;
}

interface ReservationTimeFieldProps {
  slots: string[];
  date: string;
  time: string;
  onTimeChange: (time: string) => void;
  /** Hide slots already gone for today (public form + same-day bookings). */
  hidePastToday?: boolean;
  label?: string;
}

type ReservationSlotPickerProps = ReservationDateFieldProps &
  ReservationTimeFieldProps & {
    dateLabel?: string;
    timeLabel?: string;
  };

/** Native date input, split out so callers can lay it out beside other fields. */
export function ReservationDateField({
  date,
  onDateChange,
  minDate,
  maxDate,
  label = "Date",
  /** Narrow width + label-row spacer so it lines up beside Guests. */
  compact = false,
}: ReservationDateFieldProps & { compact?: boolean }) {
  return (
    <label className={`auth-field${compact ? " auth-field--date-compact" : ""}`}>
      <span className="resv-label-row">
        <span className="auth-label">{label}</span>
        {compact ? <span className="resv-cap resv-cap--spacer" aria-hidden="true">·</span> : null}
      </span>
      <input
        className={
          compact
            ? "auth-input auth-input--date auth-input--date-compact"
            : "auth-input"
        }
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(event) => onDateChange(event.target.value)}
      />
    </label>
  );
}

/** The merchant's bookable slots for the chosen day. */
export function ReservationTimeField({
  slots,
  date,
  time,
  onTimeChange,
  hidePastToday = false,
  label = "Time",
}: ReservationTimeFieldProps) {
  const today = reservationToday();
  const nowMinutes = (() => {
    const parts = new Date().toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [hh, mm] = parts.split(":").map(Number);
    return hh * 60 + mm;
  })();

  const visibleSlots =
    hidePastToday && date === today
      ? slots.filter((slot) => {
          const [hh, mm] = slot.split(":").map(Number);
          return hh * 60 + mm > nowMinutes;
        })
      : slots;

  return (
    <div className="auth-field">
      <span className="auth-label">{label}</span>
      {visibleSlots.length === 0 ? (
        <p className="merchant-field-hint" style={{ margin: 0 }}>
          No slots left for this date. Pick another day.
        </p>
      ) : (
        <div className="resv-slots" role="radiogroup" aria-label={label}>
          {visibleSlots.map((slot) => {
            const active = slot === time;
            return (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={active}
                className={`resv-slot${active ? " active" : ""}`}
                onClick={() => onTimeChange(slot)}
              >
                {formatTimeLabel(slot)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Date above slots — the stacked default used by the merchant-side forms. */
export function ReservationSlotPicker({
  slots,
  date,
  time,
  onDateChange,
  onTimeChange,
  minDate,
  maxDate,
  hidePastToday = false,
  dateLabel = "Date",
  timeLabel = "Time",
}: ReservationSlotPickerProps) {
  return (
    <>
      <ReservationDateField
        date={date}
        onDateChange={onDateChange}
        minDate={minDate}
        maxDate={maxDate}
        label={dateLabel}
      />
      <ReservationTimeField
        slots={slots}
        date={date}
        time={time}
        onTimeChange={onTimeChange}
        hidePastToday={hidePastToday}
        label={timeLabel}
      />
    </>
  );
}
