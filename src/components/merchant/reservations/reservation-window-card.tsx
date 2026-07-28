"use client";

import { memo, useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import {
  formatTimeLabel,
  formatWindowCountdown,
  reservationWindowStatus,
  type ReservationSettings,
} from "@/lib/merchant/reservations";

interface ReservationWindowCardProps {
  settings: Pick<ReservationSettings, "openTime" | "closeTime">;
  /** Merchant stopped taking requests — overrides the hours. */
  paused?: boolean;
}

/**
 * How much longer guests can book today. Owns its own 1s clock so the ticking
 * countdown never re-renders the bookings list beside it.
 */
export const ReservationWindowCard = memo(function ReservationWindowCard({
  settings,
  paused = false,
}: ReservationWindowCardProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Nothing counts down while paused, so don't keep a timer running.
    if (paused) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [paused]);

  const status = reservationWindowStatus(settings, now);
  const label = paused
    ? "Bookings stopped"
    : status.open
      ? "Bookings close in"
      : "Bookings open in";
  const value = paused ? "Paused" : formatWindowCountdown(status.secondsLeft);
  const meta = paused
    ? "Guests can't request a table"
    : `${formatTimeLabel(settings.openTime)} – ${formatTimeLabel(settings.closeTime)}`;
  const badge = paused ? "paused" : status.open ? "live" : "idle";

  return (
    <div className="panel-card resv-window">
      <span className="resv-window-icon" aria-hidden="true">
        <Clock3 size={18} strokeWidth={2.2} />
      </span>

      <div className="resv-window-copy">
        <span className="resv-window-label">{label}</span>
        <span className="resv-window-value">{value}</span>
        <span className="resv-window-meta">{meta}</span>
      </div>

      <span className={`queue-state-badge queue-state-badge--${badge}`}>
        <span className="queue-state-dot" aria-hidden="true" />
        {paused ? "Paused" : status.open ? "Open" : "Closed"}
      </span>
    </div>
  );
});
