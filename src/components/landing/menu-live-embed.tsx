"use client";

import { ArrowUpRight } from "lucide-react";

/** A real published Froq menu, framed as a phone so it reads as the guest view. */
const MENU_URL = "https://www.froq.io/menu/jimis-burger-goregaon-delivery-exclusive";

export function MenuLiveEmbed() {
  return (
    <div className="am-try-stage">
      <div className="am-try-glow" aria-hidden="true" />

      <span className="am-try-live">
        <i aria-hidden="true" />
        Live menu · Jimi&apos;s Burger, Goregaon
      </span>

      {/* iPhone SE / 8 proportions (375 x 667pt), sized in CSS to fit the screen. */}
      <div className="am-try-device">
        <div className="am-try-phone">
          <span className="am-try-btn am-try-btn--vol" aria-hidden="true" />
          <span className="am-try-btn am-try-btn--vol2" aria-hidden="true" />
          <span className="am-try-btn am-try-btn--power" aria-hidden="true" />
          <div className="am-try-screen">
            <iframe
              className="am-try-frame"
              src={MENU_URL}
              title="Live Froq AI Menu — Jimi's Burger, Goregaon"
              loading="lazy"
              /* The menu's voice search needs the mic once this is served from froq.io. */
              allow="microphone"
            />
          </div>
        </div>
      </div>

      <a className="am-try-open" href={MENU_URL} target="_blank" rel="noopener noreferrer">
        Open the full menu
        <ArrowUpRight size={15} strokeWidth={2.5} />
      </a>
    </div>
  );
}
