"use client";

import {
  DEFAULT_QUEUE_STORE_HOURS,
  QUEUE_HOURS_TIMEZONE,
  QUEUE_WEEKDAYS,
  type QueueStoreHours,
} from "@/lib/merchant/queue-hours";

interface QueueHoursFieldsProps {
  value: QueueStoreHours;
  onChange: (next: QueueStoreHours) => void;
  /** Slightly denser layout for onboarding panels. */
  compact?: boolean;
  /** Store-hours step: open/close/days only — autos stay on the queue product step. */
  hideAutos?: boolean;
  /** Queue product step: auto start/close only (store hours were collected earlier). */
  autosOnly?: boolean;
}

export function QueueHoursFields({
  value,
  onChange,
  compact = false,
  hideAutos = false,
  autosOnly = false,
}: QueueHoursFieldsProps) {
  const hours = { ...DEFAULT_QUEUE_STORE_HOURS, ...value };

  const patch = (partial: Partial<QueueStoreHours>) => onChange({ ...hours, ...partial });

  const toggleDay = (day: number) => {
    const has = hours.openDays.includes(day);
    patch({
      openDays: has
        ? hours.openDays.filter((d) => d !== day)
        : [...hours.openDays, day].sort((a, b) => {
            const rank = (d: number) => (d === 0 ? 7 : d);
            return rank(a) - rank(b);
          }),
    });
  };

  const showTimes = !autosOnly;
  const showAutos = autosOnly || !hideAutos;

  return (
    <div className={`queue-hours-fields${compact ? " queue-hours-fields--compact" : ""}`}>
      {showTimes ? (
        <>
          <div className="queue-hours-times">
            <label className="auth-field">
              <span className="auth-label">Opens</span>
              <input
                className="auth-input"
                type="time"
                value={hours.openTime}
                onChange={(e) => patch({ openTime: e.target.value })}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Closes</span>
              <input
                className="auth-input"
                type="time"
                value={hours.closeTime}
                onChange={(e) => patch({ closeTime: e.target.value })}
              />
            </label>
          </div>

          <div className="auth-field">
            <span className="auth-label">Open days</span>
            <div className="queue-hours-days" role="group" aria-label="Open days">
              {QUEUE_WEEKDAYS.map(({ day, short }) => {
                const active = hours.openDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`queue-hours-day${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleDay(day)}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {showAutos ? (
        <div className="queue-hours-autos">
          <div className="merchant-toggle-row">
            <div>
              <div className="merchant-toggle-label">Auto start</div>
              <div className="merchant-toggle-desc">
                Create a live queue when opening hours begin (if none is running).
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hours.autoStart}
              className={`merchant-toggle${hours.autoStart ? " on" : ""}`}
              onClick={() => patch({ autoStart: !hours.autoStart })}
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
          <div className="merchant-toggle-row queue-hours-recommended">
            <div>
              <div className="merchant-toggle-label">
                Auto close
                <span className="queue-hours-rec-badge">Recommended</span>
              </div>
              <div className="merchant-toggle-desc">
                End the live queue after closing time. Does not affect sessions before opening.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={hours.autoClose}
              className={`merchant-toggle${hours.autoClose ? " on" : ""}`}
              onClick={() => patch({ autoClose: !hours.autoClose })}
            >
              <span className="merchant-toggle-knob" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function hoursFromProfile(profile: {
  queueOpenTime?: string;
  queueCloseTime?: string;
  queueOpenDays?: number[];
  queueAutoStart?: boolean;
  queueAutoClose?: boolean;
}): QueueStoreHours {
  return {
    openTime: profile.queueOpenTime ?? DEFAULT_QUEUE_STORE_HOURS.openTime,
    closeTime: profile.queueCloseTime ?? DEFAULT_QUEUE_STORE_HOURS.closeTime,
    openDays: profile.queueOpenDays ?? [...DEFAULT_QUEUE_STORE_HOURS.openDays],
    autoStart: profile.queueAutoStart === true,
    autoClose: profile.queueAutoClose === true,
  };
}

/** Prefer branch-scoped hours; fall back to merchant profile. */
export function hoursFromBranch(
  branch: {
    queueOpenTime?: string;
    queueCloseTime?: string;
    queueOpenDays?: number[];
    queueAutoStart?: boolean;
    queueAutoClose?: boolean;
  } | null | undefined,
  profile?: {
    queueOpenTime?: string;
    queueCloseTime?: string;
    queueOpenDays?: number[];
    queueAutoStart?: boolean;
    queueAutoClose?: boolean;
  },
): QueueStoreHours {
  if (branch) return hoursFromProfile(branch);
  return hoursFromProfile(profile ?? {});
}

export function profilePatchFromHours(hours: QueueStoreHours) {
  return {
    queueOpenTime: hours.openTime,
    queueCloseTime: hours.closeTime,
    queueHoursTimezone: QUEUE_HOURS_TIMEZONE,
    queueOpenDays: hours.openDays,
    queueAutoStart: hours.autoStart,
    queueAutoClose: hours.autoClose,
  };
}
