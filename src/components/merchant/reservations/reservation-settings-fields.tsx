"use client";

import { Check } from "lucide-react";
import {
  RESERVATION_AUTO_DECLINE_OPTIONS,
  RESERVATION_INTERVAL_OPTIONS,
  RESERVATION_PARTY_SIZE_OPTIONS,
  type ReservationSettings,
} from "@/lib/merchant/reservations";

interface ReservationSettingsFieldsProps {
  value: ReservationSettings;
  onChange: (next: ReservationSettings) => void;
  /** Onboarding shows the booking window only; settings shows every option. */
  compact?: boolean;
}

/** Shared reservation settings form used by settings and onboarding. */
export function ReservationSettingsFields({
  value,
  onChange,
  compact = false,
}: ReservationSettingsFieldsProps) {
  const patch = (partial: Partial<ReservationSettings>) =>
    onChange({ ...value, ...partial });

  return (
    <div className={`queue-hours-fields${compact ? " queue-hours-fields--compact" : ""}`}>
      <div className="queue-hours-times">
        <label className="auth-field">
          <span className="auth-label">Opens</span>
          <input
            className="auth-input"
            type="time"
            value={value.openTime}
            onChange={(e) => patch({ openTime: e.target.value })}
          />
        </label>
        <label className="auth-field">
          <span className="auth-label">Closes</span>
          <input
            className="auth-input"
            type="time"
            value={value.closeTime}
            onChange={(e) => patch({ closeTime: e.target.value })}
          />
        </label>
      </div>

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
          Guests pick a slot every {value.intervalMinutes} minutes between your opening and
          closing times.
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

            <div className="merchant-toggle-row">
              <div>
                <div className="merchant-toggle-label">WhatsApp notifications</div>
                <div className="merchant-toggle-desc">
                  Send confirmations, updates and reminders to guests on WhatsApp.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={value.whatsappEnabled}
                aria-label="WhatsApp notifications"
                className={`merchant-toggle${value.whatsappEnabled ? " on" : ""}`}
                onClick={() => patch({ whatsappEnabled: !value.whatsappEnabled })}
              >
                <span className="merchant-toggle-knob" />
              </button>
            </div>
          </>
        )}
      </div>

      {compact ? null : (
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
            Coming soon: unreviewed requests will be declined automatically after this long.
          </span>
        </label>
      )}
    </div>
  );
}
