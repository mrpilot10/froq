"use client";

import { Smartphone, Star, Zap, type LucideIcon } from "lucide-react";

/**
 * PLACEHOLDER — replace with the real count before this goes live.
 * Nothing in the codebase reports this number, so it is not a measured value.
 */
const PARTNER_RESTAURANTS = "5,140+";

const POINTS: { Icon: LucideIcon; title: string; note: string }[] = [
  {
    Icon: Zap,
    title: "Live in minutes",
    note: "Import your PDF menu",
  },
  {
    Icon: Smartphone,
    title: "No app for guests",
    note: "They just scan a QR",
  },
];

const AVATARS = ["AD", "RM", "KI"];

export function MenuTrustBar() {
  return (
    <div className="am-trust">
      <div className="am-trust-proof">
        <span className="am-trust-avatars" aria-hidden="true">
          {AVATARS.map((initials) => (
            <i key={initials}>{initials}</i>
          ))}
          <i className="am-trust-avatars-star">
            <Star size={14} strokeWidth={2.6} fill="currentColor" />
          </i>
        </span>

        <span className="am-trust-stat">
          <span className="am-trust-stat-top">
            <strong>{PARTNER_RESTAURANTS}</strong>
            <span className="am-trust-live">
              <i aria-hidden="true" />
              Partner Restaurants
            </span>
          </span>
        </span>
      </div>

      <div className="am-trust-points">
        {POINTS.map(({ Icon, title, note }) => (
          <div key={title} className="am-trust-point">
            <span className="am-trust-point-icon" aria-hidden="true">
              <Icon size={17} strokeWidth={2.2} />
            </span>
            <span className="am-trust-point-copy">
              <strong>{title}</strong>
              <em>{note}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
