"use client";

import { memo } from "react";

export interface QueuePulseItem {
  id: string;
  label: string;
  value: number;
  active?: boolean;
  accent?: boolean;
}

type QueueHeroTone = "open" | "paused" | "closed";

interface QueueStatusHeroProps {
  label: string;
  value: string;
  meta: string;
  badge: string;
  badgeClass: "live" | "paused" | "idle" | "ended";
  tone: QueueHeroTone;
  pulse?: QueuePulseItem[];
  onPulseSelect?: (id: string) => void;
}

/**
 * Same status + pulse composition as Reservations home — queue session state
 * up top, tappable counts underneath.
 */
export const QueueStatusHero = memo(function QueueStatusHero({
  label,
  value,
  meta,
  badge,
  badgeClass,
  tone,
  pulse,
  onPulseSelect,
}: QueueStatusHeroProps) {
  return (
    <div className={`panel-card resv-hero resv-hero--${tone}`}>
      <div className="resv-hero-top">
        <div className="resv-hero-copy">
          <div className="resv-hero-kicker">
            <span className="resv-hero-label">{label}</span>
            <span className={`queue-state-badge queue-state-badge--${badgeClass}`}>
              <span className="queue-state-dot" aria-hidden="true" />
              {badge}
            </span>
          </div>
          <span className="resv-hero-value">{value}</span>
          <span className="resv-hero-meta">{meta}</span>
        </div>
      </div>

      {pulse && pulse.length > 0 ? (
        <div className="resv-hero-pulse" role="group" aria-label="Queue at a glance">
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
