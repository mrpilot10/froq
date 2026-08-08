"use client";

import { memo } from "react";
import {
  formatTimeLabel,
  type ReservationSettings,
} from "@/lib/merchant/reservations";

export interface ReservationPulseItem {
  id: string;
  label: string;
  value: number;
  active?: boolean;
  accent?: boolean;
}

interface ReservationWindowCardProps {
  settings: Pick<ReservationSettings, "openTime" | "closeTime">;
  /** Merchant stopped taking requests. */
  paused?: boolean;
  /** Compact day pulse under the status — usually tappable filters. */
  pulse?: ReservationPulseItem[];
  onPulseSelect?: (id: string) => void;
}

/**
 * Online bookings stay open around the clock. Store timings only set the
 * seating slots guests can pick — they don't shut the request form.
 */
export const ReservationWindowCard = memo(function ReservationWindowCard({
  settings,
  paused = false,
  pulse,
  onPulseSelect,
}: ReservationWindowCardProps) {
  const value = paused ? "Stopped" : "Open";
  const meta = paused
    ? "Guests can't request a booking right now"
    : `Guests can book anytime · seats ${formatTimeLabel(settings.openTime)}–${formatTimeLabel(settings.closeTime)} (store timings)`;
  const badge = paused ? "paused" : "live";
  const tone = paused ? "paused" : "open";

  return (
    <div className={`panel-card resv-hero resv-hero--${tone}`}>
      <div className="resv-hero-top">
        <div className="resv-hero-copy">
          <div className="resv-hero-kicker">
            <span className="resv-hero-label">Online bookings</span>
            <span className={`queue-state-badge queue-state-badge--${badge}`}>
              <span className="queue-state-dot" aria-hidden="true" />
              {paused ? "Paused" : "Open"}
            </span>
          </div>
          <span className="resv-hero-value">{value}</span>
          <span className="resv-hero-meta">{meta}</span>
        </div>
      </div>

      {pulse && pulse.length > 0 ? (
        <div className="resv-hero-pulse" role="group" aria-label="Today at a glance">
          {pulse.map((item) => {
            const interactive = Boolean(onPulseSelect);
            const className = [
              "resv-hero-metric",
              item.active ? "resv-hero-metric--active" : "",
              item.accent ? "resv-hero-metric--accent" : "",
            ]
              .filter(Boolean)
              .join(" ");

            if (!interactive) {
              return (
                <div key={item.id} className={className}>
                  <span className="resv-hero-metric-value">{item.value}</span>
                  <span className="resv-hero-metric-label">{item.label}</span>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={className}
                aria-pressed={item.active}
                onClick={() => onPulseSelect?.(item.id)}
              >
                <span className="resv-hero-metric-value">{item.value}</span>
                <span className="resv-hero-metric-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
