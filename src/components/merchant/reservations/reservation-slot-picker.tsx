"use client";

import { formatTimeLabel, reservationToday } from "@/lib/merchant/reservations";

interface ReservationSlotPickerProps {
  slots: string[];
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  minDate?: string;
  maxDate?: string;
  /** Hide slots already gone for today (public form + same-day bookings). */
  hidePastToday?: boolean;
  dateLabel?: string;
  timeLabel?: string;
}

/** Native date input plus the merchant's bookable slots, shared by every form. */
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
    <>
      <label className="auth-field">
        <span className="auth-label">{dateLabel}</span>
        <input
          className="auth-input"
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </label>

      <div className="auth-field">
        <span className="auth-label">{timeLabel}</span>
        {visibleSlots.length === 0 ? (
          <p className="merchant-field-hint" style={{ margin: 0 }}>
            No slots left for this date. Pick another day.
          </p>
        ) : (
          <div className="resv-slots" role="radiogroup" aria-label={timeLabel}>
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
    </>
  );
}
