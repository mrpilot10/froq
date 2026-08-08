"use client";

import { Check } from "lucide-react";
import {
  RESERVATION_AUTO_DECLINE_OPTIONS,
  RESERVATION_GRACE_OPTIONS,
  RESERVATION_INTERVAL_OPTIONS,
  RESERVATION_PARTY_SIZE_OPTIONS,
  type ReservationSettings,
} from "@/lib/merchant/reservations";

interface ReservationSettingsFieldsProps {
  value: ReservationSettings;
  onChange: (next: ReservationSettings) => void;
  /** Onboarding shows the booking window only; settings shows every option. */
  compact?: boolean;
  /**
   * Hide first/last seating. Seating follows Business settings → Branch store
   * timings — not editable here.
   */
  hideSeatingTimes?: boolean;
}

/** Shared reservation settings form used by settings and onboarding. */
export function ReservationSettingsFields({
  value,
  onChange,
  compact = false,
  hideSeatingTimes = true,
}: ReservationSettingsFieldsProps) {
  const patch = (partial: Partial<ReservationSettings>) =>
    onChange({ ...value, ...partial });

  return (
    <div className={`queue-hours-fields${compact ? " queue-hours-fields--compact" : ""}`}>
      {hideSeatingTimes ? null : (
        <div className="queue-hours-times">
          <label className="auth-field">
            <span className="auth-label">First seating</span>
            <input
              className="auth-input"
              type="time"
              value={value.openTime}
              onChange={(e) => patch({ openTime: e.target.value })}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">Last seating</span>
            <input
              className="auth-input"
              type="time"
              value={value.closeTime}
              onChange={(e) => patch({ closeTime: e.target.value })}
            />
          </label>
        </div>
      )}

      <div className="auth-field">
        <span className="auth-label">Reservation interval</span>
        <div className="queue-accept-options">
          {RESERVATION_INTERVAL_OPTIONS.map((minutes) => {
            const active = value.intervalMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                className={`queue-accept-option${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => patch({ intervalMinutes: minutes })}
              >
                {active && <Check size={13} strokeWidth={2.6} />}
                {minutes}m
              </button>
            );
          })}
        </div>
        <span className="merchant-field-hint">
          Guests can request anytime. Slots sit inside branch store timings
          (every {value.intervalMinutes} minutes).
        </span>
      </div>

      <label className="auth-field">
        <span className="auth-label">Maximum party size</span>
        <select
          className="auth-input"
          value={value.maxPartySize}
          onChange={(e) => patch({ maxPartySize: Number(e.target.value) })}
        >
          {RESERVATION_PARTY_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} guests
            </option>
          ))}
        </select>
        <span className="merchant-field-hint">
          Larger groups will be asked to call you instead.
        </span>
      </label>

      <div className="queue-hours-autos">
        <div className="merchant-toggle-row">
          <div>
            <div className="merchant-toggle-label">Allow same-day bookings</div>
            <div className="merchant-toggle-desc">
              Guests can request a table for today, from the next open slot.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.allowSameDay}
            aria-label="Allow same-day bookings"
            className={`merchant-toggle${value.allowSameDay ? " on" : ""}`}
            onClick={() => patch({ allowSameDay: !value.allowSameDay })}
          >
            <span className="merchant-toggle-knob" />
          </button>
        </div>

        {compact ? null : (
          <>
            <div className="merchant-toggle-row">
              <div>
                <div className="merchant-toggle-label">Allow notes</div>
                <div className="merchant-toggle-desc">
                  Show an optional note field for occasions, allergies or seating requests.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={value.allowNotes}
                aria-label="Allow notes"
                className={`merchant-toggle${value.allowNotes ? " on" : ""}`}
                onClick={() => patch({ allowNotes: !value.allowNotes })}
              >
                <span className="merchant-toggle-knob" />
              </button>
            </div>
          </>
        )}
      </div>

      {compact ? null : (
        <>
          <label className="auth-field">
            <span className="auth-label">Arrival grace period</span>
            <select
              className="auth-input"
              value={value.graceMinutes}
              onChange={(e) => patch({ graceMinutes: Number(e.target.value) })}
            >
              {RESERVATION_GRACE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0
                    ? "None — release at reservation time"
                    : `${minutes} minutes`}
                </option>
              ))}
            </select>
            <span className="merchant-field-hint">
              How long after the reserved time to hold their queue slot before marking
              no-show and releasing the position.
            </span>
          </label>

          <label className="auth-field">
            <span className="auth-label">Auto decline after</span>
            <select
              className="auth-input"
              value={value.autoDeclineHours}
              onChange={(e) => patch({ autoDeclineHours: Number(e.target.value) })}
            >
              {RESERVATION_AUTO_DECLINE_OPTIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {hours === 0 ? "Never — I review every request" : `${hours} hours`}
                </option>
              ))}
            </select>
            <span className="merchant-field-hint">
              Unreviewed requests are declined automatically after this long. The
              guest gets a decline notice.
            </span>
          </label>
        </>
      )}
    </div>
  );
}
