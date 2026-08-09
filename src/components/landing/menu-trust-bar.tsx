"use client";

import { Smartphone, Star, Zap, type LucideIcon } from "lucide-react";

/**
 * PLACEHOLDER — replace with the real count before this goes live.
 * Nothing in the codebase reports this number, so it is not a measured value.
 */
const PARTNER_RESTAURANTS = "5,140+";

const POINTS: { Icon: LucideIcon; title: string }[] = [
  { Icon: Zap, title: "Live in minutes" },
  { Icon: Smartphone, title: "No app for guests" },
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
            <Star size={11} strokeWidth={2.6} fill="currentColor" />
          </i>
        </span>

        <span className="am-trust-stat">
          <strong>{PARTNER_RESTAURANTS}</strong>
          <span className="am-trust-live">
            <i aria-hidden="true" />
            Partners
          </span>
        </span>
      </div>

      <div className="am-trust-points">
        {POINTS.map(({ Icon, title }) => (
          <div key={title} className="am-trust-point">
            <span className="am-trust-point-icon" aria-hidden="true">
              <Icon size={14} strokeWidth={2.3} />
            </span>
            <strong>{title}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
