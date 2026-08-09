"use client";

import Image from "next/image";
import { Reveal } from "./reveal";

const VENUES = [
  {
    id: "casual",
    label: "Casual Dining",
    src: "/landing/venues/casual.jpg",
  },
  {
    id: "fine",
    label: "Fine Dining",
    src: "/landing/venues/fine.jpg",
  },
  {
    id: "cafe",
    label: "Café & Coffee",
    src: "/landing/venues/cafe.jpg",
  },
  {
    id: "qsr",
    label: "Quick Service",
    src: "/landing/venues/qsr.jpg",
  },
] as const;

export function MenuVenues({
  kicker = "Works for",
  title = "Built for every kind of restaurant.",
}: {
  kicker?: string;
  title?: string;
} = {}) {
  return (
    <div className="am-venues">
      <Reveal className="lp-section-head lp-section-head--left am-venues-head">
        <span className="lp-kicker">{kicker}</span>
        <h2 className="lp-h2">{title}</h2>
      </Reveal>

      <div className="am-venues-grid">
        {VENUES.map(({ id, label, src }, i) => (
          <Reveal key={id} className="am-venue" delay={i * 60}>
            <Image
              src={src}
              alt={label}
              fill
              sizes="(max-width: 720px) 50vw, (max-width: 1100px) 25vw, 260px"
              className="am-venue-img"
            />
            <span className="am-venue-label">{label}</span>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
